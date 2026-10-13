# Rumble Fish customer prices

This product joins the original Stellar Prices workbench to managed Applications, a typed local SDK, and the maintained merchant MCP host. The same workspace retains discovery, watchlists, current and historical responses, source quality, request age and quota continuation, customer books, exact valuations, reviewed editions and complete exports.

## Receive the existing customer

The original customer operation is RUMBLE-FISH-CUSTOMER-CONSUMPTION-4593-20261012. Its workspace is workspace-a7132ccfd3667385c848c02b and customer is rumble-wallet-reference-4593. Preserve its retained provider responses and original Workshare workshare-dd2046fadcd6ab86f2b842f3, Delivery delivery-ddf471890ee533b17dff6ad9 and handover handover-9507fe90cde7cee07e1a8915. Applications selection and MCP attachment open this existing state. The separate Installation/recurring owner continues its existing case and calendar.

The core source is the complete 23-file Commons workbench from merge 1d200771562dd0a39475290b6c0b1a2a0e0c2b3e, tree e0dbff12fdacf443c73310b9fab534dab7436ef5, under opportunities/rumble_fish_prices_workshare_2026/workbench. SOURCE_PROVENANCE.json records every original byte/hash. This installed edition adds connection, launch and receiving interfaces; package.json includes the independent SDK in customer exports, and workspace.mjs excludes the root private connection file.

Use the complete original delivery JSON from the saved case. A new receiving directory is deliberate: the original unpacker verifies all file bytes and hashes and never overwrites an existing workspace.

```sh
starforge rumble-workspace unpack --file /private/original/stellar-prices-workbench.json --out /private/customer-received
starforge rumble-workspace inspect --dir /private/customer-received/workspace
```

A received older package retains its original core source. To operate it with this installed edition, select its existing workspace directory in the installed Applications entry; the stable workspace/customer identities and retained source files remain unchanged.

For a new authorized customer, initialize a private workspace with the original command, save the intended provider/watchlist configuration, and use the original customer-book workflow. This does not create another copy of an already accepted customer.

## Install the complete product

Build the original immutable merchant-repository source using the maintained builder and selection:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout --ref ORIGINAL_COMMIT \
  --selection rumble-customer-workspace --out /private/rumble-package --offline
```

The selection includes this whole source-owned contribution plus the maintained runtime, merchant host, private file reader and source receiving dependencies. It declares no new npm dependency for the price workbench or SDK. Prepare the original runtime profile with schema, openapi and mcp features through the maintained installer; inspect that installation's actual profile and source manifest before launching it. Use the normal runtime-workspace application and its Build a product/Install views to receive the selected archive.

```sh
starforge registrations --source rumble-workspace
starforge registrations --command rumble-managed
starforge registrations --command rumble-workspace
starforge doctor --feature mcp
```

Inspection returns the READY installation's actual sourceRoot. Bind these commands to that same runtime from any working directory:

```sh
RUMBLE_RUNTIME=/absolute/private/rumble-runtime
RUMBLE_SOURCE_ROOT=/ACTUAL_SOURCE_ROOT_RETURNED_BY_INSPECT
export RUMBLE_SOURCE_ROOT
starforge() {
  node "$RUMBLE_SOURCE_ROOT/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" \
    run --dir "$RUMBLE_RUNTIME" -- "$@"
}
```

The contribution owns its original command, exports, browser asset map, Applications adapter and merchant provider. The shared catalogue and process lifecycle remain maintained by their existing owners.

## Applications: review, save, start, open, stop

Choose **Rumble data workspace** and the existing private workspace directory. Review/Save pins the absolute directory, filesystem identity and stable workspace ID. The shared runtime owns port selection, environment review, resource lease, process start, browser opening and Stop.

The provider key belongs in the private application environment as STELLAR_PRICES_API_KEY. The existing runner binds that process key to the saved provider origin. A restored source/customer workspace can be inspected and its existing values exported without making another provider request.

The launcher starts the original server and publishes a 0600 rumble.connection.json under its owned 0700 workspace while the original writer lease is held. The startup observer verifies the reviewed directory, original workspace ID, connection SHA, process/instance identity, loopback origin and selected port; it then authenticates against the actual running state before accepting the browser URL.

```sh
starforge rumble-managed --workspace /private/customer-received/workspace --port 0
```

Open its printed private URL. The industrial browser preserves the original Source, History and Customers workflows. Stop drains the original provider runner, removes only the connection record belonging to that process, and releases the original workspace writer. The connection contains an ephemeral browser capability, so portable workspace exports deliberately omit it. A new Start creates a new instance; old clients must inspect and reconnect.

## Typed SDK on the same listener

The standalone package exports ./connection and ./managed. The installed merchant package exports ./seller/rumble/workspace/connection and the corresponding managed, consumer, wallet, delivery and original workbench modules.

```js
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const sourceRoot = process.env.RUMBLE_SOURCE_ROOT;
if (!sourceRoot) throw new Error('Set RUMBLE_SOURCE_ROOT to the READY runtime inspection sourceRoot.');
const {RumbleWorkspaceClient} = await import(pathToFileURL(join(sourceRoot,
  'stellar/scf-starforge-20261009/partners/rumble-fish-prices/workbench/connection.mjs')).href);
