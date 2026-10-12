# PMTiles map releases in the Merchant Workspace

This selection packages the original PMTiles authoring workspace, native map
inspection, Martin release lifecycle, managed Applications, paid output sales,
merchant MCP and Object Buyer. A map operator retains complete regional archives and styles,
reviews one saved edition, publishes it, and gives the customer a complete
workspace that can reopen and restore earlier releases.

Use this product from the [TokenJunkieLabs Merchant Workspace](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace).
Its existing `starforge` command, Applications catalog and installation engine
operate the same saved source and customer workspace.

The source recipe is `pmtiles-operations.json`. The maintained source composer
selects the commands, named exports, Applications and merchant providers from
the original declarations, including the complete paid-output contribution.
The Applications are PMTiles map releases, Object Buyer, Buyer Runbook and
Merchant console. The installed registration response lists the actual
selected commands and providers. The build
receipt records the selected commit, complete file inventory, recipe identity,
archive byte count and SHA-256.

There are two original runtime selections:

| Selection | What it operates |
| --- | --- |
| READY merchant installation | Applications, installer, original Stellar/x402 Object Buyer and merchant MCP |
| PMTiles runtime JSON | The selected PMTiles and Martin executables, map validator, browser bundle, worker and process launcher |

Select both explicitly. A portable PMTiles operations package supplies its
native map runtime and saved workspace; the full merchant installation supplies
the managed Applications and MCP source.

## 1. Build the committed source selection

Clone or update this complete merchant checkout and select the exact committed
edition you intend to operate:

~~~sh
git clone https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace.git
cd tjlabs-stellar-merchant-workspace
~~~

The checkout contains the PMTiles product, its three distribution contributions and
this complete source selection. Run its maintained distribution builder:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/starforge-checkout \
  --ref ORIGINAL_COMMIT_SHA \
  --selection pmtiles-operations \
  --out /absolute/pmtiles-source-release
~~~

Retain the returned archive and exact SHA-256. The manifest binds the recipe's
path, Git blob, SHA-256 and byte count along with every selected source file.
The source manifest records the package name, maintainer metadata and exact
selected version emitted by this checkout. Its version includes
`.selection.pmtiles-operations`.

Reopen an interrupted build with the same output directory:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/starforge-checkout \
  --out /absolute/pmtiles-source-release --resume

node stellar/scf-starforge-20261009/distribution/build.mjs \
  --out /absolute/pmtiles-source-release --status
~~~

An omitted selection on resume retains the original recipe. A completed
matching build returns its retained archive. Use the builder's `--offline`
option when the required original Git objects are already in the checkout.

The source-owned `pmtiles` contribution adds the original `pmtiles` CLI,
`pmtiles-workspace` managed command and Applications provider. The separate
`pmtiles-merchant-mcp` contribution adds the original MCP provider and
`pmtiles-mcp` CLI. The additive `pmtiles-commerce` contribution supplies
`pmtiles-output`, five named output exports and the paid customer source. The common Applications catalog, source selector and
installation engine remain the maintained implementations.

## 2. Receive the merchant installation

The maintained installation requires Linux, Node 22.16 or newer, Python 3.11
or newer, npm and `flock`. Select the native and operator capabilities with the
three original shared feature manifests:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /private/pmtiles-merchant-runtime \
  --archive /absolute/pmtiles-source-release/ORIGINAL_ARCHIVE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /private/pmtiles-merchant-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /private/pmtiles-merchant-runtime --load --source
~~~

The native selection supplies the original Stellar/x402 dependency graph.
Schema and OpenAPI supply the shared merchant source dependencies. MCP selects
SDK 1.32.1 and the dependencies declared by its original package manifests.
Retain the generated dependency profile, complete lock, source and installed
tree together.

For an existing complete package cache, use the same installation with
`--offline --cache /absolute/original-npm-cache`. When the exact compatible
dependency tree and lock have already been received into this installation,
use `install --adopt-existing`. The existing installer checks the selected
profile and imports before adopting those files. Its normal `install` command
also reopens an interrupted installation and reconciles an already complete
dependency graph.

The examples below use the installed command forwarder:

~~~sh
PMTILES_TOOLS=/absolute/starforge-checkout/stellar/scf-starforge-20261009/distribution
PMTILES_MERCHANT_RUNTIME=/private/pmtiles-merchant-runtime
pmtiles_starforge() {
  node "$PMTILES_TOOLS/runtime-install-cli.mjs" run \
    --dir "$PMTILES_MERCHANT_RUNTIME" -- "$@"
}

