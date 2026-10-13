# Portable merchant projects

The merchant application can hand a complete working project to another operator. A project archive carries a consistent SQLite snapshot, the original invoices and payment records, every saved result referenced by that snapshot, the selected fulfillment files, the original configuration, and the complete installed application source.

The receiving command retains those original files and creates a separate runtime. Open that runtime in the merchant browser to review invoices, inspect their original activity, download saved payment requests, and download the complete delivered files. The retained project can then be configured for an operational deployment through Applications.

## Export from the merchant browser

An installed merchant application discovers its original `source.tgz` at the runtime root, alongside the installed `package/` directory. Its exact source archive enables **Project handover** in the existing invoice workspace.

1. Connect with the normal operator token.
2. Select **Export project**.
3. Continue using the invoice workspace while the application prepares the archive.
4. Select **Download project** when its row shows **Ready**. **Contents** downloads its full manifest.

The row identifies the original export operation, creation time, invoice count, archive entries, and download size. Its operation UUID is retained before the request begins. If the browser disconnects or the application stops, **Resume export** continues that same request and original artifact. A second click on an active operation observes the existing export.

The browser downloads the archive through a short-lived, one-use link created by the authenticated operator. The browser's download manager streams the file to its normal destination; the page does not buffer the project in memory.

An export is a point-in-time copy of committed merchant state. The application first flushes any provider or handler returns it has already retained in memory into their original SQLite records. SQLite then captures the committed database consistently under the application's original ownership lease. An invoice still in progress appears in that state in the saved project, with its original request, payment identity, events and recovery records.

The export contains the customer's retained payment authorizations and original provider returns. Transfer the package to the receiving operator as customer business data.

## Export from a source checkout

A source checkout needs the complete archive produced by the maintained distribution builder for that same source edition. The archive is preserved as a whole; the exporter checks its original manifest and current merchant source before collecting business files.

Start the ordinary server with the selected archive:

~~~bash
node products/x402api-merchant-workspace/server.mjs serve \
  --config /srv/merchant/config.json \
  --directory /srv/merchant/workspace \
  --source-archive /srv/merchant-install/source.tgz \
  --source-sha256 ACTUAL_SOURCE_ARCHIVE_SHA256 \
  --exports-directory /srv/merchant-projects
~~~

Use the exact SHA-256 from that source archive's original build record. The configured export directory must be private, separate from the workspace, and outside its directory tree. The server chooses a sibling directory ending in `-exports` when an installed application supplies its archive automatically.

The merchant uses its original configuration, tenant credential reference, operator token reference, webhook key versions, receipt key pins and fulfillment adapter. The Python worker receives the existing kernel lease through an inherited file descriptor, so it does not release or replace the live application's lock.

Use `--input-files` for the same explicit additional input paths already used by the installed application's input review. The normal `--expect-inputs-sha256` contract remains in force when those paths are selected. Configuration, the selected handler module, the built-in delivery manifest and every file edition pinned by that manifest are collected and verified from their existing descriptors.

## Export a stopped workspace

The command line can export a saved workspace without starting the merchant server or contacting a provider:

~~~bash
node products/x402api-merchant-workspace/portable.mjs export \
  --operation 6b2b9865-83f4-4e4c-8a36-360d8d611c12 \
  --directory /srv/merchant/workspace \
  --config /srv/merchant/config.json \
  --source-archive /srv/merchant-install/source.tgz \
  --source-sha256 ACTUAL_SOURCE_ARCHIVE_SHA256 \
  --output-directory /srv/merchant-projects
~~~

Keep this operation UUID with its exact paths and source selection when continuing the export. Choose a new UUID for a new snapshot. The offline command acquires the same `merchant-owner.lock` used by the live application; stop the original server normally before selecting this route.

The command writes one complete JSON result to standard output. `archive.path`, `archive.bytes` and `archive.sha256` identify the saved ZIP. Byte counts are decimal strings in the native manifest and command result.

For an automated handover, put the exact request in a private JSON file and call:

~~~bash
node products/x402api-merchant-workspace/portable.mjs export \
  --request /srv/merchant-projects/export-request.json
~~~

The request schema is `stellar-forge.merchant-portable-request.v1`. It contains `action`, the stable `operation`, `directory`, `config`, `sourceArchive`, `sourceSha256` and `outputDirectory`. Explicit `inputFiles` are records with `path`, decimal-string `bytes`, `sha256` and `role`. Live application requests also bind `expectedStoreId` to the original merchant store.

The command uses Python 3.11 or newer and its standard SQLite, ZIP and filesystem libraries, including SQLite's incremental BLOB reader. `--python` selects an existing Python executable. The installed application continues to use its declared Node 24 runtime and existing Linux ownership mechanism.

## Inspect the complete archive

Use the original archive hash supplied by the exporting operator:

~~~bash
node products/x402api-merchant-workspace/portable.mjs inspect \
  --operation f41331b3-bec9-4385-aad1-6a3c37ccbf87 \
  --archive /srv/incoming/merchant-project.zip \
  --archive-sha256 ACTUAL_PROJECT_ARCHIVE_SHA256
~~~

