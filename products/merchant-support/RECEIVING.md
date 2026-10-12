# Install and receive Merchant Support

A complete handover carries the selected application source, its original runtime installation inputs, and the complete customer case package. Each has an existing native manifest and continuation workflow.

## Build the selected original source

Use Linux, Node 22.16 or later, Python 3.11 or later, npm and the original runtime installer. The source builder packages one exact Git commit and the committed `merchant-support` recipe.

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --ref ORIGINAL_COMMIT \
  --selection merchant-support --out /absolute/merchant-support-release
```

Use the actual full commit SHA. Retain the complete returned receipt: archive path, archive SHA-256, source commit, source selection, source bytes and installed bytes. The source manifest includes each original path and Git/blob/content identity.

If interrupted, continue that same output and selection:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --ref ORIGINAL_COMMIT \
  --selection merchant-support --out /absolute/merchant-support-release --resume
```

The existing **Build a product** browser view performs this same native operation and opens the resulting archive in **Source & profile**. Its [Source Build guide](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/SOURCE_BUILDS.md) covers the original operation IDs, source acquisition and browser recovery.

## Install and reopen the runtime

Prepare the profile from the exact emitted archive:

```sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/private/support-runtime \
  --archive /absolute/merchant-support-release/ACTUAL_ARCHIVE.tgz \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/private/support-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/private/support-runtime --load --source
```

The selected archive supplies the original dependency declarations. The installer retains its actual lock, dependency tree, source and native load observations. Continue an interrupted installation through its existing operation; the source and profile remain the same.

An existing matching dependency tree can be received through the maintained runtime transfer or `--adopt-existing` workflow. Use its actual original lock and source manifest. [Runtime installation](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) and [Runtime transfer](../../stellar/scf-starforge-20261009/distribution/RUNTIME_TRANSFER.md) cover complete offline custody and reopening.

Attach the READY runtime to the existing Runtime workspace:

```sh
starforge runtime-workspace attach \
  --workspace /absolute/private/runtime-workspace \
  --runtime /absolute/private/support-runtime --label "Merchant Support"
```

Then open **Applications → Merchant support**, select the real customer stores, and use the original review/save/start/open controls. [Operating instructions](OPERATING.md) list every product field, including source/package storage and remote Handoffs profiles.

## Export the whole customer case

In the browser, open the original case and use **Complete delivery → Save and export complete case**. Keep its retained operation ID and accountable actor.

The original exporter saves the selected revision and captures the current history at that operation. Its complete package includes the case metadata, workspace and runtime bytes; original Support handoff and flat export; implementation files; all reachable original case versions; and every native source bundle retained across those versions. Superseded and unassigned original source files remain part of their native archives.

The CLI operates on the same saved source:

```sh
starforge merchant-implementation export \
  --cases-dir /absolute/private/merchant-cases \
  --case ACTUAL_CASE_UUID --revision ACTUAL_SAVED_REVISION \
  --source-dir /absolute/private/merchant-cases/source-bundles \
  --out /absolute/private/customer-case-package \
  --export-id ACTUAL_EXPORT_ID
```

Take the completed `case-source-package.json` and every member named by its manifest. The completion manifest identifies its original selected case, captured head, history, source bundles and files. For browser downloads, **Download complete folder** streams the original members into the selected output and writes the completion manifest last.

The [native package guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/CASE_SOURCE_PACKAGE.md) defines the format. The [complete browser and agent guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/CASE_PACKAGE_WORKSPACE.md) covers the retained operations and source-owned byte limits.

## Receive and continue independently

Choose a private receiving case collection and native source directory on the receiving host. The receiver's package storage must remain separate from those stores.

In the browser, select the original complete package folder, preserve its input ID and manifest SHA, and use **Upload and inspect originals**. The native inspector verifies the full package and original source archives. Then choose **Receive into this case desk** and retain that receiving operation ID.

The native CLI supports the same operation:

```sh
starforge merchant-implementation inspect-package \
  --from /absolute/private/customer-case-package \
  --sha256 ACTUAL_PACKAGE_MANIFEST_SHA256

starforge merchant-implementation receive-package \
  --from /absolute/private/customer-case-package \
  --sha256 ACTUAL_PACKAGE_MANIFEST_SHA256 \
  --out /absolute/private/customer-receiving-operation \
  --cases-dir /absolute/private/received-cases \
  --source-dir /absolute/private/received-cases/source-bundles \
  --request-id ACTUAL_RECEIVING_REQUEST_ID --actor "Receiving operator"
```

The original Support receiver creates or reopens its receiving case, and the native source service receives every original source archive. Retain the resulting case UUID, imported revision, current local revision, source directory and operation identity. **Open received case** uses that receiving case; the complete original sender history remains inside the package.

Continue the same request after an interrupted receive. A completed receiving operation reopens the existing case and preserves its later local edits. The native bundle references resolve against the received original source directory.

Open the received implementation, Service and Commercial records. Continue the actual customer work through the normal case writer, then stop and reopen the same installed application with those directories. Download the original source files from the received bundle inventories.

## Receive from an existing remote sender

The sender exposes its original completed package through the installed Support provider. The receiver uses an existing private Handoffs source profile. The browser's **Private handoff source profiles** and the Support connection's `packageSourcesFile` select that same original configuration.

Inspect the actual source alias/export, keep the returned manifest SHA, and start the retained remote receiving operation. The original Support download engine streams immutable members using its native read IDs, file SHA and byte checkpoints. The complete folder and source archives remain available after browser or connection interruption.

The selected profile is bound to the managed application's launch. The first remote operation also retains its original endpoint/export identity. Deliberately changing a host source is a new reviewed selection; continue an existing transfer from its retained original source.

## Include quotation and pricing custody

