# CKAN data merchant

Capture a complete CKAN resource, review its fields and source definitions, publish
a native dataset, and hand the whole working project to another operator.
The same saved project opens in the browser, through the CLI and through the
merchant's CKAN and DCAT tools. Later editions can be compared in full and accepted
as a separately reviewed successor.

The `ckan-merchant` source selection includes the original catalogue capture,
semantic projection, dataset publisher, merchant and buyer, reviewed refresh,
whole-workspace transfer, Applications adapter, and Python customer source.
Its [receiving guide](RECEIVING.md) carries a published project through a complete
following edition and an independently reopened workspace.

The product also opens complete DCAT-US catalogue documents in the same saved
workbench. Its **dcat** command and **Catalogue migration** browser section retain
original source bytes, converter and validation results, full dataset/series
conservation, successive-edition comparisons, corrected candidates, cutover and
rollback history. The [catalogue migration operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/MIGRATION_OPERATING.md)
carries this whole workflow through a received and independently reopened
workspace. Its [engine setup guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/DCAT_ENGINE.md)
prepares the original pinned GSA converter and Python dependencies.

## Install the complete product

Use Node 24 on Linux with the existing `flock` utility. Keep source, runtime and
private project directories separate. Build one immutable source revision using
the maintained distribution builder:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout \
  --ref ORIGINAL_COMMIT \
  --selection ckan-merchant \
  --out /absolute/private/packages/ckan-merchant
~~~

The builder returns the complete source archive, SHA-256 and manifest. Keep
those original outputs together. Install the returned archive into a new
application directory using the ordinary package manager, then prepare its
selected native runtime:

~~~sh
CKAN_PRODUCT_DIR=/absolute/private/apps/ckan-merchant
install -d -m 700 "$CKAN_PRODUCT_DIR"
cd "$CKAN_PRODUCT_DIR"
npm install --ignore-scripts --offline --omit=optional /absolute/path/to/package.tgz
starforge() { (cd "$CKAN_PRODUCT_DIR" && npx --no-install starforge "$@"); }
starforge doctor

starforge runtime-install prepare \
  --dir /absolute/private/runtimes/ckan-merchant \
  --archive /absolute/path/to/package.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

starforge runtime-install install \
  --dir /absolute/private/runtimes/ckan-merchant
~~~

Use the archive path and complete SHA returned by the actual build. The shell
helper keeps every `starforge` invocation bound to this installed product even
when you change directory. In a new shell, set `CKAN_PRODUCT_DIR` to this same
application directory and define the helper again. The installer retains the
selected dependencies and the same installation journal.
The [runtime installation guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md)
covers its host requirements and continuation.

The product can also be operated from its checkout. Replace `starforge` below
with `node stellar/scf-starforge-20261009/distribution/cli.mjs`.
Installed source keeps those paths under the package's `source/` directory.

## Open an existing or new project

A project retains its catalogue origin, complete captures, saved field selections,
publication and merchant history, customer requests, and refresh decisions.
Initialize a private project against the actual catalogue:

~~~sh
starforge ckan init \
  --project /absolute/private/ckan-project \
  --origin https://data.svk.se

starforge ckan serve --project /absolute/private/ckan-project --port 0
~~~

Open the private URL returned by that listener. The browser's Catalogue view
searches the configured provider and selects a real package/resource. A capture
retains the complete requested source window and its original metadata, pages,
totals and optional CSVW schema. The original capture engine supports its
offset and keyset pagination with durable progress.

Use the browser or its bound MCP host while that project owner is running.
Stop the owning application before opening the same project through a standalone
CLI mutation. The managed Applications entry owns the browser and agent together;
both operate on the same native workbench.

For a catalogue requiring authentication, initialize with
`--auth-token-env ACTUAL_ENVIRONMENT_NAME` and supply that variable through the
host's existing private environment. The project retains the reference name.
The original direct capture sends the selected authentication to that catalogue.

### Receive already acquired public responses

When a connected worker has acquired the original public responses, the same
capture engine can consume their full retained bundle locally:

~~~sh
starforge ckan capture-received \
  --bundle /absolute/private/source/source-bundle.json \
  --bytes ORIGINAL_BUNDLE_BYTES \
  --sha256 ORIGINAL_BUNDLE_SHA256 \
  --operation ORIGINAL_ACQUISITION_OPERATION \
  --selection /absolute/private/source/selection.json \
  --out /absolute/private/source/capture