const client = await RumbleWorkspaceClient.connect('/private/customer-received/workspace/rumble.connection.json', {
  workspaceId: 'workspace-a7132ccfd3667385c848c02b'
});
const state = await client.state();
const customer = await client.consumer({consumerId:'rumble-wallet-reference-4593'});
const feed = await client.values({consumerId:customer.consumerId});
await client.close();
```

A project that installs this archive as its own npm dependency can instead import @tokenjunkielabs/starforge-merchant/seller/rumble/workspace/connection and obtain its TypeScript declarations.

The client reads the private connection and checks its unchanged hash on every request. It authenticates only the original 127.0.0.1 listener and refuses redirects. It preserves the original error code/status, operationId and uncertain mutation state. Closing this attachment drains its own requests; Applications retains the server.

state, consumers, consumer, edition, values, csv, plan/getPlan, start/pause/resume, result, configure, saveConsumer, createEdition and reviewEdition use the original server and control queue. exportBundle calls the same complete delivery operation and verifies the workspace identity and omission of private control state.

Prices, quantities, multiplication and comparison values remain decimal strings. The customer engine reads exactly the selected retained run; a missing price remains unavailable and an incomplete total remains null. Source as_of and updated_at remain distinct. The SDK forwards this model without numeric conversion or replacement observations.

## Configure the maintained MCP host

Create one private JSON configuration declaring original workspace aliases, reviewed complete input files, receiving destinations and existing private wallet directories. Every input names its full SHA256. Obtain those hashes from the exact local source files, not from this example.

```json
{
  "schema":"stellar-forge.rumble-workspace-connection.v1",
  "workspaces":{
    "customer":{
      "label":"Original Rumble customer",
      "directory":"/private/customer-received/workspace",
      "workspaceId":"workspace-a7132ccfd3667385c848c02b",
      "inputs":{},
      "destinations":{"received":{"directory":"/private/later-receiving"}},
      "wallets":{"wallet":{"directory":"/private/customer-wallet"}}
    }
  }
}
```

Create the wallet directory with 0700 before loading it. Declare full original inputs as {kind,file,sha256,label?}; kinds are book, configuration, plan and bundle. Input paths resolve relative to this configuration and are opened as private original files. The host validates their identities at configuration load and again before use.

The source-owned merchant provider id is rumble-workspaces, configKey rumbleWorkspaces and configuration input rumbleWorkspaceConnection. Its initializer initializeRumbleWorkspaceMerchant({directory,connection,name?}) writes the existing merchant-mcp.v1 configuration and initializes the original release store. It uses a separate private merchant directory; it never starts another price workbench. The maintained merchant-mcp and merchant-mcp-stdio entrypoints expose the provider through the selected installed runtime.

Inspect merchant_rumble_status, connect the intended alias, and open merchant_rumble_browser. Each attached workspace uses the Applications-owned original listener.

## 24 complete operations

| Operation family | Tools | Result |
|---|---|---|
| Current application | status, connect, disconnect, browser | Original identity, paged source history, exact instance attachment and private browser |
| Customer authoring | consumer, edition, save_consumer, create_edition, review_edition | Complete book, immutable edition, original revision checks and explicit publication |
| Provider work | configure, plan, get_plan, start, pause, resume, result | Original reviewed configuration, saved plan and quota-aware retained requests |
| Complete files | export, exports, file, file_release | Durable exact customer/workspace files and maintained resumable SHA-bound reads |
| Receiving | receive, received | Original whole-source/workspace receiving into a declared new directory |
| Customer wallet | wallet_receive, wallet | Persistent original wallet adoption, older-edition retention and current value view |

All names have the prefix merchant_rumble_. The source exports TypeScript declarations for the SDK and the complete tool argument map.

A tool input selects a declared alias rather than an arbitrary host path. Save_consumer takes consumerId, expectedRevision, sourceInput and expectedSourceSha256; the selected book file contains the complete original ConsumerConfigurationInput. Configure uses the same input mechanism and the workspace configuration revision. Plan compiles its declared original PlanSpecification before any network collection. Start takes its saved planId. After an uncertain start, inspect the saved state and actual run before deciding how to continue.

Create_edition takes consumerId, expectedRevision, sourceRunId, operationId, optional name and note. Keep the exact operationId and input on an uncertain response; the original engine reconciles accepted immutable editions. Review_edition applies publish/reject, reviewedBy and note at the current customer revision. The original source/browser authoring uses these same operations.

## Complete exports and receiving

Export requires a saved operationId, kind and expectedRevision. For kind workspace, expectedRevision is the displayed workspace revision. For values or csv it is the customer revision, and consumerId selects that customer; editionId is optional. Both customer formats are derived from one complete verified customer feed.

The host records export intent before requesting the source and retains exact content, metadata and SHA as one durable customer file. A completed retry returns the same file ID/bytes. If execution stopped after the complete content was installed, the same operation recovers its original prepared metadata. An interruption before content was saved requires inspection of the original state and a new export operation for the current revision. It never silently substitutes a later file under an existing operation.

Exports lists the durable files with pagination. File uses the maintained RetainedFileReads protocol. Preserve returned readId, expectedSha256, offset and nextOffset through all chunks. Finish the whole file and verify its advertised byte/hash identity. After restart, reopen the same retained file ID with its expected SHA; do not treat a partial result as a whole export.

The portable format retains up to 20,000 files and 256 MiB of decoded content. Each relative path is at most 4096 UTF-8 bytes and excludes control characters. The SDK and maintained retained-file reader accept a 512 MiB encoded envelope: the maximum Base64 content, per-file padding, worst allowed JSON path escaping and fixed metadata fit within this ceiling. Control requests remain limited to 1 MiB, matching the original server.

A complete workspace export contains the original app source, all retained plans/runs/response bytes and all customer books, editions, reviews and downstream saved files. Package source includes the standalone managed launcher/SDK, so the received product can operate without the original merchant repository. The full installed runtime/source archive additionally carries the merchant host/provider and its maintained dependencies.

To receive through MCP, declare the exact bundle input and a new destination, then call receive with sourceInput, expectedSourceSha256 and destination. The original unpacker verifies all complete files. The receiving record retains original source SHA, stable workspace ID, source revision and file count. Repeating the same completed source/destination returns that receipt. If execution accepted the whole unpack before recording its receipt, recovery verifies every original source file before adopting that same receiving. received exposes the actual workspace directory for a later Applications selection.

The standalone delivery entrypoint remains node cli.mjs serve --dir ./workspace. The included managed.mjs can create a new authenticated listener on that independently received workspace; its previous ephemeral connection is absent by design.

## Same-customer later edition and wallet

Use the original customer book and a newly accepted original source run. Create/review the next edition at the displayed customer revision, then export or adopt its values. Changes retain quantity effects, price effects, old/new observation times, source quality and prior edition identities.

Wallet_receive takes consumerId, optional editionId, a declared wallet alias and expectedWalletSha256. The first adoption uses null. The original wallet receiver validates the full published feed and its exact source identity; the persistent wallet is saved under the original private directory writer. A replay of an already accepted feed reconciles a lost response. A different incoming feed requires the current wallet SHA. Older first-seen editions stay in receipts while the current source revision remains the greatest accepted revision. Wallet returns its original current view and all received-edition identities.

Keep the customer and wallet directories distinct from the source workbench. The complete source edition can then be exported, received on a new host, reopened with the same stable customer/workspace identity, and attached to the current installed runtime.

## Installation/Workshare source adoption

Use the existing installation-workshare-receiving.v1 operation and its original owner. The complete product source/package is an additional role:source file with exact filename, bytes, hash, sourceUrl, observedAt and mediaType. The original receiver joins its sourceIds into source.sourceIds and receiving.sourceIds. Preserve its existing commissioning file, original workshareCaseId, planSha256, task/source/payment/receiving bindings and deployment IDs. This product adds a usable customer application; it does not create another Workshare, recurring calendar or Installation case.

## Source and recovery record

Retain the immutable merchant commit, selected distribution manifest, SOURCE_PROVENANCE.json, whole customer delivery SHA and original Slack customer operation. A provider response, saved customer edition, reviewed publication, application start and received wallet remain distinct native states in the same operation. Use their actual returned IDs for continuation.
