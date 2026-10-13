# Zarr array workspace and merchant handover

Retain a complete Zarr v2 or v3 store, inspect its original hierarchy and metadata, choose an explicit array region, review every typed result, and publish a chosen scalar projection through the existing merchant dataset publisher.

The source workspace is useful for scientific and engineering arrays whose source coordinates, native data type, fill values and units must survive a handover. The browser, CLI and MCP use the same saved workspace and original operation IDs. Managed Applications starts the same operator; it does not maintain another source database.

The full operator guide is [WORKSPACE.md](WORKSPACE.md). The exact native command schema is [CLI_CONTRACT.json](CLI_CONTRACT.json). Original engine, example provenance, licenses and actual source-stage results are described in [UPSTREAM.md](UPSTREAM.md).

## A complete operating workflow

1. Declare an authorized local directory or complete ZIP on the host. ZIP declarations can bind an exact SHA-256.
2. Import the whole store. The workspace retains original files, ZIP bytes when applicable, complete per-node metadata and source identity.
3. Inspect a native array's dimensions, dtype, chunks, attributes and available units.
4. Save exactly one index or positive-step slice for every source axis. Run that selection through the installed original Zarr decoder.
5. Read the complete retained result through its pages. Each row carries its original coordinate and a typed value.
6. Save an explicit review for the exact result hash. Freeze an accepted review into a scalar dataset source with an explicit String, Number or Boolean representation.
7. Save a dataset plan, extract the reviewed projection, inspect the candidate, review the exact target edition, and publish through the original retained publisher.
8. Prepare the ordinary merchant/customer handover, or export and independently receive the complete private source workspace.

Opening a workspace does not restart an interrupted operation, re-read a provider or publish a dataset. The operator must explicitly resume the retained UUID or choose the appropriate next reviewed action.

## Install the selected product

Use Node 24 and a Linux host with Python 3.12 or later and POSIX file locks. Install the native decoder in a dedicated virtual environment:

```sh
python3 -m venv /private/zarr-python
/private/zarr-python/bin/python -m pip install -r /installed/source/stellar/scf-starforge-20261009/sf30-seller-sdk/zarr/requirements.txt
/private/zarr-python/bin/python -B /installed/source/stellar/scf-starforge-20261009/sf30-seller-sdk/zarr/python/cli.py runtime
```

The returned runtime records the actual installed packages. An incompatible or missing native decoder is a visible error. The application does not silently install packages during an import or read.

Build this product from its reviewed Git commit with the original distribution builder:

```sh
node /checkout/stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /checkout --ref EXACT_REVIEWED_COMMIT \
  --selection zarr-merchant --out /private/zarr-release
```

For an interrupted build, retain the same output, commit and selection and use the original `--resume`. The complete `distribution.json` receipt supplies the actual archive path and SHA-256; do not guess its filename.

Install that original archive using the maintained runtime installer with `--native --feature mcp --operator`, the original exact native peer pins, and one private runtime directory. The installed dispatcher exposes `zarr-source` and `zarr-workspace`. The source tree and manifest remain immutable; private workspace, host configuration and publisher state live outside it. See the full operator guide for the exact managed connection and startup contract.

## Native source CLI

The small Node entry invokes the same Python CLI and preserves its exact JSON input and output:

```sh
node /installed/source/stellar/scf-starforge-20261009/sf30-seller-sdk/zarr/cli.mjs \
  --python /private/zarr-python/bin/python init --directory /private/zarr-workspace
```

The direct Python equivalent is:

```sh
/private/zarr-python/bin/python -B /installed/source/stellar/scf-starforge-20261009/sf30-seller-sdk/zarr/python/cli.py \
  status --directory /private/zarr-workspace
```

Commands are `runtime`, `init`, `status`, `operation`, `result`, `frozen`, `apply`, `export`, `verify-packet` and `receive`. Results are one JSON document on stdout; errors are one JSON document on stderr with a nonzero exit code. No command requires parsing a status sentence.