pmtiles_starforge source
pmtiles_starforge registrations
pmtiles_starforge pmtiles help
~~~

The same commands are available through `starforge` when the selected package's
existing bin is on PATH. Use the source and registration responses to select
this installation's actual file locations.

## 3. Select the original map runtime

### Receive a completed map package

When receiving an existing operations ZIP, retain its complete archive SHA-256
and original workspace ID. Save a private `receive-map.json`:

~~~json
{
  "requestId": "receive-regional-map-v1",
  "archive": "/private/incoming/regional-map-release.zip",
  "directory": "/private/received-map-product",
  "workspaceDirectory": "/private/received-map-workspace",
  "pythonExecutable": "/usr/bin/python3",
  "expectedArchiveSha256": "ACTUAL_COMPLETE_ARCHIVE_SHA256",
  "expectedWorkspaceId": "ACTUAL_ORIGINAL_WORKSPACE_ID"
}
~~~

Use the actual canonical Python executable on this host and separate private
receiving paths. Run:

~~~sh
pmtiles_starforge pmtiles receive-package --input /private/receive-map.json
~~~

The original receiver verifies the archive, every declared source/runtime
member and the frozen workspace. It rebases the original runtime paths and
returns `runtimeProfile`, `workspaceDirectory`, `workspaceId` and the current
release. Repeating the same complete request resumes its original receive and
preserves the workspace's subsequent saved work.

Select that returned runtime profile and workspace in Applications. The
receiver preserves the exact content-producing executables and browser assets.
The Linux Python host contract uses Python 3.11 or newer with its actual
standard library; the receiving receipt records the selected interpreter's
version and complete byte identity.

The [portable handover guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/pmtiles/PORTABLE_HANDOVER.md)
describes the complete package format, manifest, source/native/runtime bindings
and cold receiving commands.

### Build a new native map runtime

For first authoring, use the original runtime builder with already selected
native executables and complete installed package sources. The original package
selection is:

| Original package | Version |
| --- | --- |
| `pmtiles` | 4.5.0 |
| `@maplibre/maplibre-gl-style-spec` | 26.4.4 |
| `ol` | 10.11.0 |
| `maplibre-gl` | 6.14.0 |
| `@geoblocks/ol-maplibre-layer` | 2.0.0 |

The native executable selection is go-pmtiles 1.31.2 and Martin 1.16.1. The
[upstream source bundle](../../stellar/scf-starforge-20261009/sf30-seller-sdk/pmtiles/sources/README.md)
retains their exact download records, archive hashes, licenses, original
command contracts and browser package API references. The builder also
retains the actual selected esbuild version and source inputs.

Save a private `map-runtime-build.json`:

~~~json
{
  "schema": "starforge.pmtiles-runtime-build.v1",
  "requestId": "regional-map-runtime-v1",
  "destination": "/private/pmtiles-native",
  "modulesDirectory": "/private/original-map-packages/node_modules",
  "pmtilesExecutable": "/private/original-tools/pmtiles",
  "martinExecutable": "/private/original-tools/martin",
  "pythonExecutable": "/usr/bin/python3"
}
~~~

Run the maintained builder:

~~~sh
pmtiles_starforge pmtiles runtime-build --input /private/map-runtime-build.json
~~~

Retain its returned `profilePath` and runtime identity. The builder retains the
original executable bytes, validator, full OpenLayers/MapLibre preview bundle,
same-origin worker, source input inventory and parent-death process launcher.
A matching repeated request reopens the completed profile.

The runtime profile records real paths on the current host. To move the
runtime to another host, receive the complete operations package so that the
original receiver rebinds those paths and verifies all selected bytes.

## 4. Create or reopen the saved map workspace

For a new workspace:

~~~sh
pmtiles_starforge pmtiles init \
  --workspace /private/regional-maps \
  --title "Regional map releases"
~~~

Retain its returned `id`. All later native requests use that exact
`expectedWorkspaceId`. A received workspace already supplies its original ID.

Read it through the existing CLI:

~~~sh
pmtiles_starforge pmtiles state \
  --workspace /private/regional-maps \
  --workspace-id ACTUAL_WORKSPACE_ID
~~~

