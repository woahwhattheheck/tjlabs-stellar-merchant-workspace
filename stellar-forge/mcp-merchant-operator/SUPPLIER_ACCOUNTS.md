# Supplier accounts through Merchant MCP

Operate the original supplier-account workspace remotely through the maintained Merchant host. The provider and typed client cover the complete account workflow: read the current source, edit its full account and binding inventory, inspect an immutable review, save that exact review, recover an interrupted save, inspect quota usage, download a complete report or backup, and receive the original history on another host.

The installed provider is **supplier-accounts**. Its 21 tools use the **merchant_supplier_account_** prefix. The installed client command is **supplier-account-client**. The original browser, native CLI and managed Applications entry use the same source, SQLite workspace and account ledgers.

## Install and declare the actual workspaces

Use the [supplier-accounts selected product](../../products/supplier-accounts/OPERATING.md). Its recipe includes the Merchant server, stdio bridge, client-configuration command, provider, typed client, receiving engine and MCP runtime profile. The native account workspace requires Node 22.16 or newer and Linux util-linux flock. Provision the declared MCP profile through the existing runtime installer when running the Merchant host.

A private host connection declares existing workspace directories, their original upstream files, and optional complete receiving inputs. Paths resolve relative to the connection file. Precreate owned private workspace directories and place the merchant's actual upstream source in its private operating directory:

~~~json
{
  "schema": "stellar-forge.supplier-account-workspace-connection.v1",
  "workspaces": {
    "operations": {
      "label": "Supplier account operations",
      "directory": "./supplier-workspace",
      "upstreamsFile": "./upstreams.json",
      "inputs": {}
    },
    "receiving": {
      "label": "Receiving workspace",
      "directory": "./received-workspace",
      "upstreamsFile": "./received-upstreams.json",
      "inputs": {
        "handover": {
          "path": "./handover/workspace-backup.json",
          "bytes": 37257,
          "sha256": "REPLACE_WITH_ACTUAL_COMPLETE_FILE_SHA256",
          "provenance": {
            "source": "Original supplier-account workspace export"
          }
        }
      }
    }
  }
}
~~~

For the optional receiving input, replace the example byte count and digest with the actual downloaded file's identity. The reader requires the complete positive byte count and a lowercase 64-character SHA-256. Input contents stay closed until an explicit receive call selects that alias and hash. Each workspace directory has exactly one alias. Paths and input registration remain in this host-owned file.

Give the connection and backup inputs mode 0600; use owned mode 0700 directories. The reader requires regular single-link files, verifies the same descriptor throughout a read and checks the complete input hash.

Create setup options:

~~~json
{
  "directory": "/private/merchant/supplier-mcp",
  "connection": "/private/merchant/supplier-account-connection.json",
  "name": "Supplier account operations"
}
~~~

Initialize and run the maintained host:

~~~sh
npx --no-install starforge merchant-mcp providers inspect supplier-accounts
npx --no-install starforge merchant-mcp init-provider supplier-accounts \
  --options /private/merchant/supplier-mcp-setup.json

npx --no-install starforge merchant-mcp serve \
  --config /private/merchant/supplier-mcp/merchant-mcp.json \
  --port 3211 \
  --token-env MCP_ACCESS_TOKEN
~~~

Setup can select an existing **releaseStore** in its options. It creates the standard Merchant configuration and private exports directory, then validates the provider through the original host. The native account handle opens only when requested.

Set **MCP_ACCESS_TOKEN** in the host and client environments through the existing private environment mechanism. Use the actual printed MCP endpoint. The client accepts HTTPS endpoints and loopback HTTP endpoints. The maintained stdio bridge and client-config commands expose the same selected tools to a local MCP client.

## Read, prepare and save

Inspect exact argument contracts without opening a connection, then open one configured workspace:

~~~sh
npx --no-install starforge supplier-account-client tools

npx --no-install starforge supplier-account-client call open \
  --url http://127.0.0.1:3211/mcp \
  --workspace operations
~~~

Retain the returned **workspaceId**. Every source-changing request includes this identity. Separate CLI invocations carry it in request JSON. A programmatic client remembers the identity returned by its own open call and supplies that pin when the caller omits it.

Read the complete editable proposal:

~~~sh
npx --no-install starforge supplier-account-client call proposal \
  --url http://127.0.0.1:3211/mcp \
  --workspace operations \
  > /private/merchant/account-proposal.json
~~~

The proposal contains workspaceId, sourceSha256, the complete accounts array and every binding assignment. Edit that full JSON and add an optional note. Accounts retain their original alias, quota directory, account label and credential environment reference. An assignment with a null account removes its membership. The original compiler validates allowances and requires the complete binding inventory.

