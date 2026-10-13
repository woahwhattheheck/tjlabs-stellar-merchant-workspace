# Complete Zarr receiving and handover

This entry completes the retained Zarr source workspace, original dataset publisher, SF82 merchant and customer lifecycle, source-owned Merchant MCP tools, installed Applications, and independent receiving. It continues one selected operation. The original source stage and every later publisher request keep their saved identities.

The full source stage uses the original Zarr v3 and v2 interoperability archives from zarr-developers/pizzarr. The original generators, exact archive hashes, source path mapping and MIT notices are included. The native application uses zarr-python 3.4.1 and the exact component requirements. The complete comparison covers 40 arrays and 338 cells, plus a four-cell strided temperature selection. These are upstream interoperability examples, not a new environmental measurement or a customer dataset.

The merchant continuation keeps those accepted results. It publishes the 35 original ragged-array cells in ascending and descending ordinal order, and the four temperature cells with their source coordinates. The first publication uses the real browser controls; the second uses the same publisher through MCP. SF82 preserves an old snapshot cursor across publication and exports the six original customer files. Applications starts, opens, stops and reopens the same native workspace. The final receiver opens the copied workspace and all three publications.

## Source responsibilities

| File | Responsibility |
| --- | --- |
| receiving.mjs | Exact selection, original permanent operation lease and serial full workflow. |
| receiving/source-stage.py | Original imports, all-array comparisons, review/freeze, packet and independent source receiving. |
| receiving/original-expectations.json | Complete original generator-derived populations and example path mapping. |
| receiving/common.mjs | File identities, native calls, exact pagination and retained captures. |
| receiving/merchant.mjs | Browser, publisher, SF82 and borrowed MCP continuation. |
| receiving/customer.mjs | Original six-file export, lost reply recovery, range read and offline request. |
| receiving/applications.mjs | Installed Applications review/start/Open/Stop/reopen sequence. |
| receiving/package.py | Complete closed archive, immutable member plan and completed-partial recovery. |
| receiving/START.py | Whole ZIP verification and original native packet adoption. |
| receiving/reopen.mjs | Actual received app, publisher and browser reopening. |

The deployment.mjs module prepares the original five-file SF82 package from a reviewed, published native candidate. Original SF82 schema, target store, release and runtime behavior remain authoritative. It does not decode arrays or create a replacement dataset engine.

The zarr-merchant selection includes the complete component and its original publisher, dataset-refresh, buyer, SF82, MCP, Applications and installer dependencies. Both original binary example ZIPs are explicit support entries. The maintained builder keeps its normal source filters and size limits.

## Existing environment and exact source installation

Use an existing Linux/POSIX host with Node 24 or later, Python 3.12 or later, flock, and actual Chromium/Playwright. No paid host or remote database is required for these retained sources.

Install requirements-native.txt in the selected Python environment, or a private dependency directory selected through pythonPaths. Its exact versions are zarr 3.4.1, numpy 2.5.4, numcodecs 0.17.0, donfig 0.8.1.post1, google-crc32c 1.9.0, msgspec 0.22.0, packaging 26.3, typing_extensions 4.16.0 and PyYAML 6.0.3. The whole operation inherits that selected PYTHONPATH.

Build the committed whole selection with the original builder:

~~~sh
node "$ZARR_REPO/stellar/scf-starforge-20261009/distribution/build.mjs" \
  --repo "$ZARR_REPO" --ref "$ZARR_SOURCE_COMMIT" \
  --selection zarr-merchant --out "$ZARR_RELEASE"
~~~

For an interrupted build, add the original --resume only with the same commit, selection and output. Read the actual distribution.json receipt. Use its archive and sha256 fields, not a guessed filename or a source hash.

~~~sh
node "$ZARR_REPO/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" prepare \
  --dir "$ZARR_RUNTIME" --archive "$ZARR_ARCHIVE" --sha256 "$ZARR_ARCHIVE_SHA256" \
  --native --feature mcp --operator --pins "$ZARR_NATIVE_PINS"

node "$ZARR_REPO/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" install \
  --dir "$ZARR_RUNTIME"

node "$ZARR_REPO/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" inspect \
  --dir "$ZARR_RUNTIME" --load --source
~~~

Use resume for the same prepared runtime. An existing complete dependency tree can be adopted only through the installer's own --adopt-existing contract. The original profile selects exact native dependencies and locks; a packet does not itself install those peers. The Stellar peers used by this source are @x402/core, @x402/stellar and @x402/extensions 2.28.0 and @stellar/stellar-sdk 16.3.0.

