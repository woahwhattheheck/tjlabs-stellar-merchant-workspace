# Tenderly simulation workspace

Operate a saved Tenderly merchant from Applications, its browser and merchant tools at the same time. They share one live server, profile selection, operation controller, provider observations and complete responses. The selected product also contains the original Node and Python customers and the retained simulation analysis workspace.

| Entry | Work it supports |
| --- | --- |
| Source selection `tenderly-simulation-workspace` | Installed merchant, Applications, typed tools, customers and analysis |
| `starforge tenderly` | Original plan, product preparation and merchant commands |
| `starforge tenderly-workspace` | Original browser server and private live connection |
| Applications → Tenderly simulation merchant | Review, save, start, open, stop and reopen the same server |
| `merchant_tenderly_*` | 26 tools over the original profile, merchant and saved provider state |
| `./partners/tenderly/workspace/connection` | Typed Node attachment to that listener |
| `./partners/tenderly/workspace/mcp` | Typed merchant configuration, tool arguments and operator class |
| `starforge tenderly-customer` | Customer selection, native purchase, recovery and complete export |
| `starforge tenderly-analysis` | Retained result receiving, comparison, review and complete source export |

## Build and install

Build the selected source from the maintained repository at the complete commit that contains this guide:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace \
  --ref FULL_40_CHARACTER_COMMIT \
  --selection tenderly-simulation-workspace \
  --out /absolute/private/tenderly-build
~~~

The manifest retains the source selection, command and export declarations, browser route maps, complete original components and discovered static dependencies. Continue the same output with the builder's --resume option after an interruption; --status reads its retained operation.

Install the resulting archive with its actual manifest digest:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/private/tenderly-runtime \
  --archive /absolute/private/tenderly-build/ACTUAL_ARCHIVE.tgz \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/private/tenderly-runtime
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/private/tenderly-runtime --load
~~~

Use the resulting READY runtime with Node 22.16 or later. Inspection returns its actual sourceRoot and dependencyRoot. Bind the following commands to that exact private installation:

~~~sh
TENDERLY_RUNTIME=/absolute/private/tenderly-runtime
TENDERLY_SOURCE_ROOT=/ACTUAL_SOURCE_ROOT_RETURNED_BY_INSPECT
export TENDERLY_SOURCE_ROOT
starforge() {
  node "$TENDERLY_SOURCE_ROOT/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" \
    run --dir "$TENDERLY_RUNTIME" -- "$@"
}
~~~

The local function selects the READY installation for every starforge example below. The JavaScript examples use the same exported sourceRoot, so they resolve its actual installed modules and adjacent dependencies from any private customer directory. A project that installs the archive as its own npm dependency can instead use the published @tokenjunkielabs/starforge-merchant exports and their TypeScript declarations.

The original Python customer and buyer package travel with the source; select their installed Python runtime for Python customer operation. The full build, installation and runtime-transfer references remain under source/stellar/scf-starforge-20261009/distribution in the package. Keep private operating data outside the software installation.

## Open one merchant through Applications

Attach the READY runtime to the existing Runtime Workspace if needed:

~~~sh
starforge runtime-workspace attach \
  --workspace /absolute/private/runtime-workspace \
  --runtime /absolute/private/tenderly-runtime \
  --label "Tenderly simulation operations"
~~~

In **Applications → New application**, choose **Tenderly simulation merchant**. Select the complete private Tenderly workspace, or a new directory beneath an existing private parent. Select an optional original merchant-plan file and the original HTTPS facilitator for its Stellar payment terms. Port 0 selects an available loopback port. The private environment JSON supplies the provider access-key and stable operation-key environment names declared in that plan.

**Review application**, save it, review the start and **Start reviewed application**. Review retains the original workspace identity-file SHA-256, exact initial-plan bytes, environment reference, facilitator and chosen runtime. **Open application** opens the actual private browser URL returned by that process.

The server writes tenderly.connection.json with mode 0600 inside the operator-owned mode 0700 workspace. It contains that listener's instance ID, original workspace identity, loopback origin and private credential. Applications records its identity and connection hash with the managed operation. The server holds the listener reservation for its complete lifetime; another owner opening that same directory receives the current-owner conflict and can use managed attachment.

All product activity remains explicit. In the browser, review and save the profile, open or prepare it, issue the selected customer request and start its merchant. **Drain and stop merchant** retains the selected profile and operation state. **Stop application** drains and closes the entire original server and retires its private connection. Reopening the application retains workspace identity and returns a new listener instance and URL.

A direct native launch exposes the same connection:

~~~sh
starforge tenderly-workspace \
  --state /absolute/private/tenderly-operator \
  --plan /absolute/private/tenderly-plan.json \
  --port 0
~~~

For an existing workspace, omit --plan to select its saved profiles in the browser. The original --facilitator and reviewed identity/plan options are described in the retained [Applications guide](../../stellar/scf-starforge-20261009/partners/tenderly-stellar-pilot/workspace/APPLICATIONS.md).

## Attach merchant tools to the live application

