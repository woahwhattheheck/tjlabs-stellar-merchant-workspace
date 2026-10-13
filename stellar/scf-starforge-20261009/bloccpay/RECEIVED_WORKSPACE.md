# Open a received Bloccpay workspace in Applications

A complete Bloccpay workspace delivery already contains its original source edition, retained Node 24 runtime, evidence, SQLite history and native receiving result. The received-workspace consumer turns that existing installation into the settings accepted by the Bloccpay Applications provider. It preserves the workspace identity assigned by the original receiver and starts no host during inspection or preparation. The received executable edition is preserved in place; the operator may explicitly select a compatible newer source edition for the same received database.

This is an operating handover for an existing delivery. It does not create another receiving, overwrite the received source edition, reset the database, or manufacture provider records. A scoped report delivery has no executable workspace and is not an Applications installation.

## Select the actual received installation

Use the directory returned by the original `receiveBloccpayDelivery` or the original application's Receive action. It must contain the complete native output:

- `receiving.json`: the original immutable native result.
- `original-package/manifest.json` and every complete declared original member.
- `workspace/workspace.sqlite`: the independently received, subsequently usable database.
- `application/source/`: that delivery's complete executable edition.
- `runtime/installed/`: the original retained runtime objects, reconstructed libraries and `bin/node` launcher.

If the archive has not yet been received, finish the existing native archive inspection and receiving operation first using its original request identity. If receiving has already completed, select its directory directly. Do not call receiving again merely to obtain settings.

The consumer reads live SQLite metadata in a read-only transaction. The original delivery is verified against its immutable manifest; the live database is allowed to contain subsequent accepted work. Its workspace ID and `receivedFrom` link must still match the original native result. The receipt's creation revision is a lower bound, not an instruction to roll back a working database.

## Inspect without opening the application

Run the packaged Bloccpay CLI with Node 24, or use the retained executable from the received installation:

```sh
"/absolute/received/runtime/installed/bin/node" \
  "/absolute/product/bloccpay/cli.mjs" received-inspect \
  --received-directory "/absolute/received"
```

The same operation is available directly:

```js
import { inspectReceivedBloccpayWorkspace } from './received-workspace.mjs';

const inspection = await inspectReceivedBloccpayWorkspace({
  receivedDirectory: '/absolute/received',
  expectedManifestSha256: actualDeliveryManifestSha256,
  expectedWorkspaceId: actualReceivedWorkspaceId,
  signal,
});
```

The optional expected identities come from the actual delivery and receiving result. They are guards against selecting another installation. Do not substitute the sender's workspace ID for the received workspace ID.

Inspection verifies the complete original package, every received executable source member, the source manifest, all retained runtime objects, reconstructed bindings, modes and launcher, and the native original-to-received identity. Large files are hashed through the original bounded-buffer file reader. It does not execute the selected runtime, acquire a database writer, open HTTP, or call a provider.

The response includes:

| Field | Meaning |
| --- | --- |
| `selectionSha256` | SHA-256 of canonical sorted-key JSON for the immutable receiving/source/runtime selection, without an added newline. |
| `selection.original` | Sender workspace, original revision/head, export and full delivery-manifest identities. |
| `selection.received` | Receiver-assigned workspace, original receiving request, recorded directory and actual selected directory. |
| `workspace` | Current read-only metadata, including current revision/head and dispatch state. |
| `settings` | The verified workspace, source and runtime settings for Applications, before adding the private configuration path. |
| `relocated` | Whether the complete received installation was moved from the path recorded by native receiving. |
| `managedSource` | Whether the original received edition is compatible with the managed host contract, or needs an explicit source adoption. |

A relocated installation is rebased from its original declared layout. The consumer does not rewrite `receiving.json` or change any original identity. Keep the complete tree together.

## Select a compatible executable edition

Managed opening requires the original server's background-projection selection and retained owner-close contract. Those requirements are checked against the full verified source manifest, using the same `inspectManagedSource` authority as the Applications provider.

The reviewed 61-file edition has source-manifest SHA-256 `071f3aba8eb96517a033c42e3f656dd7157bebdb57b9026794654b4b4442c63b`. The historical 36-file edition, SHA-256 `6cf19f01d4adab4ca00d64e78eda7fdc4f1c9ae95f8bdef79fda3867c313b2d6`, does not support disabling automatic webhook projection and does not provide the required close contract. Inspection can still verify that complete original delivery and database. Managed preparation or host opening with that edition reports `BLOCCPAY_SOURCE_INCOMPATIBLE` before starting the host.

