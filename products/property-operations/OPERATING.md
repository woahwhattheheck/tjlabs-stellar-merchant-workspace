# Property Operations

Use the installed Property Operations workspace to review an existing Socrata property baseline, retain complete property and inspection responses, reconcile explicit identities, compare editions and deliver reviewed resources. The browser, JavaScript SDK, merchant tools and Applications operate the same original workspace and history.

The maintained source selection is `property-operations`. It includes the original Property Operations model, Socrata capture/query/portable implementation, current publisher and facilitator controls, complete merchant attachment and the original managed receiving programme. [Receiving and continuation](RECEIVING.md) describes the installed end-to-end operation. [SOURCE_ADOPTION.json](SOURCE_ADOPTION.json) identifies the adopted source and exact composition.

## Install a complete selected runtime

Use **Node 24 or later**. The original workspace uses Node's native SQLite; the Applications provider checks this requirement before launch. The complete receiving programme also uses Linux, Python 3 and GNU tar/flock. Browser receiving uses an explicitly selected existing Playwright module and Chromium executable. The module may expose Chromium directly or through its CommonJS default export. Desktop/mobile screenshots stay in the operation's private inspection directory; the customer package retains the browser report and complete native download.

From an owned checkout containing this integration, select one immutable source commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace \
  --ref COMPLETE_SOURCE_COMMIT \
  --selection property-operations \
  --out /absolute/property-release

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/property-runtime \
  --archive /absolute/property-release/ORIGINAL.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/property-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/property-runtime --load --source
~~~

Keep the actual package archive, byte count, SHA-256, source commit, selected recipe and READY installation. Its version contains `.selection.property-operations`. Run the installer with the selected Node 24+ executable. The original installer's existing-dependency adoption and offline/cache contracts are documented in [RUNTIME_INSTALL.md](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md).

Continue a partial build with the original output directory and `build.mjs --repo /absolute/merchant-workspace --out /absolute/property-release --resume`; continue installation with `runtime-install-cli.mjs resume --dir /absolute/property-runtime`. Their retained source selections determine the continuation.

Commands below use `starforge` from this READY installation. The equivalent selected-runtime invocation is:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/property-runtime -- property-application --help
~~~

The source-owned contribution registers `property-application`, `property-mcp`, the `property-operations` Applications provider and `property-workspaces` merchant provider. The named selection also retains the maintained Socrata commands, merchant provider initializer and Console.

## Open the existing property workspace

Select the original Socrata workspace containing `workspace.json`. Its immutable `createdAt` identifies the workspace before a Property record exists. The Property model subsequently has its own ID and revision. Keep those identities distinct from an Applications ID, a native request key and a customer export ID.

Inspect the selected binding:

~~~sh
starforge property-application binding \
  --directory /private/property/original-workspace \
  --connection-file /private/property/operator/connection.json
~~~

A direct foreground launch uses the exact returned binding and original creation time:

~~~sh
starforge property-application serve \
  --directory /private/property/original-workspace \
  --connection-file /private/property/operator/connection.json \
  --expected-created-at ORIGINAL_CREATED_AT \
  --expected-binding-sha256 REVIEWED_BINDING_SHA256 \
  --port 0
~~~

The complete installed manifest, every original source file, selected Node executable, workspace and optional vendor host settings are bound before startup. The private connection record carries the authenticated loopback URL and original owner instance. Stop drains the original listener and workspace and removes only that instance's exact announcement.

For the managed route, attach the READY runtime to the existing Runtime workspace:

~~~sh
starforge runtime-workspace init --workspace /private/property/runtime-desk
starforge runtime-workspace attach --workspace /private/property/runtime-desk \
  --runtime /absolute/property-runtime --label "Property Operations"
starforge runtime-workspace serve --workspace /private/property/runtime-desk --port 8465
~~~

Select **Applications → Property Operations**, the READY installation and the existing workspace. Set the private connection-file location and, when required, the original vendor host settings file. Use **Review**, **Save**, **Connect**, **Start**, then **Open**. The original manager owns source adoption, resource admission, startup verification, run history and Stop recovery. SDK and merchant clients borrow the running workspace through its connection record.

When source adoption relocates the complete package, the binding retains the original manifest and member hashes. Mutable Property revisions can advance during that lifetime. Reopen the same saved application after normal Stop to continue its existing records.

## Retain and review property evidence

