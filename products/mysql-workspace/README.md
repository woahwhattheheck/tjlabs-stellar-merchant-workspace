# MySQL merchant workspace

A complete MySQL and MariaDB product in the original Stellar Forge merchant runtime. The same private product owns the schema-driven SQL editor, saved working versions, reviewed merchant releases, native dataset publisher, versioned dataset seller, customer clients and portable receiving history.

The browser, authenticated MCP tools, Node client and CLI share the original MySQL compiler, prepared package, publisher journals and dataset writer. A prepared release is the source of its publication workspace. The public dataset route uses an explicitly reviewed payment alternative from that same release.

## Install and initialize

Select `distribution/selections/mysql-workspace.json` with the repository’s original source-selection/runtime installer. It retains the MySQL driver package, original publisher browser assets, dataset seller, buyer workflow, merchant agent, Applications and customer delivery support. The installed commands include `starforge mysql-product`, the original `mysql`, `mysql-workspace` and `mysql-publisher`.

From a source checkout, use:

```sh
node products/mysql-workspace/cli.mjs --help
```

Use the supported Node 22+ Linux runtime and its original installed MySQL dependencies. Supply an existing private `stellar-forge.mysql-source.v1` source file. The original MySQL guide at `stellar/scf-starforge-20261009/sf30-seller-sdk/mysql/README.md` describes its connection, approved query declarations, exact scalar rules and environment references.

```sh
starforge mysql-product init \
  --dir /private/mysql-sales \
  --source /private/config/mysql-source.json \
  --name "Sales data" --workspace sales

starforge mysql-product inspect --dir /private/mysql-sales
starforge mysql-product open --dir /private/mysql-sales --browser-only
```

Open the complete browser URL printed by the foreground process, including its private fragment. The database password stays in the environment named by the source. Initialization preserves the original source, copies its configured CA and records a portable runtime source. A changed source belongs in a newly initialized product.

For authenticated agents, supply a bearer token of at least 24 printable non-space ASCII characters through an existing environment variable, then open with the original MCP listener:

```sh
starforge mysql-product review --dir /private/mysql-sales --port 0
starforge mysql-product open --dir /private/mysql-sales --port 0
starforge mysql-product tools
starforge mysql-product call --dir /private/mysql-sales \
  --tool merchant_mysql_product_status
```

`MCP_ACCESS_TOKEN` is the default token reference. `--token-env` selects another existing environment variable. The product writes its private current `connection.json`, containing endpoint and identity metadata. The bearer value is never written there. The original merchant transport also retains its configured OAuth and allowed-client-origin behavior.

If the merchant must verify and settle native payments, select its existing HTTPS facilitator during initialization. The original factory also accepts an explicit `http://127.0.0.1:PORT` facilitator with `--allow-local-facilitator`. The returned seller mode identifies the actual operating mode. Seller payment schemes, networks, assets, amounts, destinations and timeouts remain the original reviewed terms.

## Author and retain working versions

The original editor reads actual `information_schema` tables and columns. Select the public projection, typed filters, ordering and route. Enter the public HTTPS origin and complete payment terms, then use the native source review, example execution and prepared-release workflow.

**Save working draft** retains all current editor fields, including an unfinished endpoint and unparsed payment-extra text. Each saved version has an original request UUID, expected draft revision, note and digest. **Working drafts & handover** reopens any selected version. Reopening compares it with the current source schema; the saved version remains intact. Review the current source before preparing another release.

Saving from a historical version checks that exact selected revision. If another version is already current, reopen it or choose **Save as a separate draft**. A lost save response is recovered from **Saved actions & recovery** with the same request and input.

The original **Saved releases** view verifies the retained manifest before running the SQL seller or exporting its customer SDK. Product exports retain the complete original client bytes under `customer-clients/`, so those exact bytes travel with a complete handover.

## Publish an immutable dataset

1. Open a prepared release and select **Open dataset publication**.
2. Open its original publisher console. Inspect the approved source query, save the public dataset projection and deterministic extraction order, and start a retained extraction.
3. Inspect the resulting candidate, exact values and dataset preview. Record the reviewer and note, then initialize the absent dataset target or publish against the displayed original snapshot and revision.
4. Return to **Dataset publication** and refresh. Review the dataset route and one exact payment alternative from the prepared release, together with the current snapshot and revision.
5. Save that reviewed configuration and start its versioned dataset seller. The original seller advertises snapshot selection, so its buyer configuration stays bound to the selected retained version.
6. Use **Buyer handoff** to read the actual running offer. Select the advertised accept index and original customer intent ID, then retain and download its native SF88 buyer configuration.