starforge ckan import \
  --project /absolute/private/ckan-project \
  --capture /absolute/private/source/capture/capture.json
~~~

Use the complete `commons.source-bundle/v1` and its literal acquisition receipt.
The receiver passes the original response bodies through `captureCkanResource`,
including the original pagination, field, exact-number and metadata checks.
It retains the acquisition binding beside the resulting capture. Keep the
bundle, original selection and capture companions with the complete delivery.

The [retained-source guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/RETAINED_PUBLIC_SOURCE.md)
defines the exact member sequence and interruption behavior.


## Open a DCAT-US catalogue project

Initialize the document-migration project with its actual publisher origin and
open the original application:

~~~sh
starforge dcat init \
  --workspace /absolute/private/catalogue-project \
  --origin https://open.gsa.gov

starforge dcat serve \
  --workspace /absolute/private/catalogue-project
~~~

The project declares its source kind as **dcat-us** and opens **Catalogue
migration**. Receive the original JSON document with its label, declared profile
and publisher reference. A preceding publisher edition and an operator-corrected
candidate are separately retained inputs.

Prepare an independent review, inspect the original schema results and complete
dataset/series field changes, and record the chosen catalogue release. Each
cutover names the expected current active release; restoration records another
history entry selecting a prior candidate. The selected candidate can be
downloaded for the customer's catalogue deployment.

The same original Workspace archive and receiver include the DCAT documents,
reviews and complete release history. Follow the
[migration operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/MIGRATION_OPERATING.md)
for the complete receiving, correction, edition comparison, deployment and
rollback journey and exact **starforge dcat** commands.

## Review fields and publish

In Editions, inspect the full captured fields and retained provider definitions.
Save the selected public aliases, native types and encodings. The editor keeps
null values, empty values and absent fields distinct. CSVW definitions and
observation identifiers travel with the reviewed semantic dictionary.

Create a publication from that saved source. The original publisher prepares
the complete candidate, exposes its query preview and review identifiers, and
publishes the reviewed dataset snapshot. Keep its returned source, publication,
review and snapshot identities.

The merchant workflow then exports the complete handler, typed dataset, source
dictionary and provider capture. Stage that package into the project's original
seller release store and operate it through the existing merchant lifecycle.
The buyer uses the original offer and request; its complete received pages and
files continue into the customer data and Python tools.

The [source operator guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/README.md),
[semantic workflow](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/SEMANTIC_WORKFLOW.md)
and [publisher guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/publisher/README.md)
give the complete field, publication and merchant inputs.

## Review a following edition

Open Reviewed refresh on the same project. Select its saved source, the
published predecessor and the complete following edition. Choose one or more
actual source key fields and prepare the comparison.

The comparison retains every change in JSONL, a seek index, both original source
selections, provider terms and field definitions. Use the returned page cursor
until it ends or download the complete original file. An oversized individual
record is available through that same full-file download.

A changed time window or filter changes row membership. The recorded source
selection explains that change alongside the retained before/after rows.
Composite keys preserve value types and field order. Numeric keys and row
values use the original exact-number parser.

Review the proposed successor's public aliases and types, then preview all of
its rows. Save the named operator's decision against that exact comparison and
projection:

| Decision | Saved result |
| --- | --- |
| Accept | A distinct source with its reviewed projection and semantic identities; prepare and publish its original candidate to obtain the successor publication. |
| Keep current | The earlier source and publications remain selected, with the complete comparison and decision retained. |
| Withdraw source | Future publication from that source ends; existing published versions and a separately accepted successor remain readable. |

The decision is immutable. Reconsidering the same editions creates an explicitly
linked review. A resumed decision completes its original allocated source
identity. Earlier publications keep their own snapshots and merchant packages.

The [complete refresh guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/REVIEWED_REFRESH.md)
contains the exact preparation, preview, decision and candidate-publication JSON.
Its CLI and seven refresh tools expose this same workflow.

## Operate through Applications and agents

