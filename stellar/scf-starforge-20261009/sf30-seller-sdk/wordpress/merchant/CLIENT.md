# WordPress merchant client and setup

This client exposes the original WordPress workspace through the normal merchant host. It uses all 25 declared tools and 33 original actions, the same workspace revision and operation journal, and the existing complete-file downloader. The host selects private workspace, buyer and receiving directories; callers select their aliases.

The package export is `./seller/wordpress/merchant`. The command is `starforge-merchant merchant-wordpress`. The adjacent `client.d.ts` describes the public JavaScript API, including every tool argument and the allowed keys of each original action. The original controller validates required action-specific fields, source credentials, reviewed prices and publishing decisions.

## Configure the existing workspace

Save a private UTF-8 connection file with the following shape. Replace every example path and port with the original owner's actual selections.

```json
{
  "schema": "stellar-forge.wordpress-merchant-connection.v1",
  "workspaces": {
    "catalog": {
      "directory": "/private/wordpress/catalog",
      "label": "WordPress catalog",
      "allowStart": false,
      "url": "http://127.0.0.1:8789/"
    }
  },
  "buyerWorkspaces": {
    "reviewer": {
      "directory": "/private/buyers/reviewer",
      "label": "Original buyer workspace"
    }
  },
  "receivers": {
    "source-review": {
      "directory": "/private/receiving/wordpress-source",
      "label": "Complete source receiving"
    }
  }
}
```

Workspace and buyer directories are the original private directories. A receiving destination may be absent beneath an existing private parent. Use canonical paths without symlink components. The configuration supports 1–32 WordPress aliases and up to 64 aliases in each buyer/receiving group.

There are three supported controller choices:

| Choice | Connection fields | Ownership |
| --- | --- | --- |
| Existing private listener | `allowStart:false`, `url` set to its actual HTTP 127.0.0.1 port | The merchant borrows the listener. |
| Existing Applications operation | `allowStart:false`, `applications:{directory,applicationId}`; omit `url` | The original Applications operation owns the listener. |
| Merchant-owned original lifecycle | `allowStart:true`; select the original directory, optionally `python` and pinned `sourceDirectory/sourceSha256` | The merchant uses the original WordPress launcher and closes only its own process. |

The default is `allowStart:false`. A host may also pin `workspaceId` and `workspaceIdentity` from an actual original workspace. Source credentials remain in the original source configuration and its environment references. The merchant connection contains paths and bindings, not token values.

Initialize one private merchant directory:

```sh
starforge-merchant merchant-wordpress init \
  --directory /private/merchants/wordpress \
  --connection /private/config/wordpress-connection.json \
  --name "WordPress catalog"
```

Setup calls the original release-store initializer, retains the selected release directory, creates the complete-export directory and validates `merchant-mcp.json` with the normal host configuration reader. Repeating the same setup reuses its recorded selection. A changed connection or a different setup in that directory requires a separately reviewed configuration choice.

The returned `configuration` is the input to the normal merchant host:

```sh
starforge-merchant merchant-mcp serve \
  --config /private/merchants/wordpress/merchant-mcp.json --port 3211
```

For the original stdio transport use `starforge-merchant merchant-mcp-stdio --config /private/merchants/wordpress/merchant-mcp.json`. The installed generic initializer also accepts `starforge-merchant merchant-providers init wordpress-workspaces --options /private/setup.json`, where the private setup object contains `directory`, `connection` and optional `name`.

Its credential is supplied through an environment variable such as `MCP_ACCESS_TOKEN`; pass only the variable name to the client. The HTTP client accepts the original local endpoint or an HTTPS endpoint and uses the host's native MCP initialization and authenticated tool transport.

## Open, inspect and retain complete results

A compact result is a preview when `completeValue:false`. The complete native JSON is already retained under the returned merchant export ID. `callValue` reads and verifies that original JSON before returning it.

```js
import {openWordPressMerchantClient} from './client.mjs';

const client = await openWordPressMerchantClient({
  url: process.env.WORDPRESS_MERCHANT_URL,
  tokenEnv: 'MCP_ACCESS_TOKEN'
});
const opened = await client.open({workspace: 'catalog'});
const {result, value: state} = await client.callValue('state', {workspace: 'catalog'});

// Keep the complete result and its manifest identity for the same customer handoff.
const receipt = await client.downloadExport({
  workspace: 'catalog',
  result,
  directory: '/private/deliveries/catalog-state'
});
const reopened = await client.reopenExport({
  workspace: 'catalog',
  exportId: receipt.exportId,
  expectedManifestSha256: receipt.manifestSha256,
  directory: receipt.directory
});
```