For a customer quotation based on an existing SF97 pricing workspace, carry the selected original pricing source and complete workspace backup through the [commercial receiving workflow](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/commercial/RECEIVING.md).

That original adapter checks the quote and pricing source, attaches the complete backup through the existing case writer, uses the same whole-case package exporter, and restores the selected pricing plan and original supplier files at the receiver. The native pricing workspace remains independently editable after restoration.


## Receive the Service adjustment and buyer/accountant work

The selected Merchant Support recipe includes the original accounting and buyer providers, their native workspace source, the Service adjustment CLI and the complete native receiving entry. Its saved Applications settings can select the same private accounting and buyer connections used by the Support agent.

A customer handover has three related originals:

| Original | What to retain |
| --- | --- |
| Support case | Complete case package, captured history, Service report, commissioning proposal/intent/outcome materials and referenced source bundles |
| Selected adjustment delivery | Native JSON/CSV/HTML, exact buyer source, report/customer files and the CLI completion manifest for the selected proposal and case revision |
| Buyer and accountant delivery | Complete buyer project, issued period and credit coding, original accountant files, handoff/return identities and the receiving result |

### Capture the exact selected delivery

Use the running original Support listener and the actual saved proposal:

```json
{
  "method": "delivery",
  "args": {
    "id": "ACTUAL_CASE_UUID",
    "proposalId": "ACTUAL_PROPOSAL_UUID"
  }
}
```

```sh
starforge merchant-service-adjustments \
  --url http://127.0.0.1:8784/ \
  --request-file /absolute/private/adjustment-delivery-request.json \
  --out /absolute/private/adjustment-delivery
```

The first operation retains its selected case revision, proposal identity, creation time and complete file plan. The same request and output resume missing files and reproduce the final manifest from those originals, including after a later case edit. Each member is received from the original API with its returned hash; final publication uses the original immutable case-artifact writer.

Export the complete Support case through its existing Complete delivery operation after retaining the final adjustment and buyer materials. The original buyer exporter retains its complete project and every selected native source. Use that original export and trusted receiving operation for the receiver's buyer workspace. Accountant files retain their own selected handoff and revision.

At the recipient, inspect and receive the complete Support package, then open the actual receiving case. Inspect its saved Service report, proposal, native capture, buyer issue/close history and complete file downloads. Configure local accounting/buyer aliases to the independently received original stores. The selected case's historical source identities remain visible while subsequent work uses the recipient's current native workspace revisions.

### Operate the complete original receiving programme

The installed entry `merchant-service-adjustment-receiving` composes the original Service programme and the complete adjustment/buyer/accountant continuation. It uses the same Service case and its retained `operation.json`. If that original Service programme is incomplete, it resumes its native seller, incident, report and case work first.

The receiving selection explicitly uses the retained development operation `SCF-WOO-REFUNDS-NATIVE-20261011-7737`. Its original order, export, proofs, terms and captured RPC transcripts are inputs to this programme. The entry captures their complete unchanged bytes from their original paths into its owned fixture packet, verifies their selected identities, and creates its receiving copy. The original producer workspace remains the source of that copy.

```sh
starforge merchant-service-adjustment-receiving \
  --directory /absolute/private/service-adjustment-receiving \
  --service-directory /absolute/private/original-service-receiving \
  --fixture-packet /absolute/private/service-adjustment-receiving/original-7737-inputs.json \
  --original-directory /absolute/private/original-7737-operation \
  --outbox-directory /absolute/private/original-order-outbox \
  --source-commit ACTUAL_FULL_SELECTED_COMMIT \
  --chromium /absolute/runtime/chromium \
  --playwright-module /absolute/runtime/playwright/index.js
```

Use the actual installed Chromium and Playwright module. The buyer operation uses the selected Python interpreter; `--python /absolute/runtime/python3` can select it. The same flags also apply to the source entry at `stellar/scf-starforge-20261009/sf74-merchant-support-console/service-adjustment-native.mjs`.

If the fixture packet already exists, the entry verifies and reuses it. To capture the original inputs before execution, use its existing `--capture-original-fixture` mode with the same fixture, producer and outbox paths. Keep that complete private packet with the selected original operation.

The full programme prepares a source-bound adjustment from the actual retained Service report; records and verifies it through the original adjustment owner and official decoder; captures native and buyer files; receives purchase and credit coding into the selected buyer workspace; closes its reviewed period; captures and receives the accountant handoff and return; and verifies the complete browser/CLI delivery. Its original request and phase journals retain completed actions and exact pending requests through restart.

The browser exercises the product's existing forms, save/replay controls and original file downloads. The selected development context and actual asset units remain in the native source and buyer period. The programme's returned result reports the observed phase outcomes and full artifact paths.

Repeat the original command with the same receiving directory to continue. Preserve its `operation.json`, fixture packet, original case and native directories, request journals and completed outputs. The original case lease protects that selected state. The final `service-adjustment-native-result.json` identifies the retained result and its complete artifacts.

The [Service adjustment operating guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/SERVICE_ADJUSTMENT_HANDOVER.md) documents the full entry and the underlying case/native contracts. The [buyer receiving guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/SERVICE_BUYER_HANDOVER.md) defines its buyer and accountant selection, exact source files, periods, returned records and receiving behavior.

## Deliver the installation handover

The handover should contain the actual selected source archive and its receipt, the original runtime profile/lock or complete runtime transfer, the whole case package and manifest, the receiving result, and the private host configuration under the customer's existing custody.

Record the installed source commit, recipe, actual runtime location, saved application ID, receiving case UUID, current revision, selected accounting/buyer aliases and the case/source/package/native workspace directories in the customer's operating notes. Keep credential values in the original private environment. These are the inputs needed to reopen the same application and continue its work.
