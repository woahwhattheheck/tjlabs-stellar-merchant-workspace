# Saved data blending

Combine retained CSV inputs with explicit join rules. Keep the original files,
review immutable result editions, deliver selected columns as CSV and SQLite,
and move the complete editable workspace to another operator.

The browser, command line and merchant tools use one disk-backed Python engine.
The SQLite seller continuation opens the existing merchant query workbench with
an output-only database; it does not replace the seller or payment implementation.

## Start a workspace

Use Python 3.10 or later with SQLite 3.39 or later. Node entrypoints require
Node 22 or later. The core has no third-party Python packages. From a checkout:

```sh
ROOT=stellar/scf-starforge-20261009/sf30-seller-sdk/data-blends
node "$ROOT/cli.mjs" init --directory /private/allocation --name "Order allocation"
node "$ROOT/cli.mjs" serve --directory /private/allocation --port 0
```

The parent directory must exist; initialization creates a new private directory.
Open the private URL printed by the command. Its fragment is the local session
credential: keep it private. The listener binds only to `127.0.0.1`.
Use `--python /absolute/path/to/python` or `STARFORGE_PYTHON` for a selected
Python installation. Stop the command normally with Ctrl+C; the saved workspace
remains available for the next launch.

The maintained distribution registers `starforge data-blend`, the
`data-blends` source selection, and **Saved data blending** in Applications.
Select an initialized or independently received workspace in Applications. The
original runtime owns review, launch, stop and recovery; the provider binds its
startup to that exact workspace and checks the original listener.

## Operate the browser

**Inputs.** Import each original CSV, name it, select the delimiter, and optionally
choose an explicit null marker. A recorded source reference is private metadata.
Imports retain the complete original bytes and their digest. Preview and page
through the saved records. A newer file is a new input, not an overwrite.

**Join recipe.** Choose the base input and a source alias. Add ordered inner,
left or full joins. Each join can match several key pairs, including columns from
earlier joined sources. Choose whether empty-string keys may match and whether
the joined key must be unique. Select the output columns and their names. Save
the recipe, then run its saved version. A revised recipe creates a new version;
previous versions and their result editions remain available.

**Editions and review.** Open the resulting dataset, inspect the complete row
count and duplicate-key diagnostics, and page through selected values with their
original source record numbers. Save an accepted, needs-work or archived review.
Reviews are append-only, with a revision check to avoid overwriting a concurrent
review. The current review is shown in the browser; full review history stays in
the private workspace database and backup.

**Delivery and restore.** Create a customer ZIP, CSV or SQLite file and receive the
complete download. A customer ZIP contains exactly `data.csv`, `data.sqlite`,
`schema.json`, `READING.md` and `manifest.json`. A private workspace backup is a
separate operation. Receive that backup into a new named directory, open the
received project and continue editing it. Existing destinations are never replaced.

Pending operations appear above the work area. Resume uses the original saved
input and operation ID. Dismiss ends that pending operation without deleting its
retained input. Use a new operation ID for a changed input or deliberate new run.

## Join and value semantics

All imported fields remain text. There is no automatic trimming, case folding,
numeric conversion, key inference, fuzzy matching or deduplication. Leading zeros,
large integer identifiers, Unicode, quoted delimiters and embedded line breaks
are preserved. Duplicate CSV headers are rejected rather than silently renamed.

An inner join keeps matching combinations; a left join also keeps unmatched rows
on its left; a full join also retains unmatched rows from the new source. Joins
execute in the saved order. Every duplicate-key combination is retained by default.
An explicit `many-to-one` choice checks the complete eligible joined key for
uniqueness and reports duplicate groups. Switch to `many-to-many` to retain them,
or deliberately select a corrected source.

Composite keys require every selected pair to match. SQL NULL never matches.
Empty strings are ordinary values, but join keys containing an empty string do
not match unless that join explicitly selects `emptyKeys: "match"`. An import's
optional `nullToken` converts exactly that literal to SQL NULL in its source
projection; the original CSV is unchanged.

Result order is deterministic by original source record numbers. Result editions
include a private `origins` table and the saved recipe/source identities.
`missingSourceRows` counts result rows without that source, not distinct missing
source records. `extraMatchingRows` describes extra eligible rows in duplicate
joined-key groups, not the total multiplication of the final join.

Customer SQLite contains only the selected `data` table. CSV uses the explicit
null marker in `schema.json`; an empty field is an empty string. A literal value
that equals the selected marker causes an export error. Select another marker or
use SQLite rather than merge two distinct values. Formula-like strings are not
rewritten: import untrusted CSV as text instead of directly executing it in a
spreadsheet.

A recipe supports up to eight source aliases, sixteen pairs per join and 128
output columns. CSV inputs support 128 columns and fields up to 2 MiB. Browser
uploads are limited to 12 MiB; use the CLI/client for larger original files. Row
previews return complete cells within an 8 MiB control page; continue the returned
cursor. An individual record exceeding that page is available in the complete
CSV/SQLite export rather than silently shortened. Downloads stream full files.
Execution, source indexes and result tables are disk-backed; many-to-many joins
can still require substantial disk space proportional to their actual output.

## Native client