The original publisher console and MCP tools retain recurring-publication policies, occurrence IDs, candidates, review and recovery. Opening a publication resumes an already enabled native schedule. Closing it drains the original source operations and seller, while preserving the saved policy. See [OPERATING.md](OPERATING.md) for the complete lifecycle and receiving procedure.

The MySQL extraction uses the original read-only, repeatable-read transaction and exact scalar encoder. A consistent snapshot is meaningful for transactional source tables such as InnoDB. Review the source engine and approved query accordingly. Exact DECIMAL and large integer values should retain their declared string projection when the original dataset number/integer representation cannot preserve them.

## Complete receiving

Create a complete handover in the browser or through the native product tool using one request UUID. The owner closes SQL sellers, publication browsers, schedulers and versioned sellers through their original lifecycle before inventorying and streaming the workspace. The editor reopens when that archive is retained. Select intended publication and seller activity explicitly afterward.

A complete handover includes private source and CA, every saved draft/version, prepared SQL packages, retained customer SDK bytes, native publication plans/candidates/reviews, schedules, dataset versions, original release store and full product action history. It preserves empty native directories and file/directory modes. Previous generated handover copies and ephemeral listener capabilities are excluded to avoid recursive archives.

```sh
starforge mysql-product download --dir /private/mysql-sales \
  --kind archive --request-id ORIGINAL_UUID --output /private/received-files

starforge mysql-product inspect-archive \
  --archive /private/received-files/ORIGINAL_UUID.tar.gz

starforge mysql-product restore \
  --archive /private/received-files/ORIGINAL_UUID.tar.gz \
  --dir /private/received-sales --sha256 SELECTED_SHA256 --product-id ORIGINAL_PRODUCT_UUID
```

Or use `receive` to perform the original resumable download, whole-archive inspection and selected restore in one command:

```sh
starforge mysql-product receive --dir /private/mysql-sales \
  --request-id ORIGINAL_UUID --output /private/received-files \
  --restore /private/received-sales --sha256 SELECTED_SHA256
```

The original MCP file reader supports a retained compressed file up to 8 GiB. Larger complete archives can be transferred through the browser’s streamed download or the operator’s private file-transfer route, then inspected and restored with the same commands. The archive parser supports at most 20,000 combined regular files/directories, 32 GiB of file content and individual files below 8 GiB.

Restore selects the complete archive SHA-256 and original product UUID, verifies every member before publishing the new directory, and records `MYSQL_RECEIVED.json`. Repeating the same receive returns that retained receipt and preserves work subsequently created in the destination. Reopen the received product using its current directory and the original credential references.

## Node and managed Applications

```js
import { MysqlProductClient } from '@tjlabs/stellar-merchant-workspace/products/mysql-workspace/client';

const client = new MysqlProductClient({
  connectionFile: '/private/mysql-sales/connection.json'
});
const status = await client.status();
const release = await client.release('SalesCatalog');
const publication = await client.publicationOpen({
  releaseId: release.releaseId,
  manifestSha256: release.manifestSha256,
  browser: true
});
```

Use the actual package name selected by your installed distribution when it differs from the example. The exported module also supports direct source imports. `client.call` exposes the exact installed product catalog. `publicationCall` delegates the original publisher actions; `prepareHandover`, `receiveFiles` and `receiveHandover` retain native file hashes and download checkpoints.

The original **Applications** catalog contains **MySQL merchant workspace**. Select the initialized private product directory, environment file and listener settings. Its review binds the original source/CA/configuration hashes and directory identities. Start follows the retained launch binding; the returned browser and agent endpoints must match that same product. The shared Applications runner supplies the selected port once and owns the normal process lifecycle.

## Source layout and license

The product is additive under `products/mysql-workspace/`. Four narrow original joins provide the trusted MySQL browser extension and editor controller, portable source-publisher path bindings, and relocated original buyer-handoff lookup. Existing source-specific drivers and the current merchant provider registry remain composed.

This repository’s MIT license applies.