Workspace and receiving directories are private canonical directories.
Configuration and request JSON files are private UTF-8 files. Keep the saved
database, content-addressed source objects, native capture records, immutable
editions, reviews and release files together.

## 5. Open it through managed Applications

Create the operator workspace, attach the READY merchant installation and
open the original Applications browser:

~~~sh
pmtiles_starforge runtime-workspace init --workspace /private/map-operator

pmtiles_starforge runtime-workspace attach \
  --workspace /private/map-operator \
  --runtime /private/pmtiles-merchant-runtime \
  --label "Map release runtime"

pmtiles_starforge runtime-workspace serve \
  --workspace /private/map-operator --port 8472
~~~

Open the exact private URL printed by that command. Choose **Applications**,
then **PMTiles map releases**, select the attached runtime and fill in:

| Setting | Selection |
| --- | --- |
| Private PMTiles workspace | Original initialized or completely received workspace directory |
| Original PMTiles runtime JSON | Exact profile returned by the original runtime builder or package receiver |
| Local port | `0` to retain the saved authoring port; an explicit port selects a new browser origin |
| Private environment JSON | Optional original host environment selection |

Choose **Review application**, then **Save application**. The existing
Applications lifecycle connects the selected READY runtime to its managed home.
Choose **Review start**, then **Start reviewed application** and **Open
application**.

Review captures the original workspace ID, native runtime identity, runtime
profile SHA-256, selected source module and saved authoring port. Start checks
those inputs again. The original server compares the expected port while it
owns the authoring lease and retains the actual port with its existing
database transaction. The startup observer accepts only the original command's
matching private localhost announcement.

Use **Stop application** to stop this authoring server and drain the Martin
processes that its original controller owns. A subsequent reviewed Start
opens the same workspace and saved browser port. Its new link supplies the new
`#token=…` fragment; reopening that link in the original tab preserves the
draft at the same browser origin.

Select a different explicit port when you intend to change that origin.
Another writer changing the saved port after review produces
`PMTILES_AUTHORING_PORT_CHANGED`. Reopen and review the current selection,
then use its returned Start action.

The direct equivalent stays in the foreground:

~~~sh
pmtiles_starforge pmtiles-workspace \
  --workspace /private/regional-maps \
  --workspace-id ACTUAL_WORKSPACE_ID \
  --runtime /private/pmtiles-native/runtime.json \
  --port 0
~~~

Managed Applications adds its reviewed profile/runtime hashes and previous
authoring-port flag to that same original command. SIGINT or SIGTERM closes
the original server and its owned native processes.

## 6. Capture complete source and save an edition

The authoring browser imports original local archives and styles, captures
original public HTTPS sources, and reopens saved resources. Retain the original
license, source URL and required attribution with each source.

The included `sources/stamen-toner-z0-z3.pmtiles` is the complete upstream
Stamen raster sample: 716,052 bytes, SHA-256
`b96efe3ea10b98632c0c0dc229d000b604ebdad6b2f1321ea11d9de931df1ce5`.
Its matching `sources/sample-raster-style.json` uses the source key `toner`.
The [original sample descriptor](../../stellar/scf-starforge-20261009/sf30-seller-sdk/pmtiles/sources/sample.json)
and [attribution](../../stellar/scf-starforge-20261009/sf30-seller-sdk/pmtiles/sources/ATTRIBUTION.md)
retain the CC BY 4.0 tile and ODbL data attribution.

A native archive import request is:

~~~json
{
  "requestId": "regional-original-archive-v1",
  "expectedWorkspaceId": "ACTUAL_WORKSPACE_ID",
  "path": "/private/original-source/region.pmtiles",
  "name": "region.pmtiles",
  "kind": "pmtiles",
  "rights": {
    "license": "ORIGINAL_SOURCE_LICENSE",
    "attribution": "ORIGINAL_REQUIRED_ATTRIBUTION",
    "sourceUrl": "https://original.example/region"
  },
  "expected": {
    "bytes": 716052,
    "sha256": "ACTUAL_COMPLETE_ARCHIVE_SHA256"
  }
}
~~~

Use the actual source's byte count and digest. Save the request as
`/private/import-region.json` and run:

~~~sh
pmtiles_starforge pmtiles import-local \
  --workspace /private/regional-maps --workspace-id ACTUAL_WORKSPACE_ID \
  --input /private/import-region.json
~~~

Import the matching style with its own stable request ID and `kind: "style"`.
The returned resource IDs identify retained complete bytes.