The Property views cover four connected activities: baseline and property selection; complete vendor/source editions; explicit identity and comparison review; and inspection/report/resource delivery.

1. Save a baseline from the complete retained HPD edition and reviewed source-column mapping. An HPD row is a building-in-project record; multiple rows can refer to one building or parcel.
2. Select the actual properties and reviewed source fields. Keep building IDs, BBL, BIN, addresses, vendor IDs and RentCheck property IDs in their original representation.
3. Prepare a request against the selected account contract or import its complete already returned bytes. Review the retained request before an authorized host dispatch.
4. Save explicit links, comparisons and inspection/report bindings. Preserve the source edition, field pointers, review actor and note.
5. Export the selected resource and its complete provenance, then use its original publisher/customer workflow.

A missing field remains distinct from null and zero. Vendor jurisdictional coverage does not turn an HPD row into a violation. Address similarity is a candidate for review; it does not replace an explicit identity link. Property-level or parcel-level values remain attached to their original scope.

The [original domain operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/property-operations/OPERATING.md) contains full native payload examples, comparison rules, rights selection and provider limits. The [interface guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/property-operations/INTERFACES.md) covers all SDK and agent methods.

### Current RentCheck source and account selection

The original source owner subsequently captured the complete officially linked OpenAPI document on 12 October 2026: [developer portal](https://developers.getrentcheck.com/), [linked YAML](https://rentcheck-lambdas-static-files.s3-us-east-2.amazonaws.com/doc_specs.yml). The retained document is 434,208 bytes, SHA-256 `3865e074ff61d2ac05a0b49ddad6f85c3efaf392c8602bfcf83f845cb36d7808`, with 42 paths, 66 operations and 56 schemas; its observed Last-Modified is 8 October 2026.

Use the selected account's reviewed contract and exact returned source. The retained specification and separate guide have unresolved inspection-list v2/v3 and maintenance-report wrapper differences. Keep those differences explicit when choosing request paths and response pointers. A successful HTTP response can contain per-property creation successes, errors and warnings. A creation conflict and an uncertain response require their original outcome to be reconciled before another dispatch.

The application keeps vendor access disabled unless the host supplies the original private configuration with enabled contracts and credential environment references. Supply it with `--property-host /private/property/vendor-host.json` or the corresponding Applications field. Credential values belong in the existing host environment. The complete official contract is retained by its source owner; this product guide links that source and preserves account-specific review.

## Operate through the native SDK

~~~js
import {
  createPropertyOperationsClient,
  readPropertyConnection,
} from '@tokenjunkielabs/starforge-merchant/property/client';

const connection = await readPropertyConnection('/private/property/operator/connection.json');
const client = createPropertyOperationsClient({
  url: connection.url,
  expectedCreatedAt: connection.createdAt,
});

try {
  const state = await client.status();
  const prepared = await client.prepare('property.baseline.save', {
    edition_id: SELECTED_EXISTING_EDITION,
    columns: REVIEWED_COLUMN_MAPPING,
    actor: 'Property receiving operator',
    note: 'Preserve the complete existing baseline.',
  }, {key: ORIGINAL_OPERATION_KEY});

  // Retain this complete prepared value in the original operation journal.
  const saved = await client.invoke(prepared);
  console.log(saved.result);
} finally {
  await client.close();
}
~~~

The saved envelope carries the action, key, Property ID, expected revision and input digest. After a lost response, call `inspectPrepared(prepared)` on the original object:

| Disposition | Continuation |
| --- | --- |
| `DONE` | Reuse the original committed result. |
| `ISSUED` | Preserve the original request and evidence; explicit `resumeIssued` uses retained-evidence recovery. |
| `ABSENT_AT_ORIGINAL_REVISION` | Invoke the same prepared request against the unchanged original revision. |
| `ABSENT_AFTER_CHANGE` | Review the advanced workspace before preparing a new decision. |

Use `record(group,id)` for a complete original record. `receiveFile(selection,{onChunk})` retains the original descriptor and verifies all bytes against its length and SHA-256. Closing the client drains its calls while leaving the original application owner alive.

## Attach the merchant tools

Create a private connection document:

~~~json
{
  "schema": "stellar-forge.property-workspaces.v1",
  "workspaces": {
    "portfolio": {
      "label": "Original portfolio",
      "directory": "/private/property/original-workspace",
      "urlFile": "/private/property/operator/connection.json",
      "expectedCreatedAt": "ORIGINAL_CREATED_AT"
    }
  },
  "files": {
    "reviewed-source": {
      "path": "/private/property/received/complete-source.json",
      "bytes": 12345,
      "sha256": "COMPLETE_SOURCE_SHA256"
    }
  }
}
~~~

Replace illustrative values with the actual selected files. `urlEnv` is the alternative to `urlFile`; choose one. Optional `expectedPropertyId` binds an already created Property workspace. File aliases are declared by the host, and complete bytes are checked again before import.

The original initializer takes a separate private setup JSON:

~~~json
{
  "directory": "/private/property/merchant",
  "connection": "/private/property/operator/workspaces.json",
  "name": "Property Operations"
}
~~~

Run `starforge merchant-providers init property-workspaces --options /private/property/operator/setup.json`. Retain its returned original merchant configuration, then serve it with the maintained merchant MCP host and original bearer-token environment selection. The initializer uses the existing SF82 release store and private export area.

The 22 tools retain the `merchant_property_` prefix:

| Work | Actions |
| --- | --- |
| Connection and identity | `workspaces`, `status`, `reconnect` |
| Complete records | `records`, `record`, `operation` |
| Reviewed mutation | `prepare`, `file_import_prepare`, `inspect_request`, `invoke`, `action` |
| Native and publisher files | `files`, `file`, `file_read`, `file_release`, `publisher_file`, `publisher_file_read` |
| Complete export receiving | `export_prepare`, `export_manifest`, `export_inventory`, `export_file`, `export_file_release` |

Preserve each inventory's revision for all pages. Read full records by their selected IDs. Agent file requests select host aliases or original retained descriptors. The `action` tool retains the original read/publisher/query/export interface; Property mutations use the prepared envelope.

`starforge property-mcp tools` lists the declared tools. `call` takes `--url`, `--action` and an `--arguments` JSON file, with the original workspace alias and token environment. Use its complete JSON output for decisions and retain the original response if output publication is interrupted.

## Publish a selected resource

A reviewed Property resource owns its own original publisher directory and exact source export. Select the resource in the Property UI, then use the maintained publisher to prepare and review a draft, publish/activate a snapshot, control releases and receive the original buyer's complete files.

The current installed publisher retains facilitator history, inspection, review and staging for both the original Socrata publisher and each selected Property resource. The SDK exposes those same four publisher operations and the exact facilitator review/response downloads. Resource changes reset the browser's previous facilitator selection while keeping each publisher's saved history.

The Socrata CLI preserves `--facilitators FILE` for a host that already selects its facilitator profiles. Publisher dispatch continues through the original native release and buyer engines. The Property wrapper binds `resource_id` and the original nested publisher payload; preparation uses that resource's reviewed export directory.

## Receive complete files and reopen them

Select an existing native source export or Property resource. Merchant `export_prepare` retains its complete manifest and inventory. It does not start another native export.

~~~js
import {openPropertyClient, reopenPropertyExport}
  from '@tokenjunkielabs/starforge-merchant/property/merchant-client';

const client = await openPropertyClient({
  url: ORIGINAL_MERCHANT_URL,
  tokenEnv: 'ORIGINAL_MERCHANT_TOKEN',
  workspace: 'portfolio',
});
try {
  const retained = await client.exportPrepare({
    createdAt: ORIGINAL_CREATED_AT,
    selection: {kind: 'source-export', exportId: EXISTING_NATIVE_EXPORT_ID},
  });
  await client.download({
    directory: '/private/property/customer/received-export',
    exportId: retained.exportId,
    expectedManifestSha256: retained.manifestFile.sha256,
  });
} finally {
  await client.close();
}
await reopenPropertyExport({
  directory: '/private/property/customer/received-export',
  exportId: ORIGINAL_RECEIVING_EXPORT_ID,
  expectedManifestSha256: ORIGINAL_MANIFEST_SHA256,
});
~~~

The receiving engine preserves the endpoint, workspace identity, immutable manifest and per-file checkpoints. Continue an interrupted download with that same directory and selection. Offline reopen verifies every complete file after the merchant listener and borrower have closed.

For a whole native workspace, the original `package.export` retains `starforge-socrata.json.gz` with all source and Property bytes. Import it into an empty owned target with the original Socrata CLI. Seller and buyer state use their original separate backup contracts. [RECEIVING.md](RECEIVING.md) covers the combined original managed application, customer download and cold restoration.
