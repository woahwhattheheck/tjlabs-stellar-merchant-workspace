# Hand over complete captured API merchants

Use the captured product's handover commands to give another operator a complete
collection of saved merchants and the captured source histories behind them.
The receiving operator opens the same original package, authored source review,
complete merchant plan and exact atomic prices in their own product.

A handover has two operator decisions. The sender reviews the complete copied
collection before publishing it. The receiver reviews the target package names
and existing source matches before applying that collection. Both steps retain
their original input identity, so an interrupted command can continue the same
operation.

The implementation composes the maintained [HAR source store](../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/har/README.md),
[capture refresh](../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/har/REFRESH.md)
and [complete merchant package transfer](../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/PACKAGE_TRANSFER.md).
The existing console owns source adoption, package publication, compiler,
runtime and release operations.

## 1. Open the sending product and select actual members

Install the complete product and open its existing private directory, as described
in [OPERATING.md](OPERATING.md). Its original browser must be running while new
source copies and package exports are prepared. A product attached to an
Applications-managed SF61 browser uses that same private connection.

~~~sh
starforge captured-api handover inventory \
  --dir /private/state/supplier
~~~

This command reads every package page and every captured-source library page.
Use actual returned package names, package manifest hashes, source kinds,
source IDs and saved review revisions. The package list includes each original
package UUID, input hashes and route count. The source list contains the original
retained library entries.

Create a private selection JSON using this schema. Replace the illustrative
names and hash labels below with those returned by the original product:

~~~json
{
  "schema": "stellar-forge.captured-api-handover-request.v1",
  "label": "Supplier merchant collection",
  "packages": [
    {
      "name": "supplier-current",
      "manifestSha256": "ACTUAL_PACKAGE_MANIFEST_SHA256"
    },
    {
      "name": "supplier-priced",
      "manifestSha256": "ACTUAL_PRICED_PACKAGE_MANIFEST_SHA256"
    }
  ],
  "sources": [
    {
      "kind": "refresh",
      "id": "ACTUAL_REFRESH_OPERATION_SHA256",
      "revision": "ACTUAL_SAVED_REVIEW_SHA256"
    }
  ]
}
~~~

The `packages` array also accepts plain saved names. Supplying the manifest
hash pins the package you inspected before preparation. Packages saved from an
original captured review automatically include that capture or refresh packet;
a separate `sources` selection adds unfinished source work or another source
that should accompany the merchants.

A source selection without `revision` includes its complete current saved review
history. A source with `revision` additionally requires that exact saved review.
Selecting two revisions of the same source keeps one source member containing
both. A refresh keeps the complete earlier and candidate captures, their
immutable reviews, comparison report, migrated draft and original review page.

Use at least one package or source. One collection supports up to 1,000 packages
and 1,000 distinct source members, including sources automatically selected by
those packages. The original native file and compiler limits still apply.

## 2. Prepare the full collection

Choose a new output directory under an existing private parent. The output must
be outside the sending product's projects tree. Keep the selection file private
and retain it for continuation.

~~~sh
starforge captured-api handover prepare \
  --dir /private/state/supplier \
  --selection /private/inputs/supplier-handover.json \
  --out /private/handovers/supplier-edition-1
~~~

Preparation fixes the selected original package manifests and source identities
in `operation.json`, then copies the actual native artifacts into this directory:

| Member | Retained files |
| --- | --- |
| Each merchant under `packages/NAME/` | Original package manifest and UUID, OpenAPI, full plan, facade, route/upstream bindings, declared request examples, source revision, compiled merchant files and original `RUN.md` |
| Native merchant export | The original complete `package-export.json` with its export identity and every declared file hash |
| Capture under `sources/capture-ID/` | Original `source.har`, native inventory and manifest, and every immutable saved source review selected by the completed copy |
| Refresh under `sources/refresh-ID/` | Complete `previous/` and `candidate/` native workspaces, both review histories, `refresh.json`, comparison, draft and review page |
| Collection | `READ-ME.md`, `handover-review.json` and retained original preparation records |

Each captured merchant is reopened against its copied original review. Its saved
OpenAPI must equal the native document generated from that exact retained
capture and review. Several merchants using the same source share one source
member while keeping each full package and price edition.

The native package exporter retains its complete bytes before copying. A
completed copied package or source is reopened on retry. The first completed
source snapshot stays fixed if new reviews arrive in the sending library later.
A later collection belongs in a new output directory.

The result contains `state: "PREPARED"`, the complete `review` and its exact
`reviewSha256`. The same complete review is retained in
`handover-review.json`. Inspect the label, selected package/source identities,
required backend environment references, full file roster and total byte count.

If preparation stops, repeat the same command with its original selection and
output. The command checks the original operation and resumes unfinished native
members. A lost reply after a native copy is resolved by reopening that complete
copy. The native directory lease prevents a second handover writer from using
the same output concurrently.