```js
import {randomUUID} from 'node:crypto';
import {BlendClient} from './client.mjs';

const client = new BlendClient({directory: '/private/allocation'});
try {
  const orders = await client.importCSV('/private/input/orders.csv', 'Orders', {
    request: randomUUID(), sourceReference: 'October order export'
  });
  const customers = await client.importCSV('/private/input/customers.csv', 'Customers');
  const recipe = await client.saveRecipe({
    name: 'Orders with customer names',
    base: {source: orders.id, as: 'orders'},
    joins: [{source: customers.id, as: 'customers', kind: 'left',
      on: [{leftAlias: 'orders', leftColumn: 'customer_id', rightColumn: 'customer_id'}],
      emptyKeys: 'unmatched', cardinality: 'many-to-many'}],
    columns: [
      {source: 'orders', column: 'order_id', name: 'order_id'},
      {source: 'customers', column: 'name', name: 'customer_name'}
    ]
  });
  const operation = randomUUID(); // Retain this before requesting the run.
  const edition = await client.run(recipe.id, recipe.version, {request: operation});
  const delivery = await client.export(edition.id, {kind: 'customer'});
  await client.copyExport(delivery.id, '/private/delivery/allocation.zip');
} finally {
  await client.close();
}
```

`BlendClient` retains one Python process. `copyExport` streams the complete file,
verifies its digest and publishes to a new destination. Reads expose `next` or
`nextOffset`; continue to the terminal page. `client.d.mts` contains the typed
source, recipe, result, review and export interfaces.

The CLI exposes the same actions with JSON input:

```sh
printf '%s' '{"offset":0,"limit":100}' |
  node "$ROOT/cli.mjs" invoke --directory /private/allocation state
node "$ROOT/cli.mjs" invoke --directory /private/allocation recipe.save --input recipe-input.json
```

A saved operation can be inspected with `operation` and continued with `resume`,
both receiving `{"request":"the-original-UUID"}`. The engine writes its original
input before execution. A killed unpublished run restarts from those immutable
inputs under the same ID. A completed run returns its original edition. Never
change the input under an existing operation ID.

## Continue in the existing SQLite seller

```sh
node "$ROOT/cli.mjs" seller \
  --directory /private/allocation --edition RESULT_EDITION_UUID \
  --workspace /private/allocation-query --port 0
```

This prepares a stable output-only SQLite file and opens the original query
workbench. Choose the exact queries, parameter types, route, amount, network,
asset and recipient there; use its original preview, save and release export.
Reopening the same edition and query workspace reuses the same SQLite binding.
`createBlendSellerRelease` in `seller.mjs` provides the same original draft and
release compiler to native callers. No private source table or provenance table
is included in the seller database. Actual payment setup and settlement continue
through the existing seller/facilitator workflow.

## Merchant tools and complete file receiving

The source-owned provider contributes eleven tools under `merchant_blends_`.
The original merchant server owns authentication and provider lifecycle. Supply a
private `dataBlendsConnection` file using its maintained provider configuration:

```json
{
  "schema": "stellar-forge.data-blends-connections.v1",
  "workspaces": {
    "allocation": {
      "directory": "/private/allocation",
      "receiveRoot": "/private/received",
      "inputs": {
        "orders": {
          "path": "/private/input/orders.csv",
          "sha256": "REPLACE_WITH_THE_COMPLETE_FILE_SHA256"
        }
      }
    }
  }
}
```

Make the configuration readable only by its owner (`chmod 600`). Configured paths
resolve relative to that configuration file. Imports require a configured input
alias and its exact expected digest; remote tools cannot choose arbitrary file
paths. Private backup receiving likewise consumes a configured file into a new
named directory beneath the configured receiving root.

`merchant_blends_export` and `merchant_blends_backup` return the complete file's
request ID, byte length and digest. Call `merchant_blends_file_read` with that ID
and expected SHA-256, then follow `nextOffset` until null. Decode and concatenate
every base64 block and compare the final length and digest before consuming it.
The provider retains the original file handle across reads and rejects changed
file metadata. Shutdown drains active operations and closes its clients/files.

## Backup, transfer and reopen

A private backup contains original CSVs, immutable source tables, all recipe
versions, all completed editions, source-row provenance and review history. It
contains private data and is not the customer delivery. Treat its transport and
storage accordingly; the archive is not encrypted by this component.

```sh
node "$ROOT/cli.mjs" receive --file /private/transfer/workspace.zip \
  --directory /private/received/allocation --sha256 COMPLETE_ARCHIVE_SHA256
node "$ROOT/cli.mjs" serve --directory /private/received/allocation --port 0
```

Receiving checks the exact manifest, file lengths and digests, SQLite integrity,
source row counts and result bindings before create-only publication. It preserves
the logical workspace identity but binds the new local directory independently.
Generated export/backup files are not recursively copied; create them again in
the received workspace. Original imports, recipe saves, runs and reviews retain
their saved operation history.

## Run the complete example

`examples/operate.py` creates constructed order/customer/region inputs, runs the
original engine, writes the complete customer package and private backup, and
reopens an independently editable copy. It writes only to a new selected folder.

```sh
python3 "$ROOT/examples/operate.py" --directory /private/blending-example
python3 "$ROOT/examples/operate.py" --directory /private/blending-capacity --orders 1000000
```

The larger option is an opt-in generated workload, not a provider capture. Its
customer duplicates deliberately exercise full multiplicity. The printed summary
gives the actual inputs, output, elapsed times and receiving paths for that run.

Protocol references: Python's `csv` module documentation and SQLite's `SELECT`
reference define the underlying CSV and join operations. The maintained
`distribution/CONTRIBUTIONS.md` and
`distribution/runtime-workspace/APPLICATION_PROVIDERS.md` describe the original
source-owned installation and Applications interfaces used here.