Save a private host connection such as /absolute/private/tenderly-host.json:

~~~json
{
  "schema": "stellar-forge.tenderly-workspace-connection.v1",
  "workspaces": {
    "evm": {
      "label": "EVM simulation operations",
      "directory": "/absolute/private/tenderly-operator",
      "mode": "managed"
    }
  }
}
~~~

Managed mode attaches to the already running Applications listener. The plan, facilitator and provider environment come from that application. The agent uses the declared alias and original record IDs.

The existing owned mode remains the default when mode is omitted. An owned alias may declare plan and facilitator and starts its own original server when opened. Its MCP launch environment supplies the plan's provider and stable operation-key references. Select one ownership mode for each private directory.

Initialize the original merchant host using a private options JSON:

~~~json
{
  "directory": "/absolute/private/tenderly-mcp",
  "connection": "/absolute/private/tenderly-host.json",
  "name": "Tenderly simulation operations"
}
~~~

~~~sh
starforge merchant-providers inspect tenderly-workspaces
starforge merchant-providers init tenderly-workspaces \
  --options /absolute/private/tenderly-mcp-setup.json
starforge merchant-mcp-stdio \
  --config /absolute/private/tenderly-mcp/merchant-mcp.json
~~~

To extend an existing host, set its tenderlyWorkspaceConnection to the private host connection filename. readMerchantConfig returns the normalized configuration directly; tenderlyWorkspaces contains the loaded aliases. Existing merchant bindings remain in that configuration.

Call merchant_tenderly_workspaces, then merchant_tenderly_open with {"workspace":"evm"}. Keep the actual instanceId and original workspaceId. The returned browser URL addresses the same model as Applications. merchant_tenderly_status refreshes that live state; the workspaces list contains the last observed state and observation time for managed attachments.

| Action | Managed mode | Owned mode |
| --- | --- | --- |
| Open alias | Attach to the saved application's server | Start the original server |
| Start/stop merchant | Operate that server's selected merchant | Operate the same owned model |
| Close with current instanceId | Drain tool calls and temporary reads; return DETACHED | Drain tools, reads and server; return CLOSED |
| Application stop/reopen | Previous clients detect retired/replaced instance | Select the application's mode after closing the owned server |
| Reconnect | Open the current private connection | Open the retained workspace with a new listener |

After Applications restarts, close the old attachment with its recorded instanceId and open the alias again. A client pins the connection bytes and authenticated listener identity for its lifetime. It reports TENDERLY_INSTANCE_CHANGED when the original listener is retired or replaced.

## Complete merchant and customer operation

1. Read merchant_tenderly_profile_preview. Omitting plan returns the original template and explicit-block example. Preview the complete reviewed plan before saving it. The original compiler controls the provider account/project, EVM network, quick/abi/full mode, public route, Stellar payment terms, credential references and source limits.
2. Save the plan with merchant_tenderly_profile_save. Retain its p-… ID and exact normalized plan hash. Prepare and open that profile with merchant_tenderly_prepare and merchant_tenderly_profile_open. Preparation carries the original product, operation state and Node/Python customer interfaces.
3. Issue the customer's complete historical request with merchant_tenderly_issue. Retain the original operation ID, subject and expiry. expiresAt is Unix milliseconds. Its body contains block_number, transaction_index, from, to, input, gas and decimal-string value. The provider's fixed EVM network comes from the saved plan.
4. Download the returned r-… request packet with merchant_tenderly_file_read, kind request. The complete packet contains the merchant operation ticket, exact request hash, plan identity and customer request. Use merchant_tenderly_start to start the selected merchant under its original saved payment configuration.
5. Prepare the customer's original packet and use the native customer review and execution flow below. Retain its buyer intent and actual attempt through recovery. The customer receives the same merchant operation and original saved simulation.
6. Inspect merchant_tenderly_operation and merchant_tenderly_result. Retrieve all response bytes through the original retained-file reader. The original provider simulation status remains part of the response and analysis.
7. For an uncertain original operation, use its known saved simulation ID with merchant_tenderly_provider_lookup. Inspect the retained lookup and selected MATCHED observation, then use merchant_tenderly_provider_recover with that observation, current expectedGeneration and provider reference. Reopen the completed original operation and download its full response.
8. Stop the merchant when its work is complete. Retain its profiles, requests, generations and complete provider responses for the next customer or receiving host.

The original merchant plan bounds its provider response to at most 1 MiB. The browser preview displays up to 64 KiB; downloads retain the complete response. Provider lookup reuses its retained observations by default. refresh: true requests another actual provider observation and uses the provider's Retry-After. Reconciliation goes through the original controller and current generation.

The full tool contracts, paging fields, recovery inputs and retained-file continuation are in [TENDERLY-WORKSPACE.md](../../stellar-forge/mcp-merchant-operator/TENDERLY-WORKSPACE.md).

## Use the typed Node attachment