The complete-file directory contains `wordpress-merchant-manifest.json`, its one original file and the existing downloader's progress directory. Download recovery uses the same directory and expected manifest SHA. A new MCP listener port can serve the same export: the download is bound to the original workspace UUID, workspace identity, alias, export ID and hashes, rather than a transient listener address.

`readValue` accepts the retained result or an explicit export reference. It reads every chunk of the selected JSON file, checks its length and SHA-256, then decodes UTF-8 JSON. A missing retained-reader handle is reopened for the same immutable range. Mutations are never retried by this reader.

`downloadExport` streams the complete original file through the existing retained downloader; it does not buffer a large artifact in the client. `reopenExport` verifies the local manifest and every file without opening the merchant endpoint. JSON reads are limited to 64 MiB; complete artifact downloads use the original declared maximum of 4,362,076,160 bytes.

A result with `retention.state:"FAILED"` reports a complete-file storage problem separately from the underlying native operation. Keep its original operation UUID and inspect that operation after storage is available. This client never turns such a result into an invented failed provider write.

## Preserve the two export namespaces

| Location | Identifier | Select it from |
| --- | --- | --- |
| `act("publisher.prepare").input.exportId` | Original workspace export UUID | The chosen record in the complete `state.exports[]`, using its `id`. |
| `manifest`, `file`, `json`, `receive`, client download/value and CLI `--export-id` | Merchant export SHA-256 | The retained result's top-level `exportId`. |
| `artifact` with `kind:"export"` | Original workspace export UUID | The original workspace export record. |

Publisher preparation checks that the selected original export belongs to the selected product, then resolves its original export directory on the host. No client-supplied directory is substituted for that record. Buyer sessions similarly select a declared `buyerWorkspace` alias.

## Execute and reconcile the original action

Save the exact operation UUID, expected workspace revision, native action name and input before calling `act`. The server uses that original identity for its durable operation. Read the current full state and original schema to prepare the intended action.

```js
// These values come from the caller's saved, reviewed action.
const request = {
  workspace: 'catalog',
  operationId: savedOperation.operationId,
  expectedRevision: savedOperation.expectedRevision,
  action: 'publisher.prepare',
  input: {
    productId: selectedProduct.id,
    exportId: selectedWorkspaceExport.id
  }
};
try {
  const {result, value} = await client.callValue('act', request);
  // Retain this actual result with the same saved operation.
} catch (error) {
  // A transport failure may follow a completed native action.
  // Keep request unchanged and inspect its original operation.
  const observed = await client.callValue('operation', {
    workspace: request.workspace,
    operationId: request.operationId
  });
  // Continue from the observed original state and its supported recovery.
}
```

There is no automatic action retry, new UUID generation or expected-revision refresh inside the client. A revision conflict requires a newly reviewed action. The original publisher review, activation, payment and buyer recovery boundaries continue to decide which transitions are permitted.

The 38 actions cover the full original workflow:

| Workflow | Original actions |
| --- | --- |
| Source and capture | `source.save`, `source.select`, `source.discover`, `capture.start`, `capture.resume`, `capture.pause` |
| Mapping and edition | `mapping.save`, `edition.build`, `merchant.save`, `edition.export`, `product.select` |
| Complete source | `source.packet`, `source.files` |
| Recurring delivery | `refresh.plan.save`, `refresh.run.start`, `refresh.run.advance`, `refresh.run.review`, `refresh.run.export` |
| Publisher preparation | `publisher.status`, `publisher.prepare`, `publisher.preview`, `publisher.reviewDraft`, `publisher.publish`, `publisher.activateSnapshot`, `publisher.collect` |
| Release | `publisher.release.stage`, `publisher.release.inspect`, `publisher.release.activate`, `publisher.release.rollback`, `publisher.release.start`, `publisher.release.stop` |
| Buyer | `publisher.buyer.review`, `publisher.buyer.prepare`, `publisher.buyer.session`, `publisher.buyer.run`, `publisher.buyer.recover`, `publisher.buyer.account`, `publisher.buyer.export` |


## Refresh a reviewed WordPress delivery

