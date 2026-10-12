# Operate purchased API access

This guide starts from the standalone Stellar merchant package and uses its maintained customer application, API client and merchant agent host. Replace example directories and IDs with the selections returned by your installation.

## 1. Install the selected package

Use the release's original source archive and its published SHA-256. The maintained runtime installer prepares one exact archive before installing its declared dependencies:

~~~sh
starforge runtime-install prepare \
  --dir /srv/starforge/runtimes/api-customer \
  --archive /srv/starforge/releases/merchant.tgz \
  --sha256 RELEASE_ARCHIVE_SHA256 \
  --native --operator --feature mcp

starforge runtime-install install \
  --dir /srv/starforge/runtimes/api-customer

starforge runtime-install inspect \
  --dir /srv/starforge/runtimes/api-customer --source
~~~

The original runtime requires Linux, Node 22.16 or later, Python 3.11 or later, npm and `flock`. The `native` and `mcp` selections cover the original Buyer/payment and agent runtime; include any additional features used by the merchant application you are operating. The installer retains the selected dependency declarations. Its `resume` command continues the same interrupted installation.

If `starforge` is not already on your path, invoke the received package's original dispatcher with Node:

~~~sh
node /absolute/received-package/source/stellar/scf-starforge-20261009/distribution/cli.mjs runtime-install --help
~~~

The installed runtime's original dispatcher is:

~~~sh
starforge runtime-install run \
  --dir /srv/starforge/runtimes/api-customer -- COMMAND ARGUMENTS
~~~

Use that form for the commands below when the runtime owns your selected dependencies. `starforge registrations --command merchant-api-pass` identifies this product's source-owned contribution. `starforge source` identifies the selected package. Keep the existing merchant and customer data directories outside a replaceable runtime directory.

## 2. Configure a customer once

For existing purchased access, create one private customer directory and its separate configuration:

~~~sh
mkdir -m 700 /srv/starforge/api-customer

starforge runtime-install run \
  --dir /srv/starforge/runtimes/api-customer -- \
  api-pass-workspace configure \
  --directory /srv/starforge/api-customer \
  --out /srv/starforge/api-customer-config.json \
  --claim-env SF101_CLAIM_TOKEN
~~~

The claim environment name identifies an existing credential supplied by the original host. Provide its value through that host's normal environment configuration. The browser selects the declared name. The configuration command creates its file exclusively, and the customer checks the same configuration when reopened.

To use original purchase preparation, execution, payment recovery and Buyer reports, select the retained native authority paths explicitly:

~~~sh
starforge runtime-install run \
  --dir /srv/starforge/runtimes/api-customer -- \
  api-pass-workspace configure \
  --directory /srv/starforge/api-customer-with-purchases \
  --out /srv/starforge/api-customer-purchases-config.json \
  --runtime /absolute/selected-source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli \
  --buyer-workspace /srv/starforge/original-buyer-workspace \
  --buyer-state /srv/starforge/original-buyer-state \
  --inbox /srv/starforge/original-purchase-inbox \
  --python /usr/bin/python3 \
  --claim-env SF101_CLAIM_TOKEN
~~~

Use the actual `sourceRoot` reported by runtime inspection in place of `/absolute/selected-source`. The original Buyer workspace must already contain its own operator selection. Keep its state and Inbox directories separate from the customer directory.

## 3. Open the browser and its local agent connection

Start the same configured workspace with an optional private agent directory:

~~~sh
starforge runtime-install run \
  --dir /srv/starforge/runtimes/api-customer -- \
  api-pass-workspace serve \
  --config /srv/starforge/api-customer-config.json \
  --agent-directory /srv/starforge/api-customer-agent \
  --port 0
~~~

Use the private startup URL returned by the running application. The customer listens on IPv4 loopback. The access capability stays in the original private launch record. The browser's **Lock** action ends the current browser session while keeping saved work.

For a managed launch, choose **Applications → API-pass customer** and enter the same configuration, customer directory and optional agent directory. Select the intended approval mode, save and review the application, then start it. The maintained Applications controller reviews the selected product source and retained setup, starts its original child and authenticates the actual customer listener before exposing **Open**.

Purchase approval uses the original selected channel:

| Mode | Behavior |
| --- | --- |
| `auto` | Selects the original browser capability when available, otherwise the original terminal channel. |
| `browser` | Uses the selected original broker and its approval panel. |
| `terminal` | Keeps approval in the original managed terminal. |

Applications retains its managed terminal for this product. Stop a managed application through its original **Stop** action; that action drains its owned customer and native tasks before releasing the workspace.

### Generated local agent settings

Startup creates or reopens these files below the agent directory:

| Path | Purpose |
| --- | --- |
| `setup.json` | Original customer directory and workspace UUID. |
| `connection.json` | The `customer` alias, original launch path and approved input/purchase handles. |
| `merchant/merchant-mcp.json` | Original merchant host configuration for this customer. |
| `client-settings.json` | Ready-to-import local MCP settings for `starforge-api-customer`. |
| `operations/` | Retained exact native commands and observed outcomes. |
| `exports/` | Complete response, review, payment, Buyer-report and customer-history files. |
| `reads/` | Original retained-file read snapshots. |