## 3. Publish and move the reviewed collection

Use the exact `reviewSha256` from the completed preparation:

~~~sh
starforge captured-api handover publish \
  --out /private/handovers/supplier-edition-1 \
  --review-sha256 ACTUAL_PREPARED_REVIEW_SHA256
~~~

Publication reopens all native files and compares the complete review before
creating `handover.json`. It returns `handoverId` and `manifestSha256`. Retain
those values with the delivery. Repeating publication with the same review
reopens the same original manifest.

The published directory is self-contained. Publication and inspection use the
copied native artifacts, so the sending console can be closed after preparation
has completed. The original sender's runtime or export directory is then no
longer required to inspect or receive the collection.

Move the complete directory through your normal private file transfer. Preserve
its relative file layout and private file modes: directories `0700`, files
`0600`. The raw captured source and its reviews travel with the merchants.
The recipient can relocate the whole directory before receiving because the
collection's declared member paths are relative.

On the receiving host, inspect the complete delivered directory using the
published manifest hash:

~~~sh
starforge captured-api handover inspect \
  --bundle /private/delivery/supplier-edition-1 \
  --manifest-sha256 ACTUAL_PUBLISHED_MANIFEST_SHA256
~~~

Inspection reopens every native member, checks the entire declared file roster
and exact manifest/review identity, and confirms the original captured
source-to-merchant joins. Its output supplies the full published collection for
the receiving operator's review.

## 4. Initialize the receiving product

Initialize a product with the receiving host's own project directory, private
connection references and intended credentials. Reuse an existing initialized
product when the collection belongs in that operator's library.

~~~sh
starforge captured-api init \
  --dir /private/state/supplier-received \
  --name 'Received supplier merchant'

starforge captured-api open \
  --dir /private/state/supplier-received \
  --browser-only
~~~