`init` creates a new workspace or reopens a valid existing one. It does not reset a partial directory or missing database. Mutations arrive through standard input as:

```json
{
  "id": "a-real-retained-uuid",
  "action": "import",
  "expectedRevision": 0,
  "input": {
    "path": "/private/complete-source.zip",
    "kind": "zip",
    "root": "the-original-root.zarr",
    "title": "Reviewed original source",
    "provenance": {
      "original": "The actual original source URL or authorized custody reference"
    },
    "expectedSha256": "the-actual-64-character-lowercase-sha256"
  }
}
```

Replace the illustrative UUID and hash with real values before applying. Keep the exact request before dispatch. The original workspace records its request hash, admitted revision, native state, saved result and completion in one durable lifecycle.

The remaining mutation payloads are:

| Action | Exact selected input |
| --- | --- |
| `selection` | `sourceId`, `array`, `axes`, `title`, optional `maxCells` and `maxNativeBytes` |
| `run` | `selectionId` |
| `review` | `resultId`, `contentSha256`, `decision`, `comment` |
| `freeze` | `resultId`, accepted current `reviewId`, `title`, `valueType` |
| `abandon` | interrupted `operationId`, explicit `reason` |

Review decisions are `accepted`, `needs-changes` or `rejected`. Frozen value types are `text`, `number` or `boolean`. Every action carries its own original UUID and the current expected workspace revision. Replaying an exact completed request returns its original result before reading the external source again.

## Coordinates, values and review

An array selection has one integer index or `{start,stop,step}` object per axis. Stops are exclusive and steps are positive. Integer indexing removes that axis from the result shape; slices retain it. The result records both the selected shape and the original source shape, as well as the exact original indices for each cell.

Native values are retained as typed records. Integer precision, bytes, Unicode, Boolean values, float32/float64 semantics, non-finite floats, negative zero, complex values and structured values remain distinguishable where supported by the original decoder. A displayed value is not silently converted to a publishable number.

A frozen scalar projection has four columns:

| Column | Published type | Meaning |
| --- | --- | --- |
| `row_id` | String | Immutable result content hash plus original ordinal |
| `ordinal` | Number | Recorded C-order result ordinal |
| `source_index` | String | JSON array of exact source coordinates |
| `value` | Chosen String, Number or Boolean | Explicit accepted scalar representation |

Large integers, non-finite values and negative zero require a representation that preserves them. Bytes and other compound native values can be deliberately represented as text. A review and freeze never change the underlying native result.

The private source JSON uses `text` for native text. Its publisher adapter maps that to the original dataset engine's `string` type. Consumers should use the actual types returned by `inspectZarrSource(...).queries.selected.columnTypes`, rather than infer types from display labels.

## Original publisher integration

`openZarrPublisher` delegates to `openSourceDatasetPublisher`. The original publisher owns its SQLite history, plan receipts, extraction IDs, candidate bytes, review receipts, target checks, publication recovery and buyer configuration. There is no independent Zarr version writer.

A publisher is attached to one immutable frozen source ID. A new reviewed frozen source gets its own explicitly selected publisher and target. The operator does not accept an arbitrary tool-supplied source path in place of that selected ID.

New publishers use relative source and target bindings so a complete private handover can preserve their layout. Existing publisher declarations and saved plan bytes remain authoritative. A reopened publisher resolves those bindings within its received layout.

The source adapter verifies the complete frozen JSON, source/result/review hashes, shape, every row ordinal and source coordinate, explicit native-to-dataset type mapping and accepted review. A publication plan retains the exact whole frozen file as both original and runtime source. Source and query hashes bind that plan; only the original publisher writes an edition.

The plan's query is `selected`, its query input is empty, and extraction order must be explicit. Selecting ascending and descending `ordinal` produces two real dataset editions from the same reviewed observation. It does not claim a new source acquisition or changed environmental reading.

A trusted application driver may select a complete-source read limit up to 64 MiB for the original publisher's retained source verification. Zarr uses that limit. The original default remains 256 KiB for unchanged drivers, and request or source JSON cannot change it.