~~~js
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceRoot = process.env.TENDERLY_SOURCE_ROOT;
if (!sourceRoot) throw new Error('Set the READY installation sourceRoot.');
const fromSource = path => import(pathToFileURL(join(sourceRoot, path)).href);
const { TenderlyWorkspaceClient } = await fromSource(
  'stellar/scf-starforge-20261009/partners/tenderly-stellar-pilot/workspace/connection.mjs'
);
const client = await TenderlyWorkspaceClient.connect(
  '/absolute/private/tenderly-operator/tenderly.connection.json'
);
try {
  console.log(client.connection.instanceId, await client.status());
  const page = await client.profiles({ limit: 25 });
  const profile = page.records.find(row => row.status === 'SAVED')?.id;
  if (profile) {
    const saved = await client.inspectProfile(profile);
    console.log(saved.label, saved.review.planSha256);
    const plan = await client.download({ profile, kind: 'plan' });
    await writeFile('/absolute/private/customer/plan.json', plan.bytes,
      { mode: 0o600, flag: 'wx' });
  }
} finally {
  await client.close();
}
~~~

The SDK exposes typed original request, plan, profile, response, provider recovery and download inputs. It mirrors the authenticated native HTTP operations and sends mutations once. response and providerResponse return complete Buffer data; download checks the original content length and SHA-256. Keep the returned bytes for customer receiving. Close releases the attachment after accepted operations finish.

The adjacent /workspace/mcp export provides MerchantTenderlyWorkspaces, readTenderlyWorkspaceConfiguration, TenderlyToolArguments and the original catalog. It operates the same class used by the source-owned merchant provider.

## Native customer delivery

Use the exact plan and request packet handed over by the merchant. The original preparation API binds them into a resumable customer import:

~~~js
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceRoot = process.env.TENDERLY_SOURCE_ROOT;
if (!sourceRoot) throw new Error('Set the READY installation sourceRoot.');
const fromSource = path => import(pathToFileURL(join(sourceRoot, path)).href);
const partner = 'stellar/scf-starforge-20261009/partners/tenderly-stellar-pilot/';
const { prepareWorkspaceRequest } = await fromSource(partner + 'customer.mjs');
const { createSelection } = await fromSource(partner + 'customer/selection.mjs');
const { TenderlyCustomer } = await fromSource(partner + 'customer/client.mjs');

const plan = JSON.parse(await readFile('/absolute/private/customer/plan.json', 'utf8'));
const prepared = await prepareWorkspaceRequest({
  plan,
  packetFile: '/absolute/private/customer/tenderly-request.json',
  intentId: 'tenderly-customer-001',
  out: '/absolute/private/customer/input',
  responseOut: '/absolute/private/customer/input/provider-response.json'
});
const customer = new TenderlyCustomer({
  runtimeDirectory: join(sourceRoot, 'stellar/scf-starforge-20261009/sf88-operator-buyer-cli'),
  stateDirectory: '/absolute/private/customer/buyer',
  operatorProfile: '/absolute/private/operator-profile.json'
});
const operation = await customer.fromConfig(prepared.configPath, {
  selection: createSelection(plan)
});
const review = await operation.review();
console.log(review);
// Execute the customer's authorized, original reviewed purchase.
const result = await operation.execute({ review });
console.log(await result.summary());
await result.export('/absolute/private/customer/completed/customer-001');
await result.analyze({
  workspace: '/absolute/private/customer/analysis',
  label: 'Customer 001'
});
~~~

The customer uses the actual retained SF88 directory in that same installed package. The native customer preserves its review, signer selection, approval and spending operation. Its recover action reopens that same original intent after interruption. The maintained [Node/Python customer guide](../../stellar/scf-starforge-20261009/partners/tenderly-stellar-pilot/customer/README.md) contains both language interfaces and the CLI modes.

The complete customer export contains response.json, request.json, buyer-result.json, request.body, simulation-request.json and any original buyer-evidence.json, followed by its manifest. The original openExport API or starforge tenderly-customer open-export verifies the complete received export and its execution context.

## Analyze and hand over complete results

Open the retained analysis workspace:

~~~sh
starforge tenderly-analysis serve \
  --workspace /absolute/private/customer/analysis --port 0
~~~

Receive the customer's original response.json with simulation-request.json and buyer-result.json. The native analysis matches full bytes against the original buyer delivery and keeps the exact source record. Inspect execution, gas, call tree, state changes, asset movements and logs; compare retained simulations by their actual block and transaction context. Save a review and its self-contained HTML, JSON, CSV or complete original source export.

The analysis workspace accepts source responses up to 64 MiB, including provider exports received separately from the merchant's configured response limit. All customer files and reviews retain their original identities. The [analysis guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/tenderly-analysis/README.md) describes receiving, comparisons and portable exports.

To move the merchant, stop its original server owner first and use the existing authenticated complete workspace backup route. Receive workspace.json, all profiles and requests, prepared packages, operation databases and provider observations together. The original preparer reopens the verified packages at their received locations. Supply the same stable operation key, select the received directory in Applications and review its retained identity. The new receiving process creates its own private live connection.
