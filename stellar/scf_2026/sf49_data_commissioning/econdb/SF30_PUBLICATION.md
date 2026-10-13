# Econdb publication through the original SF30 dataset and buyer interfaces

Operation: ECONDB-MARITIME-PERIOD-WORKSHARE-BBBD-20261013.

The Econdb adapter owns acquisition, source editions, original period labels, units, missing-value interpretation and comparisons. Its reviewed output becomes one original SF30 typed CSV dataset. It does not implement another payment server or buyer.

## Source pin and original modules

Repository: woahwhattheheck/tjlabs-stellar-merchant-workspace.
Reviewed pin: 3cc516d47cb5ca2a692ee1bc750905cfaab4e2e9.
SDK root: stellar/scf-starforge-20261009/sf30-seller-sdk/.

- dataset-handler.mjs — 8da9ef8bddbc560aabe1a74f59c258e29f18d5a9
- dataset-cli.mjs — 95ed4f2db87385e6d8d8fd0d83f5ac566d93519b
- native-factory.mjs — 52041aaab2413bc4e54250642cbb5b21476a8f64
- dataset-refresh/versions.mjs — fe4261675844ca6e2ab89ad59fdc14fff9f1f8e3
- dataset-refresh/service.mjs — d6373662efe5548c05a2585848b5aada1cc1785f
- dataset-refresh/cli.mjs — 969b84347550854244bbff49f63ddb8236e7c80c

Keep the actual installed SDK dependency tree together. These identities identify the reviewed interfaces; they are not permission to replace newer owner source.

## Exact adapter output

Produce observations.csv, dataset.json, and an Econdb-specific release manifest in the same immutable source edition. dataset.json follows the existing strict schema:

```json
{
  "schema": "stellar-forge.csv-dataset.v1",
  "file": "observations.csv",
  "name": "The reviewed dataset name",
  "columns": {
    "period_label": "string",
    "exact_value": {"type": "string", "nullable": true},
    "value_status": "string"
  },
  "filters": ["period_label", "value_status"],
  "ranges": [],
  "sorts": ["period_label"],
  "nullEncoding": "unquoted-empty",
  "defaultLimit": 50,
  "maxLimit": 250
}
```

The three names above illustrate physical declarations; the final adapter must declare its actual retained columns. Do not infer absent units, frequency, timezone, vessel identities or period boundaries. Keep exact decimals and identifiers as strings. Do not expose decimal string range filters as numeric comparisons: the original string-range contract is UTF-16 lexical ordering. A separately normalized period key needs its explicit source derivation in the release manifest.

With nullEncoding=unquoted-empty, an unquoted empty CSV cell is null and quoted "" is the original empty string. A status column preserves absent, suppressed, missing or other source states where the provider distinguishes them. Never silently turn these states into numeric zero.

The current loader accepts at most 64 exposed columns and only string/integer/number/boolean types. Original limits default to 64 MiB CSV, 250,000 rows, 65,536 characters per cell and 250 rows per response. Keep the configured actual limits explicit. No truncation is an acceptable release.

The original compiler has 32 query-parameter slots. Count 3 + equality-filter-count + 4 * range-field-count + (any-sort ? 1 : 0), plus one if the optional version snapshot selector is exposed. Each of filters/ranges/sorts is independently capped at eight fields.

Do not set the optional semantics field to a fabricated Econdb schema or mislabel it as CKAN/SDMX/OData. The current semantic-document allowlist is provider-specific. Keep Econdb meanings in its own retained manifest and explicit columns.

## Compile with the original functions

From a module beside the SDK dataset handler:

```js
import {loadDatasetConfig} from './dataset-handler.mjs';
import {buildDatasetSellerConfig} from './dataset-cli.mjs';

const dataset = await loadDatasetConfig(datasetConfigPath);
const description = dataset.describe();
const seller = await buildDatasetSellerConfig(dataset, {
  payment: existingPublicPaymentTerms,
  origin: existingCanonicalHttpsOrigin,
  path: existingDatasetPath
});
```