Save an edition using those actual IDs and the source key in that style:

~~~json
{
  "requestId": "regional-map-edition-v1",
  "expectedWorkspaceId": "ACTUAL_WORKSPACE_ID",
  "editionId": "regional-map",
  "expectedVersion": 0,
  "edition": {
    "name": "Regional map",
    "notes": "Original regional source and publication scope",
    "style": "ACTUAL_STYLE_RESOURCE_ID",
    "archives": [
      {
        "sourceId": "ORIGINAL_STYLE_SOURCE_KEY",
        "resourceId": "ACTUAL_ARCHIVE_RESOURCE_ID",
        "type": "raster"
      }
    ],
    "sprite": null,
    "glyphs": [],
    "layerDecisions": []
  }
}
~~~

Run `pmtiles save-edition` with the same workspace, workspace ID and saved
input-file flags. Later versions use the current version number as
`expectedVersion`. The original model keeps every prior version. Use the actual
`vector`, `raster` or `raster-dem` type; source/style/archive compatibility is
checked during native inspection.

For private or paid object acquisition, the included Object Buyer receives and
assembles the original object first. The PMTiles `adopt-object` command or MCP
`adopt_object` action then consumes its original recorded ObjectDelivery.
That retains the complete buyer/session/snapshot and received-byte relationship.

## 7. Inspect, review, publish and restore

All native commands below use `--workspace`, `--workspace-id` and
`--input PRIVATE_JSON`. `inspect` also takes the exact `--runtime` profile.
Every mutation retains a stable `requestId` and the original
`expectedWorkspaceId`.

| Command | Additional original request fields |
| --- | --- |
| `inspect` | `editionId` and `version` |
| `review` | `editionId`, `version`, completed `inspectionRequestId`, `expectedCurrentRelease`, `reviewer` and optional `note` |
| `prepare-release` | Returned `reviewId` and exact `reviewSha256` |
| `publish` | Returned `releaseId` and `manifestSha256`, plus its reviewed `expectedCurrentRelease` |
| `restore` | Current `fromReleaseId` and exact `manifestSha256` |
| `read-request` | `--id ORIGINAL_REQUEST_ID`, with the same workspace flags |

Use JSON `null` for `expectedCurrentRelease` when no release is published.
A prepared release binds its original previous release. Restore follows that
retained predecessor after verifying its complete files.

The browser's native map uses the selected original PMTiles and Martin
runtime. It exposes the original source/layer relationships and retained
attribution. Martin readiness checks its actual health, catalog, TileJSON and
a known-present tile. Release changes drain and reopen the selected original
Martin process so each map corresponds to its saved release.

The native inspection retains the full PMTiles verifier output and checks the
archive's real header/section ranges. The original upstream verifier can report
an Invalid diagnostic while returning a zero process exit, so the product also
checks those retained diagnostics. The [upstream contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/pmtiles/sources/README.md)
records that behavior and the original v3 limits.

For an interrupted or lost response, read the original request ID, reopen its
exact saved input and continue that operation. A changed input requires a new
request; a changed edition/current release requires a fresh review.

## 8. Merchant MCP and scripted receiving

The same saved workspace is available through the source-owned
`pmtiles-workspaces` provider. Its existing connection names the host-selected
workspace, original runtime profile, permitted import aliases and receiving
directories. Configure and initialize it using the
[complete PMTiles MCP guide](../../stellar-forge/mcp-merchant-operator/PMTILES_WORKSPACE.md).

Typical command entrypoints are:

~~~sh
pmtiles_starforge merchant-mcp providers inspect pmtiles-workspaces

pmtiles_starforge merchant-mcp init-provider pmtiles-workspaces \
  --options /private/pmtiles-setup.json

pmtiles_starforge merchant-mcp serve \
  --config /private/pmtiles-mcp/merchant-mcp.json \
  --port 3211 --token-env MCP_ACCESS_TOKEN

pmtiles_starforge pmtiles-mcp call status \
  --url http://127.0.0.1:3211 --request /private/pmtiles-status.json
~~~

The original MCP provider exposes capture, saved editions, inspection,
review, publication, restoration, complete package preparation and receiving.
It returns the same original console URL and uses the original controller.
Applications and MCP must reopen the original workspace's existing server
ownership; finish the active author's Stop or Close before selecting the
other owner.

Its retained file downloader binds the complete original package identity,
manifest, open read and byte offset. The guide includes interrupted download
recovery, whole-archive verification and complete cold receiving commands.

