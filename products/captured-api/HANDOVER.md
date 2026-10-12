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

## Complete the handover in the browser

Open the retained product with `starforge captured-api open --dir PRODUCT` or
start its saved **Captured API merchant** application. Follow **Merchant handover**
in the original merchant browser's header. The handover page uses that same
private browser session and product directory.

### Send the complete collection

1. Choose **New outgoing collection**. Give the collection a useful label.
2. Refresh the original inventory. Select saved merchant packages, captured
   sources, or both. Package selections retain the displayed manifest hash.
   A captured merchant automatically includes its original capture or refresh
   and the review used to author that merchant.
3. Use **Selected members** to inspect every explicit selection. An optional
   original review hash requires that saved review to be present; the source
   still carries its complete retained review history.
4. Choose **Save draft edition**, then **Prepare complete collection**. The
   product retains the complete original request before copying native members.
   An accepted preparation appears under **Operations** and continues on the
   same original native writer if the page disconnects.
5. Review the completed collection's summary, merchants, sources and full file
   roster. Source rows expose the original review hashes and both histories of
   a refresh. Merchant rows expose their original package/source identity and
   required runtime environment references.
6. Choose **Publish and create complete file**. This publishes the reviewed
   native collection and streams its complete original files into one
   `.sfhandover` archive. Choose **Download complete handover** and retain
   the displayed file byte count and SHA-256 with the delivery.

The download carries the exact original handover manifest, original review,
every declared merchant and captured-source file, and the collection's operating
instructions. It includes the complete native packages, raw captures, immutable
source histories and compiled output. The manifest and original native
compilers remain the content authority.

The browser uses a short-lived download permission on the same private host.
A normal file download streams from the retained original file descriptor and
supports a single HTTP byte range. If a download stops, reopen Download in the
original browser; the file and hash remain the same.

### Receive and operate the collection

Initialize and open the receiving product. In its **Merchant handover** page:

1. Choose the original complete `.sfhandover` file. Enter the sender's
   file SHA-256 when it was supplied, then choose **Upload and inspect complete
   file**.
2. Uploads retain their original identity, complete size and original payload
   file before data arrives. The page sends 1 MiB chunks with their SHA-256.
   The receiver streams and hashes the complete original archive, extracts its
   declared members into a private retained collection, then invokes the
   original full handover inspector.
3. Review the inspected merchants, captured histories and full file roster.
   Choose **Use this collection for receiving**. The receiving draft now
   contains that exact retained collection, manifest hash and original names.
4. Edit any receiving names, save the complete draft edition, and choose
   **Review receiving names**. The review reports existing matching sources,
   missing reviews, reusable packages and individual conflicts.
5. Resolve a name conflict in a new saved draft edition and review again.
   **Receive this reviewed collection** applies the exact displayed review,
   including its original source identity and complete name mapping.
6. After receiving completes, use **Open NAME** to reopen each original native
   merchant with its full source, plan, atomic prices and compiled package.
   Its original worksheet, runtime, customer, operation and release controls
   remain available. Reopen captured sources from the native source library
   to continue their saved decisions or prepare a later capture edition.

The **Received** library reads the original product's receiving records.
Opening one inspects its native merchant and source files again. A completed
receiving result remains available after the downloaded collection is moved
away. Additional reviews authored by the receiving operator remain present.

A collection already available in a private directory on the receiving host can
be opened without uploading a file. Choose **Open receiving collection**, enter
its directory and optional known manifest hash, save, then choose **Inspect saved
collection**. Use that inspected result to populate the exact manifest and
merchant names before saving and reviewing receiving.

### Continue a saved browser operation

The browser retains each working form by draft and selected base edition.
Switching drafts or opening saved history keeps those edits available. History
is a view of the original saved fields; **Open retained working form** returns
to the edit, and **Work from this edition** restores that edition's retained
form or starts from its saved fields. The edition selector marks bases with a
retained working edit. A saved draft's server history remains available when the
browser uses a different local port.

Accepted requests remain bound to their selected saved edition. Editing a form
does not change a preparation, publication or receiving operation already in
progress. Reopening an inactive draft or job finishes its own interrupted
whole-file publication before reading it. A draft whose first edition was
interrupted completes that original edition from its retained creation fields.

| Interrupted work | Continue in the same product |
| --- | --- |
| Draft save loses its reply | **Continue original request** reuses the complete original edit and save identifier |
| Another operator saved the same draft | Compare the current saved edition; open it or retain your working form for a new save |
| Preparation or publication stops | Open its original **Operations** entry and choose **Continue this original operation** |
| File upload stops | Open its entry under **Files**, choose the same original file, and continue the retained offset/chunk |
| Upload finishes before the reply arrives | The retained file status supplies its original full byte count and hash |
| File import stops | Continue its original operation; completed immutable files stay retained |
| Receiving stops after some native members | Continue the original receiving operation with its selected review and names |
| A receiving reply is lost after completion | Open the original operation or **Received** entry and reopen the native merchants |
| The browser restarts on another local port | Open the saved draft, file or operation from the product's server libraries |

