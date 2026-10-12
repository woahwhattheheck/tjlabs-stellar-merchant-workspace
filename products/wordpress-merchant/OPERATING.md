# WordPress merchant: installation, publishing and customer receiving

This product connects an existing WordPress source to a complete Stellar merchant workflow. The operator discovers the site's actual REST collections, retains the original responses, reviews a typed edition, publishes it through the existing dataset publisher and SF82 release store, and delivers it through the original SF88 buyer. A second product can carry the complete retained source workspace to another operator.

The same source workspace is available in the browser, the installed WordPress CLI, managed Applications and 25 merchant tools. The typed client adds complete JSON reads, streaming downloads and local reopening. All surfaces use the original workspace, capture, edition, product, release and acquisition identities.

The committed recipe is `stellar/scf-starforge-20261009/distribution/selections/wordpress-merchant.json`. It selects the WordPress application and merchant provider together with the existing dataset publisher, Dataset Buyer, Buyer Runbook, merchant console, native receiving and shared merchant infrastructure. Its package identity remains `@tokenjunkielabs/starforge-merchant`; the retained source selection distinguishes this product.

## 1. Build and receive the selected product

Use the maintained builder from a complete checkout of the exact release commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout --ref ORIGINAL_COMMIT_SHA \
  --selection wordpress-merchant --out /absolute/wordpress-release
~~~

Keep the returned archive, archive SHA-256 and source manifest together. The manifest binds the original commit, every source member, the selected contribution files and this recipe's original path, Git blob, SHA-256 and byte length. The version contains the `.selection.wordpress-merchant` suffix.

The same output retains its original build operation:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout --out /absolute/wordpress-release --resume
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --out /absolute/wordpress-release --status
~~~

Use `--offline` when the required Git objects are already present. An omitted selection on resume preserves the original recipe; a different product uses its own output.

The current installed runtime supplies Linux, Node 22.16 or newer, Python 3.11 or newer, npm and `flock`. WordPress captures and source packets use the standard Python library. The original Stellar, schema, OpenAPI and MCP peers come from the selected native runtime profile.

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /private/wordpress-runtime \
  --archive /absolute/wordpress-release/ORIGINAL_ARCHIVE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /private/wordpress-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /private/wordpress-runtime --load --source
~~~

Select the real archive path and digest returned by the builder. The final inspection reports the retained selection and verifies its source and native dependency identities. An already received compatible dependency tree can use the original installer's `--adopt-existing`; an existing npm cache can use its `--offline --cache /absolute/cache` options. Keep the complete original profile and lock with that runtime.

The normal installed command is `starforge-merchant`. This recipe adds:

| Entry | Purpose |
| --- | --- |
| `wordpress` | Original source workspace, browser, actions, packet inspection and receiving. |
| `merchant-wordpress` | Typed merchant client, host setup, all 25 tools and complete-file receiving. |
| `merchant-providers` | Existing provider catalog, inspection and initializer. |
| `merchant-mcp` / `merchant-mcp-stdio` | Existing authenticated merchant transports. |
| `runtime-workspace` | Existing managed Applications owner and runtime selection. |
| `buyer-dataset` / `buyer-dataset-workspace` | Existing governed customer acquisition and receiving. |
| `releases` / `merchant-readiness` | Existing seller release and native receiving operations. |

## 2. Open the original source workspace

Choose a private canonical directory and initialize it once:

~~~sh
starforge-merchant wordpress init --dir /private/wordpress/catalog
starforge-merchant wordpress serve --dir /private/wordpress/catalog --port 0
~~~

The serve command returns its actual loopback URL and original workspace/startup identities. Open that URL in the browser. The industrial operator groups the work into source discovery, capture, projection and review, editions, publishing and receiving. Native records and source HTML are displayed as text.

For a managed deployment, choose **WordPress source and merchant workspace** in the existing Applications catalog. Its original application provider binds the selected installed source, workspace UUID and creation identity, original runtime, command operation and actual HTTP listener. Use that same operation to inspect, stop and resume its service.

The full source operator guide is:

`stellar/scf-starforge-20261009/sf30-seller-sdk/wordpress/README.md`

It documents native collection discovery, exact pagination and source findings, mapping types, edition comparisons, merchant terms, source packets and the original publisher. The direct CLI uses the same action and workspace revision contracts as the browser.

## 3. Configure merchant access to that workspace

A private connection file selects existing host directories. Agents and customers use their aliases. The following shows one existing listener, one existing Buyer workspace and one source receiving destination:

~~~json
{
  "schema": "stellar-forge.wordpress-merchant-connection.v1",
  "workspaces": {
    "catalog": {
      "directory": "/private/wordpress/catalog",
      "label": "Editorial catalog",
      "allowStart": false,
      "url": "http://127.0.0.1:8789/"
    }
  },
  "buyerWorkspaces": {
    "reviewer": {
      "directory": "/private/buyers/reviewer",
      "label": "Original Dataset Buyer"
    }
  },
  "receivers": {
    "editorial": {
      "directory": "/private/receiving/editorial",
      "label": "Complete editorial source"
    }
  }
}
~~~