description contains the original typed dataset snapshot and query capabilities. seller is the original stellar-forge.seller-service.v1 document using queryDataset/admitDataset. The compiler performs the native offer/payment-required validation. Retain the exact output and source/config hashes with the Econdb release manifest.

Payment accepts only existing public scheme/network/asset/amount/payTo/maxTimeoutSeconds terms. Do not invent a payee, price, network, facilitator or purchase. Public origin must be a canonical HTTPS origin and the dataset route a fixed non-/_seller path.

The original examples/dataset-application.mjs exports the loader's handle/admit functions and reads SF30_DATASET_CONFIG. Original serve.mjs with the original configured facilitator composes the native seller; absent a facilitator, its challenge-only result is not a paid delivery.

## Retain multiple period editions without cursor breakage

Use the existing dataset-refresh store. Its original init/configure/serve CLI and openDatasetVersions/startVersionedDatasetSeller functions retain immutable CSV generations, original cursor binding, resource admission and payment behavior.

```js
import {openDatasetVersions} from './dataset-refresh/versions.mjs';
import {startVersionedDatasetSeller} from './dataset-refresh/service.mjs';

const versions = await openDatasetVersions({
  directory: existingPrivateStateDirectory,
  initialConfig: firstDatasetConfigPath,
  retentionMs: existingRetentionMs,
  maxVersions: existingVersionLimit,
  maxRetainedBytes: existingStorageLimit,
  maxCachedVersions: existingCacheLimit,
  maxResidentRows: existingRowLimit
});
const service = await startVersionedDatasetSeller({
  versions, config: originalSellerConfig, port: selectedPort,
  nativeFactory: originalNativeFactory
});
// service.close() closes control, seller and store in order.
```

Use init only for the original new store. Reopen the existing directory without inventing initial state. For a running store, use its private datasetControl interface; do not create a second writer. A reviewed refresh supplies configPath, expectedSnapshot AND expectedRevision. Activate likewise supplies the retained snapshot and exact current pair. The revision protects against A→B→A. Contract-changing columns/types/query settings require their own reviewed route, not a hidden in-place schema change.

Original admitted pages remain pinned while verification/response finish. An expired retained snapshot returns 410 before payment. Cache capacity returns 429 before payment; original reader pins are not evicted to accommodate a new generation. Preserve the current policy and actual state on resumption.

## Original buyer-to-customer handover

SF88 queue-dataset.mjs exports exportQueueDataset({root,intents,destination}). root is the existing private buyer Inbox; intents is the explicit ordered list of existing completed purchase intent IDs. It requires each original execution/terminal outcome and responseFile.status=SAVED, verifies original path/hash/length, and checks exact cursor/query/endpoint continuity.

The exporter copies exact original pages and their existing evidence into a create-only destination, then composes SF100. It does not request/sign/settle another payment. Each page's purchase remains its original separate authorized intent. Do not manufacture an intent, receipt or paid status from a local preview.

SF100 deliver.mjs provides init, appendMany, scan and finalize. A complete result requires the exact same snapshot/query/schema and terminal nextCursor=null with received count=total. It produces typed JSONL, spreadsheet-safe CSV, manifest and offline review; the immutable original page bytes remain retained.

local-dataset-receiving is specifically the existing Frictionless publisher/DuckDB-customer receiving seam. It is not a generic Econdb publisher and explicitly is not a signed purchase. Do not route Econdb through invented Frictionless identifiers.

## Receiving and presentation

The same original Econdb operation must receive its populated source, inspect original typed previews, publish its retained edition, use the original buyer path only when an actual purchase is authorized, reopen the complete export, and inspect its real report/browser output. Before calling it ready, open the exact outgoing version, view its rendered screens and operate source/period selection, comparison, downloads and reopening at relevant desktop/mobile widths. Source inspection and an HTTP result do not establish rendered readiness.

This document describes reviewed source interfaces. No Econdb seller launch, native settlement, purchase, browser receiving or customer-ready claim has been made by this integration inspection.


## Native Econdb binding

sf30-publication.mjs lives beside maritime-analysis.mjs at stellar/scf_2026/sf49_data_commissioning/econdb/. It consumes --source (exact original response JSON) and --descriptor, calls original readSnapshot/selectPeriod freshly, and creates dataset.csv, dataset.json, source.json, source-descriptor.json and release.json. The final release manifest is the completion marker. A complete matching release can be reopened; a different or interrupted directory is never overwritten.