For a compatible received edition, omit the explicit source options. For an older received edition, deliberately select the complete compatible source shipped with this product using both `--source-directory` and `--source-manifest-sha256`. The consumer verifies every selected source file and retains this choice as `sourceAdoption`:

- `mode: ORIGINAL` keeps the compatible original executable edition.
- `mode: EXPLICIT` records the actual operator-selected directory and full manifest hash.
- `original` always identifies the unchanged received application.
- `selected` identifies the effective application chosen for this opening.

The original package, original `application/source/`, runtime, receiving result and database remain unchanged during preparation. The effective source lives in its already-selected complete product directory; it is not copied over the delivery. Runtime and workspace identity continue to come from original receiving.

Both original and selected editions must remain available for full cold-reopen validation. A new source edition needs an explicit reviewed compatibility entry in the product; an unknown hash is not inferred compatible from filenames or a version string.

## Prepare the complete private configuration

Provide the actual operator configuration file for this installation. It must be an absolute, regular UTF-8 JSON file with private permissions: owner access only. Both the full original and serialized effective configuration are bounded at 4 MiB, matching the Applications loader. Preserve its actual provider connection descriptors, scope, evidence settings and original credentials or credential references. This consumer does not invent any missing connection or economic authority.

The full configuration is retained privately, byte for byte. A second effective copy preserves all fields and sets only these background settings:

```json
{
  "collections": { "enabled": false },
  "webhookProjection": { "enabled": false }
}
```

Existing fields inside those two objects are retained. This lets the operator inspect and select the next actual action after opening. It does not change SQLite's current dispatch state, request history, roles, wallets, payroll or provider records. A freshly received database has dispatch disabled by the original receiver; an installation that has since been used keeps its actual state.

Choose a private destination outside `workspace/`, `application/`, `runtime/` and `original-package/`. A separate `managed-opening/` directory next to those native directories is suitable.

```sh
"/absolute/received/runtime/installed/bin/node" \
  "/absolute/product/bloccpay/cli.mjs" received-prepare \
  --received-directory "/absolute/received" \
  --configuration "/absolute/private/bloccpay.json" \
  --destination "/absolute/received/managed-opening" \
  --selection-sha256 "ACTUAL_INSPECTION_SELECTION_SHA256"
```

`--selection-sha256` here binds the inspection selection. For an explicit source adoption, add the paired source options to that same command:

```text
--source-directory /absolute/product/bloccpay/source \
  --source-manifest-sha256 071f3aba8eb96517a033c42e3f656dd7157bebdb57b9026794654b4b4442c63b
```

Use the actual complete selected directory, not a path label. Its full bytes must match that manifest. The API additionally accepts expected delivery-manifest and received-workspace IDs:

```js
import { prepareReceivedBloccpayApplication } from './received-workspace.mjs';

const prepared = await prepareReceivedBloccpayApplication({
  receivedDirectory: '/absolute/received',
  configurationFile: '/absolute/private/bloccpay.json',
  destination: '/absolute/received/managed-opening',
  expectedSelectionSha256: inspection.selectionSha256,
  expectedManifestSha256: inspection.selection.original.manifestSha256,
  expectedWorkspaceId: inspection.workspace.id,
  // Include this pair only for a deliberate compatible source adoption:
  sourceDirectory: '/absolute/product/bloccpay/source',
  sourceManifestSha256: '071f3aba8eb96517a033c42e3f656dd7157bebdb57b9026794654b4b4442c63b',
  signal,
});
// Supply prepared.settings to the existing Bloccpay Applications provider.
```

The preparation writes five immutable private files under one original native lease:

| File | Purpose |
| --- | --- |
| `selection.private.json` | Complete original receiving/source/runtime identities, explicit effective-source selection and original/effective configuration hashes. |
| `configuration.original.private.json` | Exact complete supplied configuration. |
| `configuration.private.json` | Full effective configuration with the two background settings disabled. |
| `application-settings.private.json` | The seven prepared Applications settings. |
| `prepared.private.json` | Completed preparation receipt and all identities needed to reopen. |

Preparation requires byte-exact reentry if any of these files already exist. It does not silently replace an earlier selection. The original configuration is checked again before completion. The containing directories are synchronized before the result is returned; the lease is released after publication.

Keep this directory private. Configuration bodies are never printed by these APIs and do not belong in source control, public source inventories, shared reports or command-line arguments. Applications settings contain paths and identities, not credential bodies.