Inspection reads and verifies the whole archive through the maintained source-bundle archive reader. It checks every manifest member, path, byte count and hash before returning the project's complete manifest.

The manifest has schema `stellar-forge.merchant-portable-project.v1`:

| Field | Contents |
| --- | --- |
| `original` | Original workspace directory, configuration path, merchant store identity and schema version. |
| `snapshot` | Consistent SQLite file identity, table counts and the native business-state fingerprint. |
| `configuration` | Exact raw configuration identity, environment reference names and selected fulfillment information. |
| `source` | Exact complete installed source archive, including its original package manifest. |
| `results` | Every saved result referenced by the snapshot, with its original identity and file metadata. |
| `inputFiles` | Selected handler/configuration/manifest files and explicit declared inputs. |
| `files` | Complete archive inventory with relative paths, decimal-string sizes and SHA-256 hashes. |

The SQLite snapshot includes every original merchant table. Charge requests, retained buyer authorizations, raw HTTP returns, webhook event bodies and returned fulfillment BLOBs stay complete. Table rows keep their original invoice, charge, provider order, payment, event, request and fulfillment identities.

## Receive and open the project

Receive into a private destination selected for this project:

~~~bash
node products/x402api-merchant-workspace/portable.mjs receive \
  --operation 548e9e06-ec81-49fb-8a83-ce77b6285fc4 \
  --archive /srv/incoming/merchant-project.zip \
  --archive-sha256 ACTUAL_PROJECT_ARCHIVE_SHA256 \
  --destination /srv/received/customer-merchant
~~~

The result's `received` object supplies the exact paths and source identity:

| Result field | Purpose |
| --- | --- |
| `sourceDirectory` | Complete original application source materialized with the maintained distribution archive reader. |
| `sourceArchive` and `sourceSha256` | The complete retained source archive at the new runtime root, used for a later project export. |
| `workspaceDirectory` | Independent runtime database and saved results. |
| `reviewConfigPath` | Configuration for opening the saved project in review mode. |
| `activationConfigPath` | Receiving configuration for the original operational application. |
| `receiptPath` | Original completed receiving record used for continuation. |

The receiver keeps the archived files under `original/`. It creates runtime copies separately and changes only the two result-storage metadata locations that must point at the new workspace: `merchant_orders.data_json.result` and `merchant_fulfillments.result_file_json`. Original financial and request fields remain intact. The original SQLite snapshot remains available for comparison.

A completed receiving record protects a runtime that has already been opened or used. Repeating the same receiving request returns the original result; it does not reset an active customer's database to the archived snapshot.

Set a new operator token in `MERCHANT_REVIEW_OPERATOR_TOKEN` using the receiving environment's normal secret configuration. The review configuration changes only the operator-token environment reference. Open the exact paths returned by the command:

~~~bash
node /srv/received/customer-merchant/runtime/source/products/x402api-merchant-workspace/server.mjs review \
  --config /ABSOLUTE/PATH/FROM/reviewConfigPath \
  --directory /ABSOLUTE/PATH/FROM/workspaceDirectory \
  --host 127.0.0.1 \
  --port 8764
~~~

Open the reported URL and connect with that new review token.

The same invoice list, search, detail view, payment-request download, activity timeline and result downloads are available. The header identifies **Project review**. SQLite opens the runtime database in read-only mode, and the application retains its ordinary ownership lock for the session. Opening and closing this view does not create runtime rows or reclassify a fulfillment.

Review loads the saved merchant configuration and the original business/file readers. It does not import the customer's handler module or require the original live tenant and webhook secrets. Invoices that were still in progress display their exported state and original activity; delivered invoices expose their exact saved files.

For a local commissioning configuration with a loopback public origin, include the existing `--allow-loopback` option.

## Activate an operational receiving deployment

After reviewing the project, use its returned activation configuration with the existing Applications registration, input fingerprint review and merchant doctor flow described in [INSTALLED_RECEIVING.md](INSTALLED_RECEIVING.md) and [OPERATING.md](OPERATING.md).

The deployment keeps the original invoice/request/resource/key identities. Supply the existing tenant and webhook environment references through the destination's normal credential configuration. Bind the destination to the intended original public endpoint and route callbacks to that deployment.

Move operation to the receiving deployment after the original deployment has stopped normally and retained its actual returns. A filesystem lock coordinates writers inside one workspace; it does not coordinate independent machines. A snapshot taken earlier remains a saved historical point in time. For a production move, export the original stopped workspace again at the actual cutover and receive that final operation into the selected fresh destination.

The built-in file-delivery adapter receives a relocated manifest with every pinned edition preserved, including older editions used by historical invoices. Its content binding still identifies the exact bytes, filename and content type. A new invoice can select the configured current edition while older invoices retain their original bindings.

A custom adapter carries its original module and explicitly declared inputs. The receiver preserves their relative directory relationships. Review and configure any adapter-specific absolute service or file paths before starting the original handler. The saved source and original environment references provide the information needed to do this against that customer's actual deployment.

Use the ordinary merchant server after the receiving configuration has passed the existing doctor/input checks. The original application performs its normal recovery for unfinished work and serves retained completed results from the relocated runtime.