Create the output's parent as a private 0700 canonical directory before running build. Source and output files remain private. The Econdb field mapping is: edition_id, locode, endpoint, flow, measure, population, date, series, status, exact_value, source_lexeme, source_row, source_sha256, captured_at, source_role, original_url, frequency. Unknown LOCODE/flow remains null, including documentation examples. Source row numbers remain the zero-based original source.data positions. No date/series row is deduplicated. Unsupported original values remain in the retained source JSON, with status unsupported_value and no invented decimal.

The module's build command accepts:
```sh
node sf30-publication.mjs build --source retained-response.json --descriptor retained-descriptor.json --from 2023-01-01 --until 2024-01-01 --name 'Reviewed maritime observations' --out /private/econdb/period-edition
node sf30-publication.mjs inspect --publication /private/econdb/period-edition
```
Use the actual source selection dates, not these illustrative dates. Defaults cap original response at 64 MiB, output at 250,000 rows/64 MiB CSV and retained metadata at 16 MiB. The retained engine has its own source expansion limits. No clipped source is accepted.

merchant-init claims a NEW private original version-store directory. It never reopens or collects an existing store; use the original status/serve/refresh operations for it. merchant-configure compiles only existing public payment terms to a create-only seller config. merchant-refresh requires both actual expected snapshot and positive revision. The original-version-cli subcommand delegates unchanged arguments to the maintained dataset-refresh CLI, including serve/status/activate/collect and optional snapshot selection.

buyer-export requires --publication, --root (the existing buyer inbox), --selection (the original private ordered intent list) and --out (a new customer export). Original SF88 performs all page/evidence/cursor checks and SF100 finalizes the original complete export. Only after the returned snapshot matches the selected Econdb publication does this wrapper write econdb-publication.json beside it, retaining the exact source manifest and original outcome references. It never changes buyer outcomes or declares a payment successful. If that additional binding fails, the already completed original export remains intact. Empty physical datasets can share one original SF30 snapshot; the explicit Econdb publication_id/source binding distinguishes their retained source editions. The customer result may be a filtered/projected query; its returned count is not silently equated to the full publication row count.

The receiver must use the exact selected analysis source when reopening a release: the stored engine hash is checked against the loaded source. Updating the analysis module does not rewrite an earlier release. Keep its source cohort in the normal complete application backup.

No browser or native receiving was performed while composing this binding. The original Econdb receiver owns the single actual programme, rendering and payment configuration.

The publication dataset.csv is exact machine interchange for the original typed loader. It does not prepend spreadsheet formula-escaping characters to source strings. The original SF100 customer export supplies the separately spreadsheet-safe CSV while retaining exact typed JSONL and original pages.

## Interrupted completed buyer export

The original SF88 exporter is create-only. The wrapper therefore checks the original destination first: when delivery.json already exists, it does not replay export. bindBuyerReturn verifies the same original inbox identity string and ordered intent selection, every copied source/operation/evidence file, the native completion manifest, each SF100 page archive through original scan(), terminal row count/cursor, projected query and all declared CSV/JSONL/review output hashes. It then finishes only econdb-publication.json using the original SF100 atomic create-or-identical helper. A differing existing binding fails without replacement; an identical completed binding reopens. An incomplete original destination is refused and retained, never silently restarted.

This reconciliation needs the original canonical inbox identity in --root, but does not require reading or modifying that inbox. The copied original export supplies the retained operation/page evidence. No new purchase, response download or raw provider acquisition occurs. Full original raw Econdb responses are not copied into a filtered buyer delivery; the selected original buyer pages and release metadata define its boundary.

Runtime: the maintained SF30 README declares Node.js22+; recorded native x402 receiving used Node24.19.0. Optional native packages are @x402/core@2.28.0, @x402/stellar@2.28.0 and @x402/extensions@2.28.0. Reuse the original installed runtime and facilitator. Compiler and challenge-only service need no npm dependencies.