For a DCAT-US document project, choose **DCAT catalog migration** and select its
existing private workspace directory and installed runtime. Set the common port
and private environment file as needed; **SCF_DCAT_PYTHON** selects the prepared
Python executable. The default **original** profile requires Python 3.13; for an
actual prepared Python 3.12 interpreter, also set
**SCF_DCAT_RUNTIME_PROFILE=portable-python312** in that same environment. See
[the portable runtime guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/PORTABLE_RUNTIME.md).
The ordinary Review, Save, Start and Open actions retain the
original project, source, runtime and interpreter selection. The authenticated
startup check opens that same project with Catalogue migration selected. Use
Stop before opening a separate standalone writer. The
[migration operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/MIGRATION_OPERATING.md)
gives the complete setup, field selections, cutover and receiving flow.

The original CKAN data merchant Applications provider opens one existing
merchant configuration and project alias. Use its ordinary Review, Save,
Start, Open and Stop flow with the selected runtime. Its browser and MCP service
share the original project owner.

The connection file declares the project aliases, retained input aliases and
the project's seller store. The original merchant initialization binds that
store to `seller-releases`. The launcher retains the selected source and waits
for its authenticated browser before returning the private URL.

Follow [CKAN in Applications](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/APPLICATIONS.md)
for the actual connection JSON, original host initialization and environment
fields. Use `starforge ckan-agent inspect` to inspect the retained declaration,
then `starforge ckan-agent serve` to open its original owner.

The original CKAN MCP tools cover catalogue/capture, fields, publication,
merchant and buyer operation, whole-workspace transfer and reviewed refresh.
The DCAT tools add same-project catalogue import, exact review and file reads,
cutover and rollback. Declare catalogue inputs as **dcat-catalog** aliases and
optional typed mapping files as **dcat-mappings** aliases. The migration guide's
**Operate through the merchant agent** section gives all eight DCAT tools,
selected hashes, report pagination and complete receiving continuation.
Mutations carry the current `expectedOperationId`. Follow that saved
operation to completion; after interruption, reopen and continue the original
request and item IDs. Retained file reads use the returned file identity,
read handle and next offset.

## Hand over the whole working project

In Workspace, create a complete workspace archive and keep its returned byte
count, SHA-256 and embedded manifest identity. A receiving operator supplies the
complete compressed archive hash and a new private destination:

~~~sh
starforge ckan archive-workspace \
  --project /absolute/private/ckan-project \
  --out /absolute/private/delivery/publisher-workspace.ckanw

starforge ckan inspect-workspace \
  --archive /absolute/private/delivery/publisher-workspace.ckanw \
  --sha256 ORIGINAL_ARCHIVE_SHA256

starforge ckan receive-workspace \
  --archive /absolute/private/delivery/publisher-workspace.ckanw \
  --project /absolute/private/received-project \
  --sha256 ORIGINAL_ARCHIVE_SHA256

starforge ckan serve --project /absolute/private/received-project --port 0
~~~

The receiver preserves original captures, source declarations, semantic reviews,
candidate and snapshot identities, merchant packages, releases, refreshes and
decisions. It records the relocation of mutable locations and installs the
original release handler at the receiving location. The preceding source and
release identities remain in the retained history.

The same archive and destination continue an interrupted receive. A completed
receive returns its saved completion, allowing subsequent work in that project.
The browser and agent transfer paths use this original archive engine.

The [complete receiving guide](RECEIVING.md) gives the full publication-to-refresh
and second-operator programme, artifact contents, independent reopen and
continuation commands.

## Installed interfaces

The source-owned `ckan` contribution exposes `ckan`, `ckan-publisher`,
`ckan-agent` and `dcat`. The selected product also retains the original dataset, merchant,
buyer, runtime and Python commands.

| Package export | Original source |
| --- | --- |
| `./seller/ckan/capture` | Direct complete CKAN capture engine |
| `./seller/ckan/capture/received` | Full retained public-source receiving |
| `./seller/ckan/workspace/model` | Saved project operations and original leases |
| `./seller/ckan/workspace/archive` | Whole-project export, inspection and receiving |
| `./seller/ckan/workspace/refresh` | Reviewed decisions and successor selection |
| `./seller/ckan/refresh` | Complete keyed comparison and change-file reads |
| `./merchant/mcp/ckan-launcher` | Original browser and authenticated merchant host |

Run `starforge registrations --source ckan` in the installed product to inspect
its exact entrypoints, and `starforge source` to retain the selected source
revision with the customer handover.