The refresh workflow uses the original workspace. A plan freezes a reviewed edition's source connection, collection selection, native filters, projection and dataset configuration. Every run captures that selection again and retains a complete comparison before a reviewer approves or rejects the candidate. The approved edition is then exported through the existing merchant terms and publisher product.

### Browser workflow

Open **Refresh & review** in the original WordPress browser.

1. Select the reviewed baseline edition, enter a plan label and save the plan. Existing merchant terms and product can be retained now or selected at export. A capacity revision records its previous plan and explicit new limits while preserving the original queries.
2. Open the retained plan and start a named run. Compare with the original baseline or one of the same plan's approved successors. Successor selection joins the saved approval event to the original edition; a reserved candidate edition ID does not make an edition eligible.
3. Follow the original discovery and capture. **Continue this run** advances the same run after the current job completes. Read native findings and provider retry timing from that job. The browser polls its progress without dispatching another action. A record or byte ceiling remains visible and can be addressed by a reviewed plan revision.
4. Inspect the saved added, changed and removed records. Each record opens its baseline and candidate native JSON, projected JSON and original response coordinates. Very large visible records retain full-response download buttons. The four report downloads contain the complete review, JSONL changes, CSV changes and change index.
5. Record the reviewer, note and explicit approval or rejection. The request binds the complete review SHA-256 and exact candidate capture SHA-256. Approval creates the original successor edition. Rejection retains the named decision and the complete comparison.
6. Export the approved edition, then open its original publisher. Preparation, release activation, seller payment and buyer delivery keep their existing workflow. The export list retains the actual product and original export UUID.

The change filter does not renumber the retained comparison. Every next page follows its exact returned `nextOffset`; the browser keeps previous page offsets for that filter. Source and projection change counts may overlap, so they are not added together to calculate total changed records.

### Native methods and retained merchant values

The original workspace methods are `refreshPlan(id)`, `refreshRun(id)`, `refreshChanges(id,{offset,limit,kind})` and `refreshRecord(id,key)`. Their merchant counterparts use the configured alias and return the same complete native value inside the existing retained-result envelope.

```js
const {value: plan} = await client.callValue('refresh_plan', {
  workspace: 'catalog', id: savedPlanId
});
const {result: runReceipt, value: run} = await client.callValue('refresh_run', {
  workspace: 'catalog', id: savedRunId
});
const {value: page} = await client.callValue('refresh_changes', {
  workspace: 'catalog', id: savedRunId, offset: 0, limit: 50, kind: 'changed'
});
// Continue with page.nextOffset until it is null; do not calculate a new cursor.
const {value: versions} = await client.callValue('refresh_record', {
  workspace: 'catalog', id: savedRunId, key: page.rows[0].key
});
```

The named client methods `refreshPlan`, `refreshRun`, `refreshChanges` and `refreshRecord` accept these same tool argument objects. Use `callValue` or `readValue` when the full native JSON is required, because a retained response can be larger than its visible preview.

A run returns its plan, stage, original jobs, complete review, decision, approved edition, exports and events. The stages are `discovering`, `capturing`, `review_ready`, `approved`, `rejected`, `exported` and `attention`. The compact edition in this response can be opened with the existing `edition` tool.

### Five original actions

All actions use the existing `act` tool and its saved `operationId`, `expectedRevision`, `action` and `input`.

| Action | Required input | Optional retained selections |
| --- | --- | --- |
| `refresh.plan.save` | `editionId`, `expectedSnapshot`, `label` | `note`, `merchantId`, `productId`, `previousPlanId`, `limits:{maxPages,maxRecords,maxBytes}` |
| `refresh.run.start` | `planId`, `label` | `baselineEditionId` from an approved successor of the same plan |
| `refresh.run.advance` | `runId` | None |
| `refresh.run.review` | `runId`, `expectedReviewSha256`, `expectedCaptureSha256`, `decision`, `reviewer` | `note` |
| `refresh.run.export` | `runId`, `reviewer` | `note`, `merchantId`, `productId`; omitted choices use the plan |

The review decision is `approve` or `reject`. Read its expected hashes from `run.review.reviewSha256` and `run.review.candidate.captureSha256`. Each newly requested advance has its own saved action UUID. Retrying an uncertain advance preserves that exact UUID, expected revision and input.

When a review or export has retained its decision but the outer action reply was interrupted, `refresh_run` can return `recovery`. It is the original full envelope, including its expected revision. Reuse it unchanged:

```js
const {value: current} = await client.callValue('refresh_run', {
  workspace: 'catalog', id: savedRunId
});
if (current.recovery) {
  const exact = current.recovery;
  const recovered = await client.callValue('act', {
    workspace: 'catalog',
    operationId: exact.operationId,
    expectedRevision: exact.expectedRevision,
    action: exact.action,
    input: exact.input
  });
  // Save the returned original result beside the same retained action.
}
```

A new action uses the latest reviewed workspace revision. The recovery above uses the revision already recorded in its original action; it is not rewritten to the latest value. The same operation inspection and recovery are available after complete source receiving.

### Complete comparison files

Request `artifact` with `kind:"refresh"`, the original run UUID and exactly one of `review.json`, `changes.jsonl`, `changes.csv` or `changes.index.json`. The existing retained downloader writes every original byte and verifies the manifest and file hashes.

```js
const report = await client.artifact({
  workspace: 'catalog', kind: 'refresh', id: savedRunId, name: 'changes.csv'
});
await client.downloadExport({
  workspace: 'catalog', result: report,
  directory: '/private/deliveries/wordpress-refresh-changes'
});
```

These report IDs are original run UUIDs. The returned merchant export ID is a SHA-256 identity, while `publisher.prepare` continues selecting the original workspace export UUID from `state.exports[]`.

### Command-line operation

The installed merchant read commands return both the retained response and its complete native JSON value:

```sh
starforge-merchant merchant-wordpress refresh-plan --url "$WORDPRESS_MERCHANT_URL" \
  --token-env MCP_ACCESS_TOKEN --workspace catalog --id "$PLAN_ID"
starforge-merchant merchant-wordpress refresh-run --url "$WORDPRESS_MERCHANT_URL" \
  --token-env MCP_ACCESS_TOKEN --workspace catalog --id "$RUN_ID"
starforge-merchant merchant-wordpress refresh-changes --url "$WORDPRESS_MERCHANT_URL" \
  --token-env MCP_ACCESS_TOKEN --workspace catalog --id "$RUN_ID" --offset 0 --limit 50 --kind changed
starforge-merchant merchant-wordpress refresh-record --url "$WORDPRESS_MERCHANT_URL" \
  --token-env MCP_ACCESS_TOKEN --workspace catalog --id "$RUN_ID" --key "$ORIGINAL_RECORD_KEY"
```

Use the existing merchant `act` command for the five mutations, with an input JSON file and the saved original operation UUID/revision. There is no automatic review or advance loop.

The original standalone CLI exposes the same four read commands:

```sh
node wordpress/cli.mjs refresh-run --dir /private/wordpress/catalog --id "$RUN_ID"
node wordpress/cli.mjs refresh-changes --dir /private/wordpress/catalog \
  --id "$RUN_ID" --offset 0 --limit 50 --kind all
node wordpress/cli.mjs act --dir /private/wordpress/catalog \
  --action refresh.run.advance --input /private/requests/refresh-advance.json \
  --operation "$SAVED_OPERATION_UUID" --expected-revision "$REVIEWED_REVISION"
```

The standalone start and advance commands wait for the returned original discovery/capture job before closing their workspace owner. They perform one requested stage and report its result; the next advance remains an explicit action. Keep an existing merchant or browser owner available when using the remote tool path.

### Reopen the whole refresh workspace

The original `source.packet` and `source.files` workflows carry complete plans, runs, events, original refresh action intents/results and the saved comparison files alongside the source/captures/mappings/editions. Select that complete source packet for the existing receiver. After receiving, open the same installed browser or CLI and inspect the saved run before continuing any native capture or publication.

Original source credentials remain environment references. A receiving host supplies its configured account access. Complete change reports, named decisions, accepted editions and original operation IDs are retained even when the listener address or host changes.

## Receive a complete source packet

First create or select the original source packet through the native workspace. Request its artifact with `kind:"packet"` and its original UUID. That returns a merchant result with `kind:"source-packet"` and the complete `wordpress-source.zip`.

```js
const packetResult = await client.artifact({
  workspace: 'catalog', kind: 'packet', id: selectedPacket.id
});
const receiving = await client.receiveSourcePacket({
  workspace: 'catalog',
  result: packetResult,
  receiver: 'source-review'
});
const received = await client.readValue({
  workspace: 'catalog',
  result: receiving
});
```

