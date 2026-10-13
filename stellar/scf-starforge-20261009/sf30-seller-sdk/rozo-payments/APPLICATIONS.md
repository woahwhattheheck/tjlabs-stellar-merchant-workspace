# ROZO payments in Applications

The ROZO product owns its command, browser files, workspace model and Applications adapter. The existing runtime manages Review, Save, Start, Open, Stop and recovery. Its original resource lease covers the selected workspace.

## Open an existing workspace

Initialize the original workspace once, using the installed command:

```sh
starforge rozo-payments init --workspace /absolute/rozo-workspace
```

In Applications, choose **ROZO payments** and select:

| Field | Selection |
| --- | --- |
| Initialized ROZO workspace | The directory containing the original workspace.json and SQLite database. |
| Private connection configuration | The original ROZO connection JSON, with API-key and callback-secret environment references. |
| Private environment JSON | The existing host-local environment file for those references, when required. |
| Local port | 0 chooses an available private loopback port. |

Use the normal Review and Save flow, then Start and Open. The selected native command opens the existing workspace; initialization is a separate explicit native operation. Reopening a workspace preserves its original workspaceId, originId, revisions, saved requests and complete provider observations.

The browser opens the native private session from the launch fragment. Its server authenticates the state request with the same session before Applications retains the URL.

## Source and runtime selection

The source-owned registration is `distribution/contributions/rozo-payments.json`. It contributes the original CLI, package export, runtime manifest, browser asset pair and Applications provider to the normal distribution. The provider is `rozo-payments/application-provider.mjs`.

```sh
starforge registrations --source rozo-payments
starforge registrations --command rozo-payments
starforge doctor --feature rozo-payments
```

Build and install the selected immutable commit through the existing [distribution workflow](../../distribution/CONTRIBUTIONS.md). Its collector reads the same `browser-assets.json` used by the ROZO server. All mapped HTML, JavaScript, CSS and their original imports travel with the selected application.

A selected distribution uses its original `package/manifest.json`, every declared ordinary `package/source` member and the original package.json, README.md and LICENSE. The verifier checks full file lengths and SHA-256 values, the original `packagePath` mapping and all three package hashes. It keeps the complete raw distribution manifest; it does not generate a replacement manifest for the installed package.

A retained standalone checkout can instead select the product's `INSTALLED_SOURCE.json`. That declaration records ordinary repository-relative source paths, byte counts and SHA-256 values while excluding itself. The manifest's raw-file hash is a separate input. Explicit `--source-manifest` and `--source-sha256` selections remain authoritative. Both source forms work with Serve, the native journey and complete workspace export/receiving.

## What the managed launch binds

Review records the initialized workspace directory, immutable workspace marker, private connection configuration, installed source manifest and all selected original source members. Start uses those same inputs and passes the original workspace/origin IDs to the native serve command.

The native source verifier checks the complete manifest. On startup, the adapter also checks the executed release's copy of that selection and reads the original authenticated `/api/state`. The returned workspace IDs and source identity must match the reviewed operation. Mutable workspace work—orders, payment observations, reconciliation editions and corrections—remains in the native workspace.

Private environment values stay in the existing host environment handling. The source manifest, catalog and browser registration carry source paths and metadata. Source imports and receiving retain complete provider records through the native product's original export.

## Operate and receive

Use the native workspace to inspect the original connection aliases, recover saved requests, read payment and callback observations, complete reconciliation and export the full editable receiving package. The product's README describes those business operations and the distinct original merchant and Checkout profiles.

Stopping and continuing use the same saved Applications request and original process lifecycle. Continue reuses the retained argv and workspace identity. Use the existing Applications details and original native logs to inspect the running operation.

For the full shared adapter interface and runtime receiving sequence, see [Applications providers](../../distribution/runtime-workspace/APPLICATION_PROVIDERS.md).

## Complete installed receiving programme

After the original ROZO native operation has completed, run its following installed programme described in [Installed Applications receiving](APPLICATIONS_RECEIVING.md). It builds the selected immutable Git commit, installs the original Node 24 feature without external npm dependencies, operates the same received native workspace through Applications, retains a complete working export and transfers the original runtime. A separate process then installs and receives those same source/workspace bytes.

The fixed programme ID is `ROZO-MERCHANT-SETTLEMENT-COMMISSIONING-20261012:installed-applications`. Its progress, request bodies, accepted replies and complete artifacts remain under the original native directory's `installed-applications` child. Reuse that directory after interruption.