## 9. Deliver the complete operating workspace

Prepare a complete package from the original workspace, using a private staging
directory and separate destination:

~~~json
{
  "requestId": "regional-customer-package-v1",
  "expectedWorkspaceId": "ACTUAL_WORKSPACE_ID",
  "stagingDirectory": "/private/regional-map-package",
  "destination": "/private/delivery/regional-map-release.zip"
}
~~~

Run:

~~~sh
pmtiles_starforge pmtiles package \
  --workspace /private/regional-maps --workspace-id ACTUAL_WORKSPACE_ID \
  --runtime /private/pmtiles-native/runtime.json \
  --input /private/package-map.json
~~~

The package contains its complete declared source closure, exact native
content-producing runtime, frozen database, retained source objects, immutable
editions/reviews/releases and original attribution. It deduplicates identical
file bodies by content while preserving the manifest's logical paths. Keep the
archive's returned SHA-256 and workspace ID with the recipient's original
receiving request from section 3.

The customer uses the returned `runtimeProfile` and `workspaceDirectory` to
open the complete received workspace. Reopening it preserves the original
workspace identity and release chain. The original restore operation can move
back through the retained releases using their exact manifest identities.

For an Object Buyer handover, move its complete original customer workspace
with the reviewed `backup-review`, `backup --quiesced`, `backup-verify` and
`backup-restore` workflow in
[OBJECTS.md](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/OBJECTS.md). Its state JSON export
describes the object state; the complete backup also carries the retained
response and assembled-file material needed by the customer.

## 10. Resume normal operations

| Retained state | Original continuation |
| --- | --- |
| Source build interrupted | Same builder output with `--resume` |
| Merchant dependencies interrupted | Same runtime installation through `install` |
| Matching received dependency tree | Original `install --adopt-existing` |
| Source or native runtime identity changed | Select the intended complete runtime and review the application again |
| Applications operation still active | Reopen its saved operation and URL; Stop drains the selected original owner |
| Saved authoring port changed after review | Reopen the same workspace, review the current port and Start |
| PMTiles request response was lost | Read its original request ID and reopen the same input |
| Partial operations package or receiving | Reopen the same complete original package/receiving request |
| Customer requests an earlier map | Restore through the saved current release's retained predecessor |

The original whole receiving driver can append the managed Applications phase
after its producer/browser/MCP work. That phase selects a real READY merchant
installation, reopens the original producer, retains a dirty draft through
managed Stop and Start, verifies the native map again, and closes its owned
application. Keep its installation input, original operation and returned
receiving report with the source and customer package.


### Original receiving hook input

The complete selected source exports
`./pmtiles/application-receiving`. The original native driver calls
`exercisePMTilesApplications` after its producer and customer browser
contexts and MCP owner have closed. Freeze this installation selection in that
same original input:

~~~json
{
  "merchantInstallation": {
    "directory": "/private/starforge-pmtiles",
    "expectedSourceCommit": "FULL_SELECTED_SOURCE_COMMIT",
    "expectedSourceManifestSha256": "FULL_SELECTED_SOURCE_MANIFEST_SHA256"
  }
}
~~~

The original driver passes `merchantInstallation` unchanged as the hook’s
`installation` argument. The caller also supplies the complete repository
`sourceRoot`, original producer
`directory`, original PMTiles `runtimeProfile`, `expectedWorkspaceId`,
same native `operationId`, a private receiving `root`, and the original
persistent `browserDirectory`. Its `openBrowser({url,directory})` callback
uses the previously selected Playwright/Chromium runtime and returns
`{context,page}`; only one browser context is active. The hook retains
that same page through the managed Stop and Start, including its unsaved
edition text, and records actual map tiles from the reopened original release.

The hook saves each original managed review, request and completed browser
phase before advancing. After an interrupted carrier, it reads those exact
records, reconciles the original operation and completes its original Stop.
A saved preview receipt is never substituted for a running native preview in
a new server lifetime. A completed second Stop reuses the retained native map
and screenshot, verifies their identities, and finishes the same report.


## 11. Sell immutable map outputs and complete customer packages

The same installed selection can price a resource in the published map release
or its complete original operations ZIP, then deliver it through the native
SF30 seller and SF88 object buyer. The original SF82 store controls publication
and seller lifetime. A complete customer can receive the paid operations ZIP
and reopen its source, native runtime, editable workspace and release history.