Receiving validates the complete source manifest and selects only a host-declared receiver alias. The original packet receiver owns restoration and continuation into that destination. Repeating the same packet and destination follows its existing receiving operation. The client returns the native receiving result; it does not infer completion from dispatch.

## Complete command reference

Every CLI flag takes one value. Duplicate, unknown and malformed flags are rejected. `--args` reads one private JSON object up to 1 MiB. For `act`, that file contains only the action's `input`; the other fields are explicit command options.

```sh
starforge-merchant merchant-wordpress tools

starforge-merchant merchant-wordpress call --url "$WORDPRESS_MERCHANT_URL" \
  --token-env MCP_ACCESS_TOKEN --action state --args /private/requests/workspace.json

starforge-merchant merchant-wordpress act --url "$WORDPRESS_MERCHANT_URL" \
  --token-env MCP_ACCESS_TOKEN --workspace catalog \
  --action publisher.prepare --operation-id "$SAVED_OPERATION_UUID" \
  --expected-revision "$REVIEWED_REVISION" --args /private/requests/publisher-prepare.json

starforge-merchant merchant-wordpress value --url "$WORDPRESS_MERCHANT_URL" \
  --token-env MCP_ACCESS_TOKEN --workspace catalog \
  --export-id "$MERCHANT_EXPORT_SHA" --manifest-sha256 "$MANIFEST_SHA"

starforge-merchant merchant-wordpress inspect --url "$WORDPRESS_MERCHANT_URL" \
  --token-env MCP_ACCESS_TOKEN --workspace catalog --export-id "$MERCHANT_EXPORT_SHA"

starforge-merchant merchant-wordpress download --url "$WORDPRESS_MERCHANT_URL" \
  --token-env MCP_ACCESS_TOKEN --workspace catalog --export-id "$MERCHANT_EXPORT_SHA" \
  --manifest-sha256 "$MANIFEST_SHA" --directory /private/deliveries/catalog-state

starforge-merchant merchant-wordpress reopen --workspace catalog \
  --export-id "$MERCHANT_EXPORT_SHA" --manifest-sha256 "$MANIFEST_SHA" \
  --directory /private/deliveries/catalog-state

starforge-merchant merchant-wordpress receive --url "$WORDPRESS_MERCHANT_URL" \
  --token-env MCP_ACCESS_TOKEN --workspace catalog --export-id "$SOURCE_PACKET_EXPORT_SHA" \
  --manifest-sha256 "$SOURCE_PACKET_MANIFEST_SHA" --receiver source-review
```

The `tools` command prints the exact tool schemas plus all original action input keys. `call` accepts a short tool name or its `merchant_wordpress_` prefix. Named JavaScript methods use camel case for underscore names, such as `datasetPreview`, `publisherArtifact` and `fileRelease`.

| Tools | Result use |
| --- | --- |
| `workspaces`, `schema` | Configured aliases and original schemas. |
| `open`, `release` | Original lifecycle and ownership response. |
| `state`, `operation`, `source`, `job`, `records`, `response` | Complete retained state, capture records and native source responses. |
| `mapping`, `edition`, `projection`, `compare`, `preview`, `dataset_preview` | Complete retained transformation and review results. |
| `refresh_plan`, `refresh_run`, `refresh_changes`, `refresh_record` | Complete retained recurring-delivery plan, run, changes and original record versions. |
| `act`, `cancel` | The original operation result. |
| `artifact`, `publisher_artifact` | Complete original files through a retained merchant export. |
| `manifest`, `file`, `file_release`, `json` | Bound complete-file metadata, byte ranges and JSON-pointer pages. |
| `receive` | Original complete source receiving operation. |

The direct module entry is `node stellar/scf-starforge-20261009/sf30-seller-sdk/wordpress/merchant/cli.mjs` followed by the same subcommands. SIGINT and SIGTERM cancel the current client request; they do not assert that a dispatched native write was undone. The CLI returns the original operation ID with an action error when available, so a caller can reconcile the same request.

## Source and integration

These five files compose with the original WordPress producer, the merchant connection/catalog/export modules and `stellar-forge/mcp-merchant-operator/retained-download.mjs`. They add no separate workspace, journal, source credential store, paid runtime or scheduled workflow. Setup uses the original seller release store and normal merchant configuration reader.

The whole provider's receiving operation exercises the joined source. Its native outcome belongs with that integrated delivery. This guide describes the source contract and operating steps; the final native acceptance record should be attached by the receiving owner after its actual run.