Prepare once:

~~~sh
npx --no-install starforge supplier-account-client call prepare \
  --url http://127.0.0.1:3211/mcp \
  --workspace operations \
  --args /private/merchant/account-proposal.json
~~~

The result names the original **change**: its ID, revision, status, full review and reviewSha256. Inspect the full account and binding differences, then select that exact review for saving. Write the actual returned identities into an apply-request file:

~~~json
{
  "workspaceId": "ACTUAL_WORKSPACE_UUID",
  "id": "ACTUAL_CHANGE_UUID",
  "revision": 0,
  "reviewSha256": "ACTUAL_REVIEW_SHA256"
}
~~~

~~~sh
npx --no-install starforge supplier-account-client call apply \
  --url http://127.0.0.1:3211/mcp \
  --workspace operations \
  --args /private/merchant/apply-reviewed-account-change.json
~~~

Use the actual revision returned by the selected change. The original writer validates the source digest, file identity, review hash and current revision before publishing its retained bytes. Saved account configuration becomes active on the merchant's next normal start. Existing quota directories, dispatch reservations, usage and cooldowns keep their original identity.

## Recover the same original operation

Every native operation result retains state, operation, workspaceId, the actual current change, and any original error code. A **NATIVE_ERROR** result is printed completely before the CLI's unsuccessful exit. A large completed change keeps its ID, status, revision and review hash inline and identifies the complete retained report route.

| Current native state | Continue the original work |
| --- | --- |
| APPLIED | Reopen the same change; its saved outcome remains authoritative. |
| APPLYING | Read the current revision and call **recover** with the same ID and original review hash. |
| CONFLICT | Read a fresh proposal and call **prepareRebase** with the old change ID and current source SHA. Review the new continuation before saving. |
| PREPARED | Read and apply the selected original review, or cancel its current revision. |
| An applied change needs restoration | Call **prepareRestore** with that change ID and the current source SHA, then review and apply the returned restoration. |
| The HTTP response was interrupted | Reopen the original change or retained export by ID. For a lost prepare response, inspect actual history and the source-bound review before continuing. |

The client sends each requested source effect once. Preparation creates a new review, so repeating prepare creates another change. Explicit apply and recover use the native existing-outcome behavior for an already-applied change. Source-conflict and receiving-file rules remain in the original workspace engine.

Receiving has its own structured result. It retains the selected input hash, original backup hash, native receiving result, reopened workspace and any receiving or reopen error. If receiving completed before a reopen error, the received identity remains in that result.

## Read the whole history

**history** returns newest-first complete change records, total, offset, nextOffset and a native history token. The token includes the original workspace identity and event sequence. Changes, cancellation, rebase and receiving alter the pinned view.

The client pins the first returned token for every following page and rejects changed history:

~~~sh
npx --no-install starforge supplier-account-client pages history \
  --url http://127.0.0.1:3211/mcp \
  --workspace operations \
  > /private/merchant/account-history.jsonl
~~~

Each output line is a complete page. An interrupted walk retains its last offset and token; supply those values in an args file to continue that unchanged view. If history changed, start a fresh walk. The full report export provides a stable whole-history snapshot.

**state** reads current source, configuration and ledger identities. **quota** reads the original shared quota snapshots. **change** reads a complete original review by ID. A record beyond the inline limit remains available in its complete native export.

## Retain and download complete snapshots

Select a stable export ID for the snapshot:

~~~json
{
  "workspaceId": "ACTUAL_WORKSPACE_UUID",
  "exportId": "supplier-handover-20261012"
}
~~~

~~~sh
npx --no-install starforge supplier-account-client call exportBackup \
  --url http://127.0.0.1:3211/mcp \
  --workspace operations \
  --args /private/merchant/backup-selection.json

npx --no-install starforge supplier-account-client inspect \
  --url http://127.0.0.1:3211/mcp \
  --workspace operations \
  --export-id supplier-handover-20261012

npx --no-install starforge supplier-account-client download \
  --url http://127.0.0.1:3211/mcp \
  --workspace operations \
  --export-id supplier-handover-20261012 \
  --manifest-sha256 ACTUAL_RETURNED_MANIFEST_SHA256 \
  --out /private/merchant/handover
~~~

The existing downloader retains **supplier-account-manifest.json**, the whole **workspace-backup.json** and its durable download checkpoint. It verifies the exact manifest SHA, complete byte length and file SHA. Resume with the same endpoint, alias, export ID and private output directory after interruption. Chunk continuation uses the original retained-file engine and does not rerun the native exporter.