Use `pmtiles_starforge pmtiles-output` through the installed forwarder from
section 2. The existing merchant MCP provider exposes the same saved operation
through its seventeen paid-output tools; the complete host configuration and
tool inputs are in [PMTILES_COMMERCE.md](../../stellar-forge/mcp-merchant-operator/PMTILES_COMMERCE.md).

### What the merchant retains

Preparation captures the original workspace ID, published release ID and
manifest, immutable edition version, native runtime identity, resource rights,
complete file byte count and SHA-256. A package sale also captures the original
portable request, package manifest, frozen workspace handover and archive hash.

The complete private output directory contains:

| File | Purpose |
| --- | --- |
| `request.json` | The exact selected release, original resources/package, prices and native payment terms |
| `selection.json` | Original release and file references captured before copying |
| `objects/SHA256` | The complete retained selected bytes |
| `source.json` | Exact source and bounded fixed-chunk hashes |
| `seller-service.json` | The original SF30 routes and native payment offers |
| `offers.json` | Those selected offers |
| `objects.json` | The original generic object descriptor consumed by SF88 |
| `catalog.json` | Public offer, complete-download price, rights and original product identity |
| `package.json` | Final complete-file manifest, published after the package is retained |

Share the exact `catalog.json` and its returned SHA-256 with the customer.
Each route includes its immutable snapshot:
`/maps/OFFER_ID/OBJECT_ID/SNAPSHOT_SHA256`. Preparing replacement bytes gives
them a different route. Reusing a request ID reopens the original selection.

Objects up to the selected chunk size are whole-object requests. Larger
objects use fixed byte chunks through `offset` and `length`; the last chunk
contains the remaining bytes. The default is 921,600 bytes, with a maximum of
1,048,576 bytes per request. Range headers, arbitrary query fields and
unaligned requests are rejected before paid handling.

A price is in atomic units **per whole object or per chunk**, according to
the catalog's `pricing.unit`. The catalog retains the exact request count
and `completeDownloadAtomic`. A customer must explicitly provide a total
budget covering that complete download. Preparation supports up to 64 selected
outputs, 32 GiB aggregate bytes and 131,072 total indexed chunks. It rejects a
smaller chunk size that exceeds this bound before copying or indexing.

### Native merchant command

All paths below are absolute. Private request/configuration JSON files are
owned `0600` files. Workspace, output and release-store directories are
separate private directories. Create a private connection:

~~~json
{
  "schema": "starforge.pmtiles-output-cli.v1",
  "workspaceDirectory": "/private/regional-maps",
  "expectedWorkspaceId": "ACTUAL_WORKSPACE_ID",
  "outputDirectory": "/private/regional-output",
  "releaseStore": "/private/regional-seller-releases",
  "runtimes": {
    "native": {
      "port": 4310,
      "facilitator": "https://ACTUAL_FACILITATOR_ORIGIN"
    }
  }
}
~~~

Use the actual existing facilitator. A local facilitator is selected through
the original SF82 `allowLocalFacilitator` option. The public HTTPS seller
origin must route to this selected seller listener, and the buyer's existing
transport/policy must allow that same origin.

Create the original preparation request:

~~~json
{
  "requestId": "regional-output-20261012",
  "expectedWorkspaceId": "ACTUAL_WORKSPACE_ID",
  "releaseId": "ACTUAL_PUBLISHED_MAP_RELEASE",
  "releaseManifestSha256": "ACTUAL_MAP_RELEASE_MANIFEST_SHA256",
  "offerId": "regional-map",
  "title": "Regional map operations",
  "origin": "https://ACTUAL_SELLER_ORIGIN",
  "payment": {
    "network": "stellar:testnet",
    "asset": "ACTUAL_SELECTED_ASSET",
    "payTo": "ACTUAL_SELECTED_RECIPIENT"
  },
  "chunkBytes": 921600,
  "objects": [
    {
      "id": "map",
      "resourceId": "ACTUAL_ARCHIVE_RESOURCE_ID",
      "amount": "50000",
      "filename": "region.pmtiles"
    },
    {
      "id": "operations",
      "package": {
        "requestId": "ACTUAL_COMPLETED_PACKAGE_REQUEST",
        "stagingDirectory": "/private/original-package-staging",
        "archiveSha256": "ACTUAL_ORIGINAL_ARCHIVE_SHA256"
      },
      "amount": "50000",
      "filename": "region-operations.zip"
    }
  ]
}
~~~