Load `client-settings.json` through the local agent host's normal MCP configuration. The generated entry selects the installation's original stdio host and the current Node executable. It identifies the merchant configuration through `MCP_MERCHANT_CONFIG`.

Reopening the customer preserves existing file handles, purchase handles, merchant settings, saved commands and other named servers in the client settings. Its own named server follows the selected installation. An interrupted setup resumes in that same directory.

## 4. Connect or reopen original access

In the browser, **Connect a pass** uses the original gateway origin, order reference, purchased-plan SHA-256 and allowed claim environment name. Refresh the pass to read the merchant's actual routes and unit costs, purchased allowance, consumed units, reserved units and remaining allowance.

If you have the full original saved purchase, use **Open saved purchase**. This reopens its original customer metadata, order, intent and Buyer/Inbox lineage. It enables the original purchase review, recovery and history controls beside the same pass.

For a new purchase, import the merchant's actual handoff, prepare and review its original terms, then execute that saved review through the selected approval channel. Recover or finalize the same purchase if its reply is interrupted. The [customer guide](../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-access/workspace/README.md) describes each original purchase and payment-recovery action.

The agent operates the same customer records. Use `merchant_api_pass_workspaces`, `open`, `passes` and `pass` to select the actual workspace and profile IDs. Complete history methods retain one workspace revision across their pages.

## 5. Save and operate an exact API request

Select a route from the purchased plan. Save its original request ID, ordered query pairs, content type and complete body before queuing execution. The plan supplies the actual route method, path and unit cost.

For a merchant that declares the numeric analysis application, an example body is:

~~~json
{"values":[2,4,6,8],"window":2}
~~~

Use only a route and body accepted by the actual purchased plan. **Send saved request** uses those retained inputs. The request page shows its native task, response status, byte count and digest.

A request ID identifies one intended operation. Reopen that same ID after an interrupted response. The original merchant returns the saved result or the current in-flight/recovery state. Changing its inputs under the same ID returns a conflict. Prepare a new ID for a new intended call.

If you have the original request identity but lost its local response, use the workspace's request-adoption and recovery action. This retains a local call record for the original remote request and asks the original client for its existing result.

The request editor retains unfinished input separately from committed requests. Switching body modes preserves the saved text and file selection. Review controls use the exact selected saved review, and complete history can locate older tasks outside the recent activity list.

## 6. Use the installed client and durable operations

For a Node client or CLI, run the original authenticated MCP HTTP host against the generated configuration:

~~~sh
starforge runtime-install run \
  --dir /srv/starforge/runtimes/api-customer -- \
  merchant-mcp serve \
  --config /srv/starforge/api-customer-agent/merchant/merchant-mcp.json \
  --port 3211 --token-env MCP_ACCESS_TOKEN
~~~

Supply the existing MCP access secret through its named process environment. Use the actual endpoint returned by the host. The examples below use `http://127.0.0.1:3211/mcp`.

Read the configured customer:

~~~sh
starforge merchant-api-pass read \
  --url http://127.0.0.1:3211/mcp \
  --workspace customer --workspace-id ORIGINAL_WORKSPACE_UUID \
  --kind passes --token-env MCP_ACCESS_TOKEN
~~~

The private host connection can declare hash-pinned input handles of kind `handoff`, `body` and `approved-request`. Existing purchase handles bind the original directory, exact `customer.json` hash, intent ID and order reference. The [complete client contract](../../stellar-forge/mcp-merchant-operator/API_PASS_WORKSPACES.md) defines those declarations. Generated setup preserves them when the customer reopens.

### Retain a command before dispatch

For one saved call, put the current workspace revision and actual IDs in a private JSON file:

~~~json
{
  "expectedRevision": 12,
  "profileId": "ORIGINAL_PROFILE_UUID",
  "kind": "recover",
  "callId": "ORIGINAL_CALL_UUID"
}
~~~

Prepare the exact operation once:

~~~sh
starforge merchant-api-pass prepare \
  --directory /srv/starforge/api-client-operations/recover-original \
  --url http://127.0.0.1:3211/mcp \
  --workspace customer --workspace-id ORIGINAL_WORKSPACE_UUID \
  --kind enqueue --request /srv/starforge/inputs/recover-call.json \
  --token-env MCP_ACCESS_TOKEN

starforge merchant-api-pass run \
  --directory /srv/starforge/api-client-operations/recover-original
~~~

Preparation retains the exact endpoint, workspace UUID, normalized arguments and one generated operation ID. Repeat the same preparation or `run` using the same directory. The client first reads the host's operation journal and returns a durable original result when available.

An accepted queue receipt identifies a task. Read that exact task through `read --kind task` with its profile and task IDs, or inspect the complete profile history. The task's terminal state describes the native result; queue acceptance alone is not task completion.