A partially written upload chunk retains its original start, size and SHA-256.
On continuation the browser resends that same original slice; the native writer
compares its retained prefix and writes only the missing suffix. It never
replaces a completed payload with a new file. A different file belongs in a new
upload.

New browser operations are retained under
`PRODUCT/handover-desk/`: immutable draft editions in `drafts/`,
accepted complete requests and results in `jobs/`, original uploads in
`uploads/`, and full inspected collections in `collections/`.
Original source/package receiving continues under the product's existing native
projects and `receiving/handovers/` directories.

Normal Stop first drains the merchant agent, then denies new handover requests
while accepted uploads, exports, native source/package operations and downloads
finish. The original merchant listener stays available for those accepted
native calls. It then follows the existing browser, seller and product lease
shutdown. Reopen the same retained product to continue an interrupted operation.

An externally attached SF61 console keeps its original lifetime and interface.
The product's existing terminal handover commands operate through that original
connection. The integrated handover browser is available when this product owns
the browser, including its Applications-managed launch.

## Move one complete file from the terminal

The same maintained archive implementation is available from the existing
handover command. First prepare and publish a collection using the selection
and review steps below. Then export its complete file into a new private
directory:

~~~sh
starforge captured-api handover file-export \
  --bundle /private/handovers/supplier-edition-1 \
  --out /private/handovers/supplier-edition-1-file \
  --manifest-sha256 ACTUAL_PUBLISHED_MANIFEST_SHA256
~~~

The result supplies the exact archive path, bytes and SHA-256. Move that one
file using the normal private transfer path. On the receiving host, preserve its
private file mode and import it with the original file identity:

~~~sh
starforge captured-api handover file-import \
  --file /private/delivery/captured-ORIGINAL_ID.sfhandover \
  --out /private/delivery/supplier-edition-1 \
  --file-sha256 ACTUAL_ORIGINAL_ARCHIVE_SHA256 \
  --file-bytes ACTUAL_ORIGINAL_ARCHIVE_BYTES
~~~

The importer retains its original input binding, verifies the streamed full file,
receives every original member, and runs the complete native handover inspector.
Its result supplies the same native collection directory and manifest hash used
by the existing receiving review and receive commands. Repeat the exact file
export or import after an interruption to continue its original publication.

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
If the first original manifest record has not finished publishing, status identifies
that retained preparation step so the same receive command can complete it.

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

### Complete file and browser APIs

The distribution also exports `./products/captured-api/handover-archive`,
`./products/captured-api/handover-upload` and
`./products/captured-api/handover-browser`. The original product launcher
uses the browser module directly.

| Native API | Complete input and result |
| --- | --- |
| `exportCapturedHandoverArchive` | `{bundle, directory, expectedManifestSha256}` → original complete file path, bytes, SHA-256 and handover identity |
| `receiveCapturedHandoverArchive` | `{path, directory, expectedSha256, expectedBytes}` → original inspected full native collection and archive identity |
| `initializeCapturedHandoverUpload` | `{root, id, name, bytes, expectedSha256?}` retains the original upload |
| `appendCapturedHandoverUpload` | `{root, id, offset, bytes: Buffer, sha256}` continues its original chunk |
| `inspectCapturedHandoverUpload` | `{root, id}` returns complete size, retained offset and any original pending chunk |
| `finishCapturedHandoverUpload` | `{root, id}` returns the completed original file path/hash after its full byte count is present |
| `createCapturedHandoverWeb` | `{directory}` → optional original-host `navigation`, `servePublic`, `api` and `close` hooks |

The original SF61 host authenticates the browser's
`/api/captured-handover/*` routes with its existing workspace token and
exact origin check. Saved-draft APIs select an immutable revision. A native job
selects either that revision, a completed original review, a finished upload, or
an existing receiving operation. The saved original job is resolved before a
repeat can enter a new native writer.

## Continue the complete handover through the merchant agent

The same saved drafts, native jobs and complete file now have nineteen
`merchant_handover_*` operations and a typed streaming client. Use
`starforge captured-api handover remote --help` for ordinary terminal calls,
whole source-to-receiver transfer, local file download/upload and exact job
waiting. The [complete agent walkthrough](AGENT.md) follows original package
and source selections through native review/publication, the complete archive,
receiving name review, original receive and merchant reopen.

## Combine independent draft edits before delivery

The original immutable draft history now supports a complete collaboration
review. **Compare and combine current draft** combines independent package,
source-review and name-map edits with the current saved edition. Explicit
current/working choices resolve conflicting changes and complete receiving
source changes. The exact reviewed form saves as another original edition.

Use **Export working edit** and **Review selected working file** to share a
complete edit with another operator of the original product and draft. Working
files keep their full base and intended form; their native reader verifies
the selected history before comparison. The original package and source
handover remains the complete file-delivery path between products.

The [collaboration guide](COLLABORATION.md) follows this through retained
browser reviews, four native merchant tools, typed APIs, terminal file
publication and exact saved-request recovery. Continue PREPARE or the receiving
review with the returned saved draft revision.