Replace the listener port with its actual startup URL. Select the original initialized Buyer directory. The receiver can be absent beneath an existing private parent. Private directories use mode 0700 and configuration files use mode 0600; the connection reader rejects aliases through symlink components.

Three existing ownership choices are supported:

| Choice | Connection | Lifetime |
| --- | --- | --- |
| Borrow a private listener | `allowStart:false` and its actual `url`. | Its current operator keeps ownership. |
| Borrow managed Applications | `allowStart:false`, `applications:{directory,applicationId}`, no `url`. | The original active Applications operation keeps ownership. |
| Own the original server through the merchant | `allowStart:true`, selected original workspace and optional Python/source pins. | Explicit `open` starts the original server; release drains and closes that owned server. |

The host may pin `workspaceId`, `workspaceIdentity`, `sourceDirectory` and `sourceSha256`. A configuration accepts 1–32 WordPress aliases and up to 64 Buyer or receiving aliases. Source credentials remain in the original WordPress source's environment references. The private controller token stays inside the merchant connection.

Initialize one merchant directory:

~~~sh
starforge-merchant merchant-wordpress init \
  --directory /private/merchants/wordpress \
  --connection /private/config/wordpress-connection.json \
  --name "Editorial WordPress merchant"
~~~

Setup calls the existing SF82 release-store initializer, retains that original selection, creates the complete-export directory and validates the resulting `merchant-mcp.json` with the normal merchant host. Repeating the same setup preserves its original configuration and selected release store.

Start the normal host with the returned configuration:

~~~sh
starforge-merchant merchant-mcp serve \
  --config /private/merchants/wordpress/merchant-mcp.json --port 3211
~~~

The original stdio entry is:

~~~sh
starforge-merchant merchant-mcp-stdio \
  --config /private/merchants/wordpress/merchant-mcp.json
~~~

The generic initializer reaches this same setup:

~~~sh
starforge-merchant merchant-providers init wordpress-workspaces \
  --options /private/wordpress-merchant-setup.json
~~~

Its private options contain `directory`, `connection` and optional `name`. Keep the normal host's actual endpoint and access credential in the existing operator environment. Client commands accept the credential's environment-variable name.

## 4. Work from the native source to a paid edition

Use the original browser or the same named merchant actions. Each mutation retains a saved operation UUID, the expected workspace revision, the action and its exact input.

| Stage | Original work | Merchant surface |
| --- | --- | --- |
| Source | Save the site's advertised REST root, context, account references and request limits. | `source.save`, `source.select`, `source`. |
| Discovery | Read the actual index, post types and taxonomies; choose native collections. | `source.discover`, `job`, `response`. |
| Capture | Retain source pages before advancing their cursors; inspect native totals and source findings. | `capture.start/resume/pause`, `records`, `response`. |
| Mapping | Preview selected native fields and review their types and missing-value behavior. | `projection`, `preview`, `mapping.save`. |
| Edition | Approve exact capture/projection hashes and the original dataset declaration. | `edition.build`, `edition`, `compare`, `dataset_preview`. |
| Merchant terms | Review the real endpoint, asset, recipient and exact atomic amount. | `merchant.save`, `edition.export`, `product.select`. |
| Publisher | Prepare that saved export, preview the original dataset, review and publish its exact draft. | `publisher.prepare/preview/reviewDraft/publish/activateSnapshot/collect`. |
| Seller release | Stage, inspect and explicitly activate, start, stop or roll back the original release generation. | `publisher.release.*`. |
| Buyer | Review the actual quote, prepare its original intent and use the configured SF88 acquisition. | `publisher.buyer.review/prepare/session/run/recover/account/export`. |

Discovery and capture keep their original IDs when resumed. A completed native response saved before a cursor update is consumed once on recovery. A capture that exceeds its declared record or byte ceiling keeps that original declaration; review and create a new capture with the required limits.

The original publisher and Buyer continue to apply their source, quote, approval, budget and transfer rules. The merchant provider resolves host paths from saved original records and aliases. Its client never fills an unreviewed price, invents a buyer workspace or generates a replacement action UUID after an uncertain reply.

### Select the correct export identity

Two different saved objects have different IDs:

| Selection | ID | Original location |
| --- | --- | --- |
| `publisher.prepare` input `exportId` | Workspace export UUID. | Full `state.exports[].id` for the selected product. |
| `artifact` with `kind:"export"` | Workspace export UUID. | The same original export record. |
| Merchant `manifest/file/json/receive`, download or `--export-id` | Immutable merchant export SHA-256. | The top-level result returned by a merchant read or artifact capture. |

Publisher preparation resolves the saved export UUID back to its original workspace directory and checks the selected product. Buyer session creation resolves `buyerWorkspace` to the existing declared Buyer directory. These transformations retain the original action UUID and exact caller selection.

## 5. Read and download the complete original result