The second command keeps the original browser open. Use a separate terminal for
the receiving commands. The same product can be managed from Applications using
the [retained initialization and launch walkthrough](OPERATING.md#run-the-retained-product-from-applications).
A product attached to an existing Applications browser uses that browser's
original project directory and private URL record.

The transferred plan retains its seller URL, payment network/asset, atomic
amounts, backend references, authorization choices, replay/stream settings and
other native policies. Configure their actual receiving-host environment
references before operating the merchant. Reopen the package in the native
merchant form when new public terms or host settings require a reviewed edition.

## 5. Review receiving names and source matches

~~~sh
starforge captured-api handover receive-review \
  --dir /private/state/supplier-received \
  --bundle /private/delivery/supplier-edition-1 \
  --manifest-sha256 ACTUAL_PUBLISHED_MANIFEST_SHA256
~~~

The review opens the original receiving product and inspects its actual retained
native members. It leaves the target unchanged and returns a stable
`operationId`, `reviewSha256` and the complete intended target mapping.

| Review state | Receiving behavior |
| --- | --- |
| Package `NEW` | Publish the original complete package under the selected target name |
| Package `REUSED` | Reopen the exact existing package and original immutable identities |
| Package `NAME_CONFLICT` | Select another target name for this incoming package |
| Source `NEW` | Adopt the complete native capture or refresh |
| Source `REUSED` | Reopen the existing matching native source and retained review history |
| Source `MERGE_REVIEWS` | Add only missing valid immutable reviews to the equal source |
| Source `SOURCE_CONFLICT` | Reopen and repair that original native source before continuing its receiving operation |

The overall review is `READY` when the selected names and native source
identities can receive the collection. The target binding includes the original
handover/manifest, receiving product and complete name mapping. Equal native
source/package results that another accepted operation has already received
remain reusable.

To choose different local package names, save a private JSON object mapping
original names to desired receiving names:

~~~json
{
  "supplier-current": "supplier-base-received",
  "supplier-priced": "supplier-priced-received"
}
~~~

Pass `--names /private/inputs/receiving-names.json` to both `receive-review` and
`receive`. Unlisted packages keep their original names. Target names must be
distinct and satisfy the original native package-name rules.

A local name changes the receiving folder selection. The original package UUID,
manifest, full plan, source hashes and compiled bytes remain the same.
A different incoming package under an occupied name remains a name conflict
until the operator chooses an available target.

## 6. Apply the reviewed collection

Use the exact receiving `reviewSha256` from the preceding step:

~~~sh
starforge captured-api handover receive \
  --dir /private/state/supplier-received \
  --bundle /private/delivery/supplier-edition-1 \
  --manifest-sha256 ACTUAL_PUBLISHED_MANIFEST_SHA256 \
  --review-sha256 ACTUAL_RECEIVING_REVIEW_SHA256
~~~

Use the same `--names` input when a name map was reviewed. Receiving records the
complete original binding before native mutations. It then adopts the original
sources through the existing authenticated HAR console, reopens them, and
receives the complete merchant packages through the existing authenticated
package-transfer operation.

An equal source gains only missing immutable reviews. The receiving operator's
additional source reviews remain present. Both members of a refresh keep their
original provenance. Each package passes the existing native reader and compiler
validation before its receiving directory becomes selectable.

Completed members get retained phase records under
`PRODUCT/receiving/handovers/OPERATION_ID/`. The final `received.json` is
published after all original native target files have reopened successfully.
The result contains source selections, retained review revisions, received
package names/identities and the original product's browser connection record.

For an interruption or lost reply, repeat the same command. The existing native
copy/adopt and package-receive operations reconcile the original result.
A completed phase is reopened directly. A complete repeated receive returns the
same operation and saved merchant identities with `reused: true`.

The source bundle may move to a different absolute path between invocations.
Supply its new `--bundle` path with the same original manifest, review and name
mapping. The original receiving intent remains the same.

## 7. Reopen and operate the received merchants

Open the receiving product's browser. In **Captured API sources**, select the
received source or refresh and its original review revision. Review or continue
its source decisions in the same integrated workbench. The earlier and candidate
histories remain available for the next native source refresh.

Select each received package from the original saved merchant library.
The full source, plan, route selections, atomic prices, request examples and
compiled output reopen through the original SF61 reader. The native
**Route worksheet** can then produce a separately reviewed price edition.

Use the original browser's start/check/operations controls to run the selected
merchant with the receiving host's declared environment. The native package
receiving response, retained in the corresponding phase record, provides local
release commands for the new location. The package's original `RUN.md` preserves
the historical source location; the receiving response and browser supply the
current local paths.

For release operation, use the existing `merchant_openapi_stage` agent tool with
the received package and selected original release store. Continue through its
inspect, compare, activate and start workflow using the actual returned source
digest and selection generation. The maintained
[package transfer guide](../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/PACKAGE_TRANSFER.md#receive-and-continue-operating)
covers this native handoff in full.

After closing and reopening the product, its source library, saved packages and
receiving records remain in the same native locations.

## 8. Recover from the retained receiving operation

Use the `operationId` returned by `receive-review` or `receive`:

~~~sh
starforge captured-api handover status \
  --dir /private/state/supplier-received \
  --operation ACTUAL_RECEIVING_OPERATION_ID
~~~

Status reads the retained original manifest and reopens the native target files.
A completed operation remains inspectable after the delivered bundle is moved
or removed. A pending operation reports its completed member records and the
remaining members; repeat `receive` with the original complete bundle to finish.

| Where the process stopped | Continue |
| --- | --- |
| Before a preparation review exists | Repeat `prepare` with the same selection and output |
| After native copy/export but before its reply | Repeat `prepare`; the complete native destination or retained export is reopened |
| After completed preparation | Publish the exact retained `handover-review.json` hash |
| After manifest publication but before stdout | Repeat `publish` or inspect the complete published directory |
| Before native receiving starts | Use the reviewed manifest, product and package name map |
| During source or package receiving | Repeat `receive` with the same review; inspect the returned operation ID |
| After all receiving finishes but before stdout | Use `status` or repeat the same receive |
| After a receiving-only source review is saved | Reopen the same operation; additional immutable reviews remain available |
| After the sending library gains another price or source edition | Prepare a new output collection using those actual saved selections |

Each output or receiving operation holds its original Linux file lease while
working. Completed metadata is published as whole private files and retained
byte for byte. Reentry finishes an interrupted publication of its own whole
file and verifies the native contents before continuing.

## Programmatic use

The installed distribution exports `./products/captured-api/handover`. From the
complete source, import the original module directly:

~~~js
import {
  inventoryCapturedHandover,
  prepareCapturedHandover,
  publishCapturedHandover,
  inspectCapturedHandover,
  reviewCapturedHandoverReceive,
  receiveCapturedHandover,
  inspectCapturedHandoverReceive,
} from './products/captured-api/handover.mjs';
~~~

| API | Input |
| --- | --- |
| `inventoryCapturedHandover` | `{directory}` |
| `prepareCapturedHandover` | `{directory, out, request}` using the original selection schema |
| `publishCapturedHandover` | `{out, expectedReviewSha256}` |
| `inspectCapturedHandover` | `{bundle, expectedManifestSha256?}` |
| `reviewCapturedHandoverReceive` | `{directory, bundle, expectedManifestSha256?, names?}` |
| `receiveCapturedHandover` | `{directory, bundle, expectedManifestSha256?, expectedReviewSha256, names?}` |
| `inspectCapturedHandoverReceive` | `{directory, operationId}` |

The command-line product forwards `captured-api handover` to the same module.
From an uninstalled complete source checkout, replace
`starforge captured-api handover` with
`node products/captured-api/handover-cli.mjs`. Use the same prepared runtime that
provides the original SF61, compiler and merchant dependencies.
