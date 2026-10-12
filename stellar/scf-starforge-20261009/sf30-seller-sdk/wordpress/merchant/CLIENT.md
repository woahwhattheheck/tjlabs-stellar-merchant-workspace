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

The 33 actions cover the full original workflow:

| Workflow | Original actions |
| --- | --- |
| Source and capture | `source.save`, `source.select`, `source.discover`, `capture.start`, `capture.resume`, `capture.pause` |
| Mapping and edition | `mapping.save`, `edition.build`, `merchant.save`, `edition.export`, `product.select` |
| Complete source | `source.packet`, `source.files` |
| Publisher preparation | `publisher.status`, `publisher.prepare`, `publisher.preview`, `publisher.reviewDraft`, `publisher.publish`, `publisher.activateSnapshot`, `publisher.collect` |
| Release | `publisher.release.stage`, `publisher.release.inspect`, `publisher.release.activate`, `publisher.release.rollback`, `publisher.release.start`, `publisher.release.stop` |
| Buyer | `publisher.buyer.review`, `publisher.buyer.prepare`, `publisher.buyer.session`, `publisher.buyer.run`, `publisher.buyer.recover`, `publisher.buyer.account`, `publisher.buyer.export` |

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
| `act`, `cancel` | The original operation result. |
| `artifact`, `publisher_artifact` | Complete original files through a retained merchant export. |
| `manifest`, `file`, `file_release`, `json` | Bound complete-file metadata, byte ranges and JSON-pointer pages. |
| `receive` | Original complete source receiving operation. |

The direct module entry is `node stellar/scf-starforge-20261009/sf30-seller-sdk/wordpress/merchant/cli.mjs` followed by the same subcommands. SIGINT and SIGTERM cancel the current client request; they do not assert that a dispatched native write was undone. The CLI returns the original operation ID with an action error when available, so a caller can reconcile the same request.

## Source and integration

These five files compose with the original WordPress producer, the merchant connection/catalog/export modules and `stellar-forge/mcp-merchant-operator/retained-download.mjs`. They add no separate workspace, journal, source credential store, paid runtime or scheduled workflow. Setup uses the original seller release store and normal merchant configuration reader.

The whole provider's receiving operation exercises the joined source. Its native outcome belongs with that integrated delivery. This guide describes the source contract and operating steps; the final native acceptance record should be attached by the receiving owner after its actual run.
