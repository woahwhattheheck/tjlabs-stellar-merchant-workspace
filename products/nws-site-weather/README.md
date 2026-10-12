# Site weather operations

This product runs named sites, original point mappings, forecasts, observations, alerts and dated weather comparisons in the original merchant workspace. Staff can inspect retained provider responses, keep source-linked reviews, prepare queryable datasets, operate native merchant releases, and receive the customer's ordered purchased pages as five complete files. The browser, merchant tools and installed Applications entry share the same saved workspace.

The selected package is `nws`. Its operating command is `nws-product`; its original Applications entry is **Site weather operations** (`nws-site-weather`). The full source workflow is in the [original operator guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/nws/README.md).

## What is included

| Workspace | Operating result |
| --- | --- |
| Sources and observations | Original provider bytes, query/capture identity, source timestamps and exact retained editions |
| Review and comparison | Source-linked findings and dated comparisons with the original request/revision history |
| Dataset and merchant | Original SF30 dataset queries and SF82 release selection, activation, start, stop and rollback |
| Customer receiving | Original SF88 page order and SF100 `dataset.csv`, `dataset.jsonl`, `review.html`, `delivery.json`, `manifest.json` |
| Installed Applications | Review, save/adopt, start, open, stop, recover and reopen using the original managed runtime |
| Merchant MCP | 30 original product tools, immutable file metadata and resumable retained-file receiving |
| Private handover | Exact installed source/profile, application/run/workspace IDs and received-file manifests |

NWS captures retain the identifying User-Agent, provider response and revalidation metadata, and original source and wire representations. Forecast periods and observed conditions have distinct meanings. Use the original timestamps and source coverage displayed in the workspace.

## Build and select this complete product

Use the maintained distribution builder from the exact selected repository commit. Keep one output directory for that original commit and selection.

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/original-checkout --ref FULL_SELECTED_COMMIT \
  --selection nws --out /absolute/private/nws-release
```

The builder returns the original archive path and SHA-256. Its manifest binds the committed recipe, contributions, original file inventory and source commit. A completed build reopens its verified original archive. Continue an interrupted build using its same output and `--resume`; the original source reader accepts `--offline` when those Git objects are already present. The [maintained selection contract](../../stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md) describes those exact options.

This recipe includes the complete original product, dataset/release/buyer dependencies, original merchant provider registry, original Applications provider, browser assets, operating guides and installed receiving programme. The selected `starforge registrations` output identifies the actual commands and provider source.

## Install the original archive

Linux, Node, Python, npm and flock follow the existing runtime installer's requirements. The complete product uses the original native, schema, OpenAPI, MCP and operator profile. Select exact versions from the archive's retained declarations.

```sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/private/nws-runtime \
  --archive /absolute/private/nws-release/ORIGINAL.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/private/nws-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/private/nws-runtime --load --source
```

When an equipped producer already owns this selected installation, use its actual READY directory and original dependency adoption/transfer rather than creating another installation. The original installer retains the lockfile and can recover the same installation. Its [full install guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) is the authority for cache, offline and existing-dependency adoption.

| Selected runtime path | Meaning |
| --- | --- |
| `RUNTIME/package/source` | Original source, retained at its declared paths |
| `RUNTIME/package/manifest.json` | Archive source selection and exact original file hashes |
| `RUNTIME/node_modules` | Dependencies selected and verified by the original runtime profile |
| Managed Applications home | Original SF46 release source and dependency attachment, created by Applications adoption |
| Private product workspace | Retained observations, reviews, datasets, release state and customer receipts |

Keep the installed source and dependency roots together. Original Applications adoption preserves this relationship when it creates the managed release.

## Review and save the installed application

Create an original Runtime Workspace once, or reuse the existing private manager:

```sh
starforge runtime-workspace init --workspace /absolute/private/runtime-manager
```

Create `/absolute/private/nws-request.json` with the following fields. Replace the example paths and commit; generate a UUID for `operationId` and retain it for this save. For an existing product workspace, include its actual `workspaceId`.

```json
{
  "schema": "stellar-forge.selected-product-request.v1",
  "product": "nws",
  "operationId": "ORIGINAL_SAVE_UUID",
  "managerDirectory": "/absolute/private/runtime-manager",
  "runtimeDirectory": "/absolute/private/nws-runtime",
  "expectedSourceCommit": "FULL_SELECTED_COMMIT",
  "label": "Site weather operations",
  "alias": "weather",
  "workspaceId": "EXISTING_WORKSPACE_UUID",
  "settings": {
    "workspaceDirectory": "/absolute/private/nws-workspace",
    "inboxDirectory": "/absolute/private/original-buyer-inbox",
    "releaseRuntimeFile": "/absolute/private/original-merchant-runtime.json",
    "port": 0,
    "userAgent": "SiteWeatherOperations/1.0 (your operator contact)"
  }
}
```

For a new workspace, omit `workspaceId`; for a source-only operator, omit optional inbox/runtime fields. The original SF82 runtime configuration determines the facilitator and native payment behavior. Existing runtime JSON and pending buyer intents remain part of the original application input review.

```sh
starforge nws-product prepare --operation /absolute/private/nws-operation \
  --request /absolute/private/nws-request.json