**exportReport** retains operator-report.json with every review, outcome and event. **exportBackup** retains the original receiving format, complete source bytes and every original change row. Repeating an export ID returns its existing immutable snapshot; choose a new ID for a later snapshot.

Complete native payloads can be up to 72 MiB at the receiving layer; the original backup engine applies its own 64 MiB data limit first. Inline replies are limited to 1 MiB and requests to 2 MiB. The maintained chunk reader supports up to 196,608 bytes per call.

## Receive and continue on another host

Transfer the complete backup, matching upstream source, selected installed product, and original merchant quota-ledger handover. The account backup contains account identities and source/change history; the merchant handover carries the live quota ledgers.

Declare the received backup as a host input with its actual bytes and SHA. Select the matching upstream file in the receiving alias and open the new or empty workspace. Retain that target's actual workspaceId for this request:

~~~json
{
  "workspaceId": "ACTUAL_EMPTY_TARGET_WORKSPACE_UUID",
  "inputId": "handover",
  "expectedSha256": "ACTUAL_HOST_INPUT_SHA256"
}
~~~

~~~sh
npx --no-install starforge supplier-account-client call receiveWorkspace \
  --url http://127.0.0.1:3211/mcp \
  --workspace receiving \
  --args /private/merchant/receive-account-workspace.json
~~~

The provider drains earlier work for that alias, closes its native handle and retained reads, invokes the original receiver and reopens the actual receiving workspace. The result names the incoming original workspace ID. Use that returned identity for subsequent writes.

Receiving the same backup again preserves later history when the selected upstream content still matches the incoming backup. After a saved source change, the original receiver requires matching source bytes; receive a later backup for that changed source. The original receiver rejects an unrelated archive over an existing nonempty history. Pending reviews naming the sending file follow the original receiving-file rebase rules; applied outcomes and later corrections retain their IDs.

Read the received state and every history page, continue the intended pending review, prepare/apply the receiving correction, and export the later report through the same tools. Closing an alias drains accepted work and releases this provider's native and retained-file descriptors.

## Typed client

The package's **./clients/supplier-accounts** export includes TypeScript declarations. A native caller may supply an existing Merchant client with its stable endpoint identity. From this source directory:

~~~js
import { createSupplierAccountClient } from './supplier-account-client.mjs';

const accounts = await createSupplierAccountClient({
  url: process.env.MERCHANT_MCP_URL,
  workspace: 'operations',
  tokenEnv: 'MCP_ACCESS_TOKEN'
});

await accounts.open();
const proposal = await accounts.proposal();
for await (const page of accounts.pages('history', { limit: 50 })) {
  consumeCompleteHistoryPage(page);
}
const retained = await accounts.exportBackup({ exportId: 'daily-handover-20261012' });
await accounts.downloadExport({
  exportId: retained.exportId,
  expectedManifestSha256: retained.manifestSha256,
  directory: '/private/handover'
});
await accounts.close();
~~~

The client exposes every declared tool as a typed method. Complete prepared-change, receiving and native-error results remain available to the caller. Signals and timeouts use the maintained Merchant transport, and download checkpoints use the existing retained downloader.

## Original source and receiving lineage

The provider uses the original [account model and planner](../../stellar/scf-starforge-20261009/sf30-seller-sdk/supplier-quota/workspace/README.md), existing [Merchant provider contract](./provider-contract.mjs) and [retained downloader](./retained-download.mjs). Its native model additions are read-only identity and token-pinned history access. Source writing, reviews, recovery, quota accounting and native backup receiving remain in the original engine.

The [original 84EB receiving package](../../stellar/scf-starforge-20261009/sf30-seller-sdk/supplier-quota/receiving/original-workspace-84eb/RECEIVING.md) retains its completed 29-phase account/browser/CLI/Applications journey and original source hashes. It travels with the selection alongside this remote operating interface.

## Run the native provider/client receiving journey

The source-owned receiving command opens the original SQLite engine in a new private directory, operates real native account reviews, preserves original error identities, checks paged history, resumes a complete backup download, receives that backup through its pinned host input and continues the received account history:

~~~sh
node stellar-forge/mcp-merchant-operator/receiving/supplier-accounts-operator-native.mjs \
  /private/receiving/supplier-account-merchant
~~~

The directory must be new. The journey reuses the original public Routescan binding with its own private quota directory and performs its account operations locally. It retains the original backup, complete downloaded receiving files, later report and receiving-result.json. The provider and typed client call the original native workspace directly; host HTTP configuration is covered by the operating sequence above.