The READY sourceRoot is ZARR_RUNTIME/package/source. Its exact manifest is ZARR_RUNTIME/package/manifest.json. The receiving entry checks the actual state, sourceRoot and sourceManifestSha256 returned by the original inspectMerchantRuntime API. Applications independently checks that same installation before a managed start.

## Preserve the original source operation

For an already completed source stage, keep its exact native-source-selection.json, source-stage/result.json, workspace, packet and operation ID. The source stage adopts its completed result and verifies the packet; it does not repeat the arrays.

For a fresh receiving host, use the complete sources and cuts from receiving/original-expectations.json. Resolve each source file against the installed Zarr component, retaining the archive SHA, store root, full expected populations and provenance. Choose one private outputRoot and workspace. Save the declaration before execution with schema stellar-forge.zarr-native-source-selection.v1 and the selected operationId. The source-stage result path is always outputRoot/source-stage/result.json.

The exact original expectations are a complete input artifact. Do not substitute one example row, a shortened array list, regenerated ZIPs, or a fabricated provider response. Every source-stage mutation delegates to the original application and stores its request before dispatch.

## Whole receiving selection

Create one private selection outside the source and receiving output directories. All paths are canonical absolute paths. The native source workspace and the receiving output are separate roots.

The following JSON shows the complete structure. Replace host paths and reviewed merchant terms with actual values; placeholder strings are not runnable credentials or verified terms.

~~~json
{
  "schema": "stellar-forge.zarr-receiving-selection.v1",
  "operationId": "YOUR_ORIGINAL_ZARR_OPERATION",
  "sourceRoot": "/private/zarr-runtime/package/source",
  "sourceManifest": {
    "file": "/private/zarr-runtime/package/manifest.json",
    "sha256": "ACTUAL_READY_SOURCE_MANIFEST_SHA256"
  },
  "runtimeDirectory": "/private/zarr-runtime",
  "engineArchive": {
    "file": "/private/zarr-release/ACTUAL_ORIGINAL_ARCHIVE.tar.gz",
    "sha256": "ACTUAL_ORIGINAL_BUILD_ARCHIVE_SHA256"
  },
  "operationDirectory": "/private/zarr/whole-receiving",
  "workspaceDirectory": "/private/zarr/source-workspace",
  "python": "/absolute/original/python3",
  "pythonPaths": ["/private/zarr-python-dependencies"],
  "browser": {
    "module": "/absolute/installed/playwright/index.mjs",
    "executable": "/absolute/existing/chromium"
  },
  "sourceStage": {
    "inputFile": "/private/zarr/native-source-selection.json",
    "resultFile": "/private/zarr/source-stage-output/source-stage/result.json"
  },
  "frozenSelection": {
    "primary": {"source": "v3", "array": "ragged_2d"},
    "secondary": {"source": "v3", "array": "var_group/temperature", "cut": "temperature-strided"}
  },
  "merchant": {
    "origin": "https://YOUR_REVIEWED_DEVELOPMENT_ORIGIN",
    "path": "/YOUR_REVIEWED_ZARR_RESOURCE",
    "payment": {
      "scheme": "exact",
      "network": "stellar:testnet",
      "asset": "EXISTING_REVIEWED_TESTNET_ASSET",
      "payTo": "EXISTING_REVIEWED_TESTNET_RECIPIENT",
      "amount": "10000",
      "maxTimeoutSeconds": 60
    },
    "nextAmount": "20000"
  },
  "inputFile": "/private/zarr/whole-receiving-input.json"
}
~~~

The receiving scope is local development challenges and offline buyer/client configuration. It does not create, fund, sign with, or settle through an account. Select development terms from the existing authorized configuration. A placeholder asset or recipient is not evidence of a funded account or a usable production service.

Preparation pins the actual source manifest, original engine archive, full entry source, original source declaration, and any already completed source-stage result. It makes no import, array extraction, publisher or payment call.

~~~sh
node "$ZARR_RUNTIME/package/source/stellar/scf-starforge-20261009/distribution/cli.mjs" \
  zarr-receive --prepare "/private/zarr/whole-receiving-selection.json"

node "$ZARR_RUNTIME/package/source/stellar/scf-starforge-20261009/distribution/cli.mjs" \
  zarr-receive --input "/private/zarr/whole-receiving-input.json"
~~~