Every native JSON response is retained as a complete immutable file. Small responses also fit in `value`; larger responses use a preview with `completeValue:false`. The result carries its workspace UUID/identity, export ID, complete manifest hash, filename, byte count and file SHA-256.

Use the typed client to read the complete state and resume its local delivery:

~~~js
import {openWordPressMerchantClient}
  from '@tokenjunkielabs/starforge-merchant/seller/wordpress/merchant';

const client = await openWordPressMerchantClient({
  url: process.env.WORDPRESS_MERCHANT_URL,
  tokenEnv: 'MCP_ACCESS_TOKEN'
});
try {
  await client.open({workspace: 'catalog'});
  const {result, value: state} =
    await client.callValue('state', {workspace: 'catalog'});
  const receipt = await client.downloadExport({
    workspace: 'catalog',
    result,
    directory: '/private/deliveries/catalog-state'
  });
  console.log({revision: state.revision, exportId: receipt.exportId});
} finally {
  await client.close();
}
~~~

`callValue` reads every JSON byte and verifies its complete length and SHA-256. Downloads use the existing retained-file downloader with a durable local progress record. A changed listener port can serve the same immutable export because its identity binds the original workspace and source hashes.

The CLI exposes the same complete workflow:

~~~sh
starforge-merchant merchant-wordpress inspect \
  --url ORIGINAL_MCP_URL --token-env MCP_ACCESS_TOKEN \
  --workspace catalog --export-id ORIGINAL_MERCHANT_EXPORT_SHA

starforge-merchant merchant-wordpress download \
  --url ORIGINAL_MCP_URL --token-env MCP_ACCESS_TOKEN \
  --workspace catalog --export-id ORIGINAL_MERCHANT_EXPORT_SHA \
  --manifest-sha256 ORIGINAL_MANIFEST_SHA \
  --directory /private/deliveries/catalog-state

starforge-merchant merchant-wordpress reopen \
  --workspace catalog --export-id ORIGINAL_MERCHANT_EXPORT_SHA \
  --manifest-sha256 ORIGINAL_MANIFEST_SHA \
  --directory /private/deliveries/catalog-state
~~~

Reopening verifies the local original manifest and file. File ranges use an immutable opened descriptor; a completed final range releases its reader. The original response limit is 64 MiB and the complete artifact limit is 4,362,076,160 bytes. Larger artifacts stream through the downloader rather than being assembled in client memory.

If native execution completes but the private export cannot be retained, the response keeps the native result and reports `retention.state:"FAILED"` separately. Retain the original operation UUID and inspect it when storage is available.

## 6. Receive the complete source or deliver it as a product

The original `source.packet` action creates the complete retained WordPress workspace packet. Read it through `artifact` with `kind:"packet"`; the immutable merchant export has kind `source-packet` and the exact filename `wordpress-source.zip`.

The merchant `receive` tool accepts that original packet export and a declared receiver alias. It verifies the manifest and full packet hash before invoking the original receiver:

~~~sh
starforge-merchant merchant-wordpress receive \
  --url ORIGINAL_MCP_URL --token-env MCP_ACCESS_TOKEN \
  --workspace catalog --export-id ORIGINAL_PACKET_MERCHANT_EXPORT_SHA \
  --manifest-sha256 ORIGINAL_PACKET_MANIFEST_SHA --receiver editorial
~~~

The original receiver validates the complete packet, preserves source/capture/edition identities, and resumes or verifies the same selected destination. Its complete receiving response is another retained merchant JSON export. If that response is interrupted, repeat the same packet export, manifest and receiver selection.

For paid complete-source delivery, use the original `source.files` action to project that packet into the maintained file dataset. Its full manifest travels in the original MANIFEST member, while compact source metadata stays within the existing publisher's one-MiB limit. Publish, review and acquire it through the same seller and SF88 file projection. The customer's original receiver reconstructs and validates every retained file before reopening the WordPress workspace.

## 7. Continue and close the original operation

After an uncertain `act`, inspect `operation` with its saved UUID before choosing another action. Repeating the original action uses the same UUID and exact input. A genuine revision conflict requires review of current state before a new operation. Discovery and capture resumes keep their original job and source; the buyer's recovery keeps its original acquisition and payment attempt.

`release` drains this provider's requests and closes only the original server it started. Managed Applications and borrowed listeners keep their owner. Merchant host shutdown also drains pending work, releases retained readers and waits for its owned WordPress server to close.

The full client reference, all 25 tool signatures, all 33 action field sets and complete download/receiving contract are in:

`stellar/scf-starforge-20261009/sf30-seller-sdk/wordpress/merchant/CLIENT.md`

The original real WordPress installation, source mutation, publisher, native Stellar purchase and complete customer receiving operation are defined in:

- `stellar/scf-starforge-20261009/sf30-seller-sdk/wordpress/native/README.md`
- `stellar/scf-starforge-20261009/sf30-seller-sdk/wordpress/native/TESTNET.md`

Those guides retain their original source selection and operation. Release acceptance records bind the actual source and native outcome used for the installed product.