Replace the example prices with the reviewed atomic amount for each request.
For a production sale select its actual network, asset and recipient. The
native receiving example uses the original isolated testnet profile.

~~~sh
pmtiles_starforge pmtiles-output prepare \
  --connection /private/output-connection.json \
  --request /private/prepare-output.json
~~~

Retain the returned `requestId`, `manifestSha256`, `catalogSha256` and
complete public object/pricing descriptors. Read `package` or `catalog`
using `{"outputRequestId":"regional-output-20261012","manifestSha256":"ACTUAL_SHA256"}`.

Stage the exact package:

~~~json
{
  "requestId": "regional-output-stage-20261012",
  "outputRequestId": "regional-output-20261012",
  "manifestSha256": "ACTUAL_OUTPUT_PACKAGE_MANIFEST_SHA256",
  "releaseId": "regional-paid-20261012",
  "label": "Regional paid map release",
  "runtime": "native"
}
~~~

~~~sh
pmtiles_starforge pmtiles-output stage \
  --connection /private/output-connection.json \
  --request /private/stage-output.json
~~~

The result contains the original SF82 release and digest. `compare` takes
`beforeReleaseId` (null for the first release), `releaseId` and
`releaseDigest`. It compares the original routes, prices, runtime and
retained PMTiles source before activation.

Read `status` for the current original SF82 generation. Activate with a new
stable request:

~~~json
{
  "requestId": "regional-output-activate-20261012",
  "releaseId": "regional-paid-20261012",
  "releaseDigest": "ACTUAL_SF82_RELEASE_DIGEST",
  "expectedGeneration": 0,
  "reason": "Publish the selected complete map operations"
}
~~~

Run `activate` with that private request. A later activation uses the actual
current generation. The saved operation binds its original selection-history
event, allowing an interrupted response to reopen without applying the
selection again.

Start the native seller in the foreground:

~~~json
{
  "requestId": "regional-output-start-20261012",
  "releaseId": "regional-paid-20261012",
  "releaseDigest": "ACTUAL_SF82_RELEASE_DIGEST",
  "expectedGeneration": 1
}
~~~

~~~sh
pmtiles_starforge pmtiles-output serve \
  --connection /private/output-connection.json \
  --request /private/start-output.json
~~~

The original SF82 manager owns its child process and listener. Ctrl-C stops
admission and drains that owned seller. Release selection and customer
receipts remain saved. A browser/MCP session can use `output_start` and
`output_stop` instead, retaining the exact native instance ID.

`request` reads a lifecycle request's retained original result. A completed
start receipt describes the instance that originally started; use fresh
`status` to decide whether a seller is running and owned now. Replaying an
old completed start never starts a replacement process. After a deliberate
stop, use a new start request with the actual selected generation.

### Customer acquisition and complete receiving

Create a private customer connection:

~~~json
{
  "schema": "starforge.pmtiles-output-cli.v1",
  "buyer": {
    "runtimeDirectory": "/private/existing-sf88-runtime",
    "stateDirectory": "/private/existing-buyer-state",
    "operatorProfile": "/private/existing-operator-profile.json"
  },
  "purchasesDirectory": "/private/purchased-map-outputs"
}
~~~

Use the buyer's original configuration, including its signer/policy and
transport selections. For this purchase, its original `operation` must use
the catalog's exact HTTPS URL and native payment terms, GET, the request ID as
`intentId`, and `expect.maxAtomic` equal to the selected per-request amount.
The merchant MCP host alias derives these fields while preserving the
selected buyer's origin, recipient, asset, timeout and price ceiling.

~~~json
{
  "requestId": "customer-regional-operations-20261012",
  "catalog": "/private/received-catalog.json",
  "catalogSha256": "ACTUAL_CATALOG_FILE_SHA256",
  "objectId": "operations",
  "configuration": "/private/original-selected-purchase-config.json",
  "maxTotalAtomic": "ACTUAL_REVIEWED_COMPLETE_DOWNLOAD_BUDGET"
}
~~~

~~~sh
pmtiles_starforge pmtiles-output purchase-prepare \
  --connection /private/customer-connection.json \
  --request /private/purchase.json
~~~