The entry acquires the permanent operation lock and runs the stages serially. Progress is emitted as JSON lines. A result.json with state NATIVE_COMPLETE means the source, merchant and Applications legs finished. A delivery.json with state COMPLETE additionally requires the whole archive, independent native receiving, and actual received app/publisher/browser reopening.

## Native sequence

1. The original source stage retains complete raw stores, metadata, scalar classes, coordinates, revisions, reviews and frozen bytes. Its independent receiver keeps the same UUID and history.
2. The browser displays the original hierarchy and four-cell temperature result. Preparing/applying the completed native selection UUID twice returns its original result, without another array result.
3. The completed original packet is opened after the packet source update. Its export ID, manifest and bytes remain unchanged.
4. The browser saves the primary plan, extracts and inspects all 35 cells, reviews the exact candidate and publishes it. A separate native publication retains the four-cell temperature projection.
5. MCP borrows the same publisher from the existing server. It reads the same frozen/result identities, adopts the original request, prepares a pinned buyer configuration and publishes the explicit descending ordering.
6. SF82 stages the two reviewed packages. The current dataset advances while the earlier cursor remains bound to its original snapshot. Development challenge terms change only as explicitly selected.
7. The customer browser recovers a withheld successful generation reply, downloads all six original files, verifies a range and builds an offline snapshot-pinned request.
8. MCP streams the complete current source packet with both chunk and whole-file hashes. The original source receiver adopts it independently.
9. Earlier owners close. Installed Applications uses the reviewed source/runtime identity, starts and opens the real workspace, resolves retained start state, stops, reopens, and performs its second explicit reviewed start/stop.
10. The closed whole archive is independently received. The original app opens its native UUID, revision and results; each original publication is reopened and all values compared. Actual received browser captures are retained.

## Full private handover

The final handover/Zarr_Complete_Receiving.zip contains the complete current native packet; all original source-stage requests and receipts; the original publisher workspaces, dataset version stores and publisher action receipts; merchant/customer and Applications histories; actual captures; the original selected engine archive and manifest; and the complete Zarr source, examples, licenses and guides.

HANDOVER.json lists every regular member, byte count, SHA256, executable mode and role. The archive plan freezes that selection before writing. A completed archive is verified and reused even if its receipt was lost. A complete unpublished attempt can be adopted under the same plan. Incomplete partials and unrelated files remain available for recovery.

This ZIP is private operator material. The six generated files under receiving/merchant/received-client are the separate customer handover. Do not publish private workspaces or runtime declarations as customer source.

## Independent receiving

Use the complete receiving/START.py from the selected source, or the included START.py alongside the archive. Select the exact archive hash from the package result.

~~~sh
python3 START.py inspect \
  --archive "/private/Zarr_Complete_Receiving.zip" \
  --sha256 "ACTUAL_COMPLETE_ARCHIVE_SHA256"

python3 START.py receive \
  --archive "/private/Zarr_Complete_Receiving.zip" \
  --sha256 "ACTUAL_COMPLETE_ARCHIVE_SHA256" \
  --directory "/private/received-zarr"
~~~

The script validates the entire archive before extraction. The included original packet receiver owns native SQLite/history adoption. Only the selected publisher, dataset and publisher-request additions are then restored. No service starts automatically. A repeated completed receive preserves later native and publisher work instead of recopying an old database.

The full automated entry additionally opens this received workspace with the same original installed runtime, validates every original publication, captures the real browser and closes services. On another host, install the included original engine with the maintained installer, select matching Python/browser dependencies, and create explicit private connections as described in [WORKSPACE.md](WORKSPACE.md).

Publisher source/target paths are relative to their workspace. The public resource, local seller listener and historical SF82 declarations retain their original values. Review the intended listener and deployment before starting them on a new host; the receiver does not silently rebind or reactivate an old runtime.

## Interruptions and source updates

Keep the exact prepared input and operation directory. Resume the same --input command. The permanent lock rejects another active owner. Native source UUIDs, browser publisher requests, customer exports and managed application runs retain their original journals.

When NATIVE_COMPLETE exists, completed native legs are skipped and package/receiving continues. When delivery.json is complete, the entry verifies its archive and result identities and returns them. No array stage is repeated.

Do not change the prepared input, source manifest or native request under the same operation. A source correction must explicitly preserve and continue its original saved state. The native packet implementation separately supports completed export replay after a code upgrade: it validates the original retained intent/application/manifest first. A new application edition receives a new export ID.

Completion claims follow the actual receipts. Authored source, a READY runtime, a complete source packet, complete merchant/customer work and a fully received archive are separate observations.