Publication requires the ordinary dataset schema and CSV validity checks. The private typed result can remain complete even when a proposed public projection needs a different explicit type.

## Complete private packets

Export a closed, coherent source workspace under an original export UUID:

```sh
/private/zarr-python/bin/python -B /installed/source/stellar/scf-starforge-20261009/sf30-seller-sdk/zarr/python/cli.py \
  export --directory /private/zarr-workspace --id ORIGINAL_EXPORT_UUID \
  --out /private/Zarr_Source_Workspace.zip
```

An export snapshots the original SQLite while holding the original workspace mutation lock. It retains the complete source directories, original ZIPs, metadata, selections, typed results, reviews, frozen source files and original operation history. The packet includes the five complete Python application files and a usable `START.py`.

After extracting the complete packet into a private directory:

```sh
/private/zarr-python/bin/python -B /private/received-source-packet/START.py \
  --directory /private/new-zarr-workspace
```

The current installed CLI can receive the exact ZIP directly:

```sh
/private/zarr-python/bin/python -B /installed/source/stellar/scf-starforge-20261009/sf30-seller-sdk/zarr/python/cli.py \
  receive --archive /private/Zarr_Source_Workspace.zip \
  --directory /private/new-zarr-workspace
```

The receiver verifies exact members, lengths, hashes, the original SQLite snapshot, included application and native entity/file bindings before publishing the new directory. It retains the original workspace UUID, revision and saved operation identities. It does not decode array chunks or start a server. Repeating the same receive reopens the original receipt and preserves compatible later work at that received destination.

Kernel lock files and active listener connection metadata are recreated locally. A completed export ID reopens its retained original application edition even after a source upgrade, and an exact published archive can recover its missing receipt. An incomplete export remains bound to the original application; finish with that edition or explicitly choose a new export ID for the upgraded source.

The source packet explicitly excludes publisher, dataset, deployment and operator-host stores; those are carried separately in the final whole-product handover. Do not describe a source-only packet as the whole merchant operating archive.

## Recovery and limits

A lost response does not authorize another UUID. Read `operation --id ORIGINAL_UUID` and resume the exact retained request. A completed original action is returned from its journal. An incomplete original action may continue only against its original admitted revision and unchanged input identity. An explicit abandon retains the original request and partial files for review.

File and archive publication is create-only. A matching original prefix or a published file's exact hardlink can be reconciled. Different completed bytes, unrelated partials, unexpected members, symbolic links and changed original source files are preserved and reported rather than overwritten.

| Boundary | Limit |
| --- | ---: |
| Original import bytes, compressed and expanded | 1 GiB |
| Individual original ZIP member | 128 MiB |
| Import files | 100,000 |
| Native hierarchy nodes | 10,000 |
| Selected cells | up to 1,000,000; default 250,000 |
| Native decoded bytes | up to 512 MiB; default 64 MiB |
| Retained result JSON | 32 MiB |
| Exact mutation JSON | 1 MiB |
| One result page | 500 rows |
| Source-workspace packet | 2 GiB and 200,000 declared files |
| Complete frozen source read | 64 MiB |

The complete-source import and explicit selection boundaries are enforced before committing the corresponding result. A directory source has complete before/after inventory checks; these are not a provider snapshot transaction.

## Source layout

- `python/`: original-decoder adapter, durable source workspace and complete private packet.
- `source.mjs`: reviewed frozen source reader and scalar extraction adapter.
- `publisher/`: source-qualified plan adapter and the original publisher binding.
- `workspace/`: one browser/CLI/MCP/Applications operator over that source workspace.
- `receiving/`: complete original input and same-workspace receiving programs.
- `examples/pizzarr/`: complete original interoperable inputs, original generators and license.
- `requirements.txt`, `UPSTREAM.md`: exact selected native runtime and original-source provenance.

The selected distribution includes the existing publisher, dataset refresh, merchant and managed runtime dependencies. The ordinary source build does not claim a native receiving result; the actual saved completion report names the input edition, workspace and completed stages.