After an interrupted reply:

~~~sh
starforge merchant-api-pass reconcile \
  --directory /srv/starforge/api-client-operations/recover-original

starforge merchant-api-pass reopen \
  --directory /srv/starforge/api-client-operations/recover-original
~~~

`reconcile` reads the original host receipt. `reopen` reads the retained local request/result. If the operation remains unobserved, `run` can send that same saved action. Keep its directory, operation ID and request bytes. A later unrelated edit that changes the required revision is handled by the original workspace's current review and conflict response.

The same durable client supports pass connection, saved-purchase attachment, exact request preparation, original queue cancellation, approval decisions and complete file capture. Its adjacent TypeScript declarations expose the full original tool contract.

## 7. Capture and receive complete files

Capture one complete file under a stable export ID. A response selection needs its original call ID:

~~~json
{
  "exportId": "original-response",
  "selection": {
    "kind": "response",
    "callId": "ORIGINAL_CALL_UUID"
  },
  "expectedSha256": "REVIEWED_RESPONSE_SHA256"
}
~~~

Use the preceding `prepare` / `run` sequence with `--kind capture` and a separate retained operation directory. Once captured, inspect and download the exact export:

~~~sh
starforge merchant-api-pass inspect-export \
  --url http://127.0.0.1:3211/mcp \
  --workspace customer --workspace-id ORIGINAL_WORKSPACE_UUID \
  --export-id original-response --token-env MCP_ACCESS_TOKEN

starforge merchant-api-pass download \
  --url http://127.0.0.1:3211/mcp \
  --workspace customer --workspace-id ORIGINAL_WORKSPACE_UUID \
  --export-id original-response \
  --directory /srv/starforge/receiving/original-response \
  --manifest-sha256 REVIEWED_MANIFEST_SHA256 \
  --token-env MCP_ACCESS_TOKEN

starforge merchant-api-pass reopen-download \
  --directory /srv/starforge/receiving/original-response \
  --workspace customer --workspace-id ORIGINAL_WORKSPACE_UUID \
  --manifest-sha256 REVIEWED_MANIFEST_SHA256
~~~

Download resumes the verified prefix and reopens an expired read against the same immutable manifest. Offline reopening rehashes the complete received files. The original reader and download engines retain exact chunk offsets, lengths and final SHA-256 values.

| Capture | Selection | Complete payload |
| --- | --- | --- |
| Response | `callId` | `response.bin` |
| Purchase review | `profileId` | `purchase-review.json` |
| Authenticated payment record | `profileId`, original export task ID | `payment-proof.json` |
| Original Buyer report | `profileId`, original report task ID | `buyer-history.html` |
| Customer history | `profileId` | `customer-history.json` |

Each retained export includes its complete payload and `api-pass-export.json`. Existing export IDs reopen their original bytes. Choose a new export ID for a later changed history. Captured files remain readable after the customer service closes; the MCP file host can reopen them from its own original storage.

## 8. Stop, reopen and upgrade

| Interrupted or changed surface | Continue from |
| --- | --- |
| Browser session | Same customer configuration and saved profile/request. |
| Queued or running native work | Original task ID and complete task history. |
| API response | Same original request ID and retained call. |
| Purchase response | Original purchase directory, intent and saved review. |
| Local output lost after payment | Original approved request, selected transaction and authenticated Inbox recovery. |
| Agent command reply | Same prepared operation directory and host operation ID. |
| File download | Same receiving directory, manifest and verified prefix. |
| Generated agent setup | Same customer and agent directories. |
| Runtime installation | Same install directory and original installer resume state. |
| Runtime upgrade | A fresh installed runtime plus the unchanged private customer and native authority directories. |

Close the original customer and host through their normal shutdown or managed Stop actions. The customer drains its queue and native children; closing the MCP adapter drains its accepted requests while leaving the customer under its original owner.

Preserve the full customer directory, configuration, agent directory, prepared client operations, completed exports and selected Buyer/Inbox directories. Merchant allowance/application state remains with its original merchant owner and uses that workflow's original backup/recovery. Moving a source runtime does not make a partial copy of these journals into a complete operating backup.

When upgrading, select the new maintained source through the original runtime installer and Applications review. Reopen the same customer and agent directories. Their workspace, profile, call, task, purchase and export IDs continue from retained state.

## Source and package integration

This standalone product uses the maintained API customer source and its existing merchant host. The package contribution registers `merchant-api-pass` and the typed client, operation, setup and customer-agent exports. The host advertises this tool family only when its private API customer connection is configured, and loads its runtime on first use.

The underlying source is available in this repository:

- [Customer application and original lifecycle](../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-access/workspace/README.md).
- [Typed agent client and complete receiving](../../stellar-forge/mcp-merchant-operator/API_PASS_WORKSPACES.md).
- [Maintained runtime installation](../../stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs).
- [Original standalone merchant operations](../merchant-workspace/OPERATING.md).

Authored by TokenJunkieLabs.