starforge nws-product save --operation /absolute/private/nws-operation
starforge nws-product connect --operation /absolute/private/nws-operation
starforge nws-product status --operation /absolute/private/nws-operation
```

Prepare performs the original READY/source inspection and Applications review. Save uses the retained original review and save UUID. It starts the original managed attachment when needed. Connect follows that same attachment; its current original phase remains visible in Status. The application is startable when its original release is connected.

A changed source commit, package selection or dependency binding needs its own reviewed product operation. Editing a private request after saving does not retarget an existing operation.

## Start, open, stop and recover

Generate and retain one `RUN_UUID` for this particular start:

```sh
starforge nws-product start --operation /absolute/private/nws-operation --run-id RUN_UUID
starforge nws-product status --operation /absolute/private/nws-operation --run-id RUN_UUID
starforge nws-product open --operation /absolute/private/nws-operation --run-id RUN_UUID
```

Open reads the actual original Applications startup record, checks its live bearer-authenticated schema, and verifies the original workspace UUID. It prints the private session URL for the operator. Status returns the original run phase and source identity without that session URL.

An interrupted start keeps the same run UUID. Use the original recovery operation:

```sh
starforge nws-product recover --operation /absolute/private/nws-operation --run-id RUN_UUID
```

Stop closes the original application:

```sh
starforge nws-product stop --operation /absolute/private/nws-operation --run-id RUN_UUID
```

Read Status until the original run is closed. A deliberate reopen after Stop gets a new run UUID and retains the same saved application, data directory and workspace UUID. Source reviews and customer receipts remain in that workspace. Applications owns process locks, runtime adoption and cancellation.

The original browser entrypoint also remains available as `starforge nws-workspace`. The selected package's full guide explains direct launch and the underlying provider/source workflow.

## Connect the current application to merchant MCP

After Open succeeds:

```sh
starforge nws-product merchant --operation /absolute/private/nws-operation --run-id RUN_UUID
```

This command retains the exact original startup record in the operation's private `application-url.json`, creates the declared workspace connection and prepares the original merchant configuration. It returns the configuration and original merchant server entrypoint. Use that original server's `--help` or the installed `merchant-mcp` command for its supported transport arguments.

The actual connection names alias `weather` and the verified workspace UUID. The original merchant provider reads that stable private file on each call. After Applications reopens on a new port, run Merchant with the new run UUID to refresh the same file. Existing merchant file checkpoints remain bound to the authenticated workspace and original manifest.

Merchant preparation uses the original initializer in a private staging directory and publishes the complete configuration by rename. An incomplete staged attempt is retained for inspection while a subsequent preparation can finish in a new owned staging directory. The original merchant engine owns its release store, tool dispatch and temporary file reads.

## Inspect, receive and reopen original files

Create a private file-selection JSON using the actual MCP endpoint and original source/export/receipt ID:

```json
{
  "url": "http://127.0.0.1:ACTUAL_PORT/mcp",
  "tokenEnv": "ORIGINAL_MCP_TOKEN_ENV",
  "kind": "receipt",
  "id": "buyer-ACTUAL_RECEIPT_ID",
  "directory": "/absolute/private/customer-files"
}
```

The token is read from the named existing environment variable. Omit `tokenEnv` when the original local transport uses its existing default authentication.

```sh
starforge nws-product files --operation /absolute/private/nws-operation \
  --action inspect --selection /absolute/private/customer-selection.json
```

Retain the returned `manifestSha256` as `expectedManifestSha256` in that same selection, then receive:

```sh
starforge nws-product files --operation /absolute/private/nws-operation \
  --action receive --selection /absolute/private/customer-selection.json
```

Receiving uses the original file client and download lease. Repeat the same selection and output directory after an interruption. Source selections use `kind: "source"` plus the original edition ID and optional page index. Export selections use `kind: "export"` plus the saved export/comparison ID. Add `wire: true` only for an original wire response.

For an offline reopen, the selection JSON contains only `directory` and optional `expectedManifestSha256`:

```sh
starforge nws-product files --operation /absolute/private/nws-operation \
  --action reopen --selection /absolute/private/offline-selection.json
starforge nws-product handover --operation /absolute/private/nws-operation
```

The handover names the actual runtime/source binding, original application and run history, stable workspace identity, saved request and received-file results. The original nws-transfer.json is a transfer index alongside the unchanged five customer payloads.

## Receive the whole installed workflow

The [complete installed receiving programme](../stellar-expert/RECEIVING.md) operates this selected package through original Applications Save/adopt, Start/Open, source and customer MCP access, every desktop/mobile operator section, all original file downloads, Stop, Reopen and offline hash verification. It consumes existing source editions, exports and completed buyer receipts from the selected workspace.

Source code, selected recipes and the operating programme ship together. Current native execution receipts remain attached to the original receiving operation and customer case.