## Open through the existing Applications provider

Pass `prepared.settings` as the Bloccpay application's settings:

| Setting | Bound value |
| --- | --- |
| `workspaceDirectory` | Actual received `workspace/` directory. |
| `expectedWorkspaceId` | Identity assigned by original native receiving. |
| `configurationFile` | Prepared complete effective private configuration. |
| `runtimeDirectory` | Original received `runtime/installed/`. |
| `runtimeSha256` | Exact original runtime manifest SHA-256. |
| `sourceDirectory` | Verified effective application: compatible original source, or the deliberately selected complete source directory. |
| `sourceManifestSha256` | Exact effective executable-source manifest SHA-256. |

The ordinary Applications port and environment-file settings may also be selected through that provider's existing interface. Use the prepared source/runtime settings unchanged: the receipt preserves both the delivered edition and any explicit effective-source choice. Runtime remains the original received runtime.

The provider revalidates source and runtime and launches its small sibling wrapper with the verified retained Node executable. That wrapper imports the exact selected effective source CLI. It publishes `BLOCCPAY_APPLICATION_READY` only after retaining its private connection descriptor and authenticating the native bootstrap against the expected received workspace.

The connection schema is `stellar-forge.bloccpay-host-connection.v1`. Its source/runtime/workspace identities refer to this same selection. The customer-agent provider borrows that exact HTTP host and private token-file descriptor. It does not open another SQLite writer or start a separate application.

Opening is not a payment, provider mutation, capture, payroll run, or webhook projection. Subsequent operations remain the application's explicit native commands with its existing configuration, economic evidence and durable request history. Select actual records and supported provider connections through the established UI or customer-agent commands.

## Cold reopen and interruption recovery

Once `prepared.private.json` exists, reopening no longer needs the original external configuration file. It verifies the retained original and effective configuration copies, original received package/source/runtime/native identity, and complete effective source adoption:

```sh
"/absolute/received/runtime/installed/bin/node" \
  "/absolute/product/bloccpay/cli.mjs" received-open \
  --destination "/absolute/received/managed-opening" \
  --selection-sha256 "ACTUAL_PREPARED_SELECTION_SHA256"
```

`received-open` binds the preparation's `selectionSha256`, distinct from the inspection hash accepted by `received-prepare`.

```js
import { openPreparedReceivedBloccpayApplication } from './received-workspace.mjs';

const reopened = await openPreparedReceivedBloccpayApplication({
  destination: '/absolute/received/managed-opening',
  expectedSelectionSha256: prepared.selectionSha256,
  signal,
});
```

If preparation was interrupted before the completed receipt, repeat the original prepare call with its same paths, configuration and inspection selection. Already published files must match exactly. Changed input produces a conflict; inspect and deliberately choose a new preparation destination for a new configuration.

If a close fails, the thrown error retains `close()` and `receivedApplicationOwner` for the same read handle or lease. The CLI or embedding owner must drain that retained owner before releasing its own operation. Reopening a different object is not cleanup of the original owner.

A prepared directory is bound to its selected absolute installation and configuration paths. To move the installation after preparing it, retain the old preparation, inspect the complete installation at its new location, and prepare a new destination using the retained original private configuration. The native receiving result and source/runtime manifest remain unchanged.

## Identity and record continuity

The sender workspace ID remains in the original package and the received database's `receivedFrom.workspaceId`. The independently received workspace has its own identity. Applications and the customer agent must use that new identity when opening.

The consumer never replays the sender's browser commands. Original operations and their accepted requests remain in the received database as historical records. If an operation was in flight at export, use the original receiving application's retained recovery state and explicit native reconciliation. A new app window is not evidence that an uncertain financial request did or did not execute.

For an actual Horizon-only installation, this handover opens the real Horizon records that were delivered. It does not claim SDP, Bridge, payroll, or customer commissioning unless those original selections and records are present.

## Source integration

These two additive files belong beside the Bloccpay Applications provider, outside the unchanged `source/` application edition. They import the existing native files, receiving and runtime helpers, the provider's shared full-source compatibility validator, and Node's read-only SQLite interface. Register both files in the product's support inventory. CLI commands delegate to these exported functions; the host and customer-agent opening remain owned by their existing providers.

This document describes product behavior and recovery. Source review and static parsing do not by themselves establish a completed opening or receiving on a particular customer case; retain the actual native result for that installation.