## Application API

All project management endpoints use the existing operator bearer authentication and origin checks.

| Method and path | Result |
| --- | --- |
| `GET /api/project` | Availability, mode, original store identity, selected source hash and all retained export rows. |
| `POST /api/project/exports` | Start or resume `{ "operation": "original-uuid" }`; returns `202` while preparing or `200` when complete. |
| `GET /api/project/exports/:operation` | Durable status of that original export. |
| `GET /api/project/exports/:operation/manifest` | Complete native project manifest. |
| `GET /api/project/exports/:operation/archive` | Authenticated streamed ZIP download. |
| `POST /api/project/exports/:operation/download` | Create the browser's one-use download link, valid for 60 seconds. |

The browser uses `PREPARING`, `COMPLETE`, `INTERRUPTED` and `RETRY_REQUIRED` to describe the original operation. `INTERRUPTED` means a retained preparing record has no corresponding active export in the current application. Resume sends the same operation and reopens its immutable original request.

Export destinations and source selections come from the server's configuration. The browser supplies an operation UUID, so a project request cannot select arbitrary files or filesystem paths.

Project jobs belong to the running merchant application. Closing the HTTP server drains its original export jobs before releasing the merchant workspace lease.

## Source and receiving

- [server.mjs](server.mjs): Original HTTP routes, lifecycle and live/review CLI.
- [workspace.mjs](workspace.mjs): Original business projection, saved results, actual return flush and read-only review facade.
- [store.mjs](store.mjs): Original SQLite records, kernel ownership and SQLite read-only mode.
- [portable.mjs](portable.mjs): Original export request/status/download management and native CLI.
- [portable_native.py](portable_native.py): Consistent source/database/file export and independent receiving.
- [source_bundle_archive.py](../../stellar/scf-starforge-20261009/sf30-seller-sdk/source_bundle_archive.py): Maintained whole-archive streaming inventory and receiving.
- [runtime-unpack.py](../../stellar/scf-starforge-20261009/distribution/runtime-unpack.py): Maintained installed-source archive inspection and identity rules.
- [NATIVE_RECEIVING.md](NATIVE_RECEIVING.md): Original five-invoice application commissioning.
- [INSTALLED_RECEIVING.md](INSTALLED_RECEIVING.md): Original installed application commissioning and browser journey.

The portable receiving programme continues the original saved five-invoice project. It uses the same original SQLite, result files and source inputs when exercising export, complete archive inspection, receiving, browser review, saved downloads, repeated receiving and cold reopen.

[PORTABLE_FOREGROUND.md](PORTABLE_FOREGROUND.md) gives the complete source intake and execution procedure. Select `--portable` on the maintained installed receiving entrypoints to run the full browser export, independent review, activation, repeated receiving and onward handover in its own receiving directory. The completed delivery contains the original customer input, installed source, both received projects and their complete saved files.

## Interrupted file deliveries in a project ZIP

A new export retains the complete private `results/` tree together with the original SQLite snapshot. This includes completed files, a final file whose database completion was interrupted, exact SF31 reservation locks, empty locks, partial response prefixes and unreferenced partials left by the original native writer. The archive keeps every original byte and the native reservation mapping; it does not infer a payment or fulfillment transition.

The same installed Node reservation reader and restorer serve the directory and project ZIP workflows. The Node launcher passes its actual executable to the Python worker. A direct Python invocation uses `MERCHANT_PORTABLE_NODE`, then `CODEX_PRIMARY_RUNTIME_NODE`, then `node` on the executable path. The selected distribution must contain the complete current merchant source, including `portable-reservation-bridge.mjs`.

Receiving first validates the original result inventory against the unchanged snapshot and retained return bytes. It prepares a private full copy, relocates only each lock's native destination and partial paths, and durably records the complete published result state before publishing the independent runtime database. Empty locks and original reservation tags stay intact. The original archive remains unchanged.

If receiving is interrupted before that publication, the same request continues its selected staging and exact file copy. An interrupted unpublished native relocation is retained privately and a fresh complete stage is prepared. Once result publication is recorded, receiving reuses that record and preserves any later native progress. It never recreates a consumed lock or replaces a partial that the received merchant has continued. Completed receive replay checks the original archive and retained publication identities while keeping the live workspace's current state.

The existing native merchant recovery remains the operator workflow: it adopts an exact already-published final response or continues from its original retained return. A resumed `RETURNED` fulfillment uses that original return, keeping the same payment, request, result digest and history.

Earlier project ZIPs retain their original inventory and receiving rules. A new export records its complete result state explicitly; the new reader accepts both editions.

## Complete directory handover

The same installation retains the [complete offline directory handover](PORTABLE.md), including original fulfillment reservations, direct offline inspection, source/configuration receiving and independently reopened merchant operation. Use `x402api-merchant export`, `inspect`, `restore` and `serve-archive` for that format; use `x402api-merchant-project export`, `inspect` and `receive` for the source-archive-bound project ZIP documented here. Both routes preserve their original formats and business identities. The complete directory receiver is `portable-directory-receiving.mjs`; this guide's installed `--portable` programme remains `portable-receiving.mjs`.