Preparation retains the exact catalog, profiled configuration, generic object
descriptor, total budget and original SF88 object ID. Continue with
`purchase-run` and a private request containing
`{"purchaseRequestId":"customer-regional-operations-20261012"}`.
After an interrupted payment/receipt operation, use `purchase-recover` on
the same original request before continuing. `purchase-status` reads the
original native progress.

The original object engine retains every request and payment receipt, verifies
each selected chunk and assembles the complete expected SHA-256. Completed
replay reuses those original files and receipts. Receiving binds the stable
assembly identity; a later receipt-status reconciliation can update the
original report without changing the selected archive or creating another
customer receiving request.

For a complete operations ZIP, prepare:

~~~json
{
  "requestId": "receive-regional-operations-20261012",
  "purchaseRequestId": "customer-regional-operations-20261012",
  "directory": "/private/received-regional-product",
  "workspaceDirectory": "/private/received-regional-workspace",
  "pythonExecutable": "/usr/bin/python3"
}
~~~

Run `purchase-receive` using the customer connection. The original PMTiles
receiver verifies the complete source/runtime/workspace manifest and returns
the original serve command. It preserves current work in an already received
workspace when that same request is reopened. Keep the purchased archive,
original SF88 state and complete receiving directory together in the customer
handover.

For a purchased map/style/resource, add the target
`workspaceDirectory` and `expectedWorkspaceId` to the customer connection.
Call `purchase-adopt` with a new `requestId` and the original
`purchaseRequestId`. The existing PMTiles ObjectDelivery path retains its
original source rights, payment/assembly identity and complete file digest.
Use the ordinary map edition/review/publication workflow to select that
resource for a later release.

### Native receiving and source ownership

`exercisePMTilesOutputCommerce` in the repository-root merchant
`pmtiles-commerce-native-receiving.mjs` is a callable phase of the existing
complete PMTiles native operation. It consumes that operation's actual saved
producer, published release and native profile. The selected private commerce
input supplies the existing facilitator, original SF88 runtime/operator,
testnet payment terms and explicit total budgets.


Add this selected object as `outputCommerce` in the original
`starforge.pmtiles-native-receiving.v1` input before that operation retains
`original-input.json`:

~~~json
{
  "schema": "starforge.pmtiles-output-native-selection.v1",
  "origin": "https://ACTUAL_SELLER_ORIGIN",
  "payment": {
    "network": "stellar:testnet",
    "asset": "ACTUAL_SELECTED_ASSET",
    "payTo": "ACTUAL_SELECTED_RECIPIENT"
  },
  "runtime": {
    "port": 4310,
    "facilitator": "https://ACTUAL_EXISTING_FACILITATOR"
  },
  "buyer": {
    "runtimeDirectory": "/private/original-sf88-runtime",
    "stateDirectory": "/private/selected-pmtiles-buyer-state",
    "configuration": "/private/original-buyer-configuration.json",
    "configurationSha256": "ACTUAL_PRIVATE_CONFIGURATION_SHA256",
    "operatorProfile": "/private/original-operator-profile.json",
    "operatorProfileSha256": "ACTUAL_PRIVATE_OPERATOR_PROFILE_SHA256"
  },
  "mapAtomic": "ACTUAL_POSITIVE_ATOMIC_PRICE",
  "operationsAtomic": "ACTUAL_POSITIVE_ATOMIC_PRICE",
  "mapBudgetAtomic": "ACTUAL_REVIEWED_MAP_DOWNLOAD_BUDGET",
  "operationsBudgetAtomic": "ACTUAL_REVIEWED_PACKAGE_DOWNLOAD_BUDGET"
}
~~~

The operator profile and its hash are optional together when the original
buyer configuration already supplies the complete profile. Preserve the
selected existing signer environment and ownership directory. The phase
validates this selection before the whole input is frozen, retains private
configuration/profile copies, and verifies their original byte hashes. Its
catalog determines the actual request counts; both explicit budgets must
cover the complete selected downloads. The same operation records the native
payment and customer receiving results.

The phase creates the complete original operations package, publishes the
selected immutable output through SF82, purchases both the original map and
operations ZIP, receives the full customer product, and reopens the original
requests. It checks a cold merchant reopen against current runtime status and
the historical start receipt. The result retains the actual original object,
assembly, release and received-package identities.

The map operations ZIP continues to declare its original SCF map runtime and
workspace closure. The complete installed merchant carries the paid-output
and MCP/SF88 source and dependencies. The generic object descriptor change
preserves the existing S3 descriptor contract and uses the same original
native object engine.
