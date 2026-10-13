# ALFRED historical source editions

This route retains a requested historical snapshot from the official ALFRED graph CSV download. It uses the existing FRED selection, capture store, analyst review, briefing, merchant publication and portable project workflows. The source mode is **ALFRED_VINTAGE** and observation time basis is **ALFRED_VINTAGE_DATE**.

## Acquire and resume an original selection

Save a selection such as:

~~~json
{
  "series": ["DFF"],
  "asOf": "2026-10-12",
  "start": "2025-01-01",
  "end": "2025-12-31",
  "pageSize": 1000,
  "maxRows": 1000000
}
~~~

~~~sh
starforge fred alfred acquire --directory /private/alfred-dff-20261012 --selection /private/dff-selection.json
starforge fred alfred status --directory /private/alfred-dff-20261012
~~~

The original request uses https://alfred.stlouisfed.org/graph/alfredgraph.csv with id, vintage_date, cosd and coed. The returned series/vintage column must identify the same series and date. A requested URL alone cannot create a historical observation.

The source directory retains every completed HTTP response, public response headers, retrieval time, byte digest, current request and progress. It acquires selected series in their original normalized order. Repeating the command continues that directory. A response already saved before an interrupted progress update is reused. SIGINT and SIGTERM preserve completed work. HTTP errors retain their original bodies and attempts; a returned Retry-After sets the earliest continuation time.

Each CSV retains its complete original text. Selected rows preserve their exact numeric string or original blank/dot missing marker. Observation dates outside the chosen interval stay in the source and are excluded from the selected model. No interpolation, resampling or implied row-level real-time interval is added. The row realtime_start and realtime_end fields remain empty because a vintage-labelled graph CSV does not return those intervals.

## Import an original received file

For a one-series selection, use the original file and its actual retrieval timestamp:

~~~sh
starforge fred alfred import --directory /private/alfred-received \
  --selection /private/dff-selection.json --csv /received/DFF.csv \
  --received-at 2026-10-13T01:00:00.000Z
starforge fred alfred inspect --input /private/alfred-received/capture.json
~~~

The timestamp above illustrates the option format; supply the received file's actual source timestamp. A file import has kind:file and retains no invented HTTP status or response headers. For a complete intake from another session, import --records ORIGINAL_RECORDS_JSON accepts the exact original request/response/metadata record array.

## Historical metadata

The official [ALFRED download guide](https://alfred.stlouisfed.org/help/downloaddata) describes **Observations by Vintage Date — All Observations** and its ZIP README. The README carries title, source, release, units, frequency, seasonal adjustment and notes by real-time period, plus selected vintage dates. Revised-only output omits unchanged values. Initial-release output describes different availability dates across observations.

An original CSV without a metadata companion has metadataCoverage:UNAVAILABLE. Its title, units, frequency and adjustment are empty, and its original values remain available. A DDP comparison retains raw differences and explicitly requires meaning review. A series identifier never supplies inferred units, frequency or title.

A metadata-edition file binds each field to exact character ranges in the complete retained original metadata text. The edition names the original series and selected vintage. Each field includes its original real-time start/end ranges. The chosen interval must be ordered; coverage is computed separately for the requested vintage. A field outside that interval remains in the retained edition, with its original value and bounds, and is omitted from the selected meaning. No latest-edition fallback extends an expired interval.

The typed FredAlfredMetadataEdition contract contains:

- source: complete original text, URL, actual retrieval timestamp, UTF-8 byte length and SHA256; HTTP versus received-file provenance.
- series and selectedVintage: exact source spans with start, end and value.
- fields: title, units, frequency and seasonalAdjustment; optional publisher, release and notes.
- Each field: text, realtimeStart and realtimeEnd, all exact original source spans.

Adopting metadata produces a new immutable capture:

~~~sh
starforge fred alfred metadata --input /private/alfred-received/capture.json \
  --metadata /received/dff-metadata-editions.json --directory /private/alfred-enriched
~~~

The original capture remains available with its original identity. Numerical observations and CSV bytes remain unchanged in the enriched edition.

## Existing project and whole-package migration

Use the existing project revision and a stable operation ID:

~~~sh
starforge fred alfred adopt --project /private/economic-project \
  --id import-alfred-dff-20261012 --expected-revision 4 \
  --input /private/alfred-enriched/capture.json
~~~

The resulting capture ID is its original SHA256. Existing review, briefing, comparison, merchant publication, project export and fresh receiving use that same source. API_VINTAGE and PUBLIC_TABLE capture identities retain their original formulas.

For a saved whole-package DDP migration, acquire its original batches through ALFRED:

~~~sh
starforge fred alfred migrate --project /private/economic-project \
  --id alfred-h15-2025 --expected-revision 5 --migration fred-ddp-migration-plan-SHA \
  --metadata /received/h15-metadata-editions.json
~~~

Use the actual saved migration ID and revision. Metadata is optional; its absence remains explicit throughout the receiving. The operation stages its immutable metadata before the original project transaction and binds its digest with the source mode. A resumed operation recovers that same staged source, even when a browser continuation omits the original metadata file. Each original batch remains bound to the migration's exact normalized selection.

The full result retains original captures, complete comparison, saved HTML/CSV/JSON and the existing portable v5/v6 project graph. The original API route retains its default request and fingerprint. Separate historical source editions may share a reviewed migration plan while keeping their own immutable receiving IDs and operation histories.

## Browser acquisition and recovery

Open the existing economic workspace, choose **DDP migration**, and open the complete saved migration. Its original observation interval, selected vintage and reviewed mappings remain the acquisition inputs.

1. In **Historical observation source**, choose **ALFRED original vintage download**.
2. If an original historical metadata-edition JSON file is available, select it and choose **Review selected metadata**. The browser uses the same pure metadata reader as the native source engine, checks the original source bytes and exact spans, and displays coverage for every planned series. It shows each required field's original real-time interval and leaves unavailable fields empty.
3. Expand **Inspect complete original metadata text** to read the retained source for each supplied series. The source URL, actual retrieval time, byte count and SHA256 stay visible beside the complete text.
4. Choose **Acquire the reviewed ALFRED vintage**. The workspace acquires every original migration batch, retains the original response attempts and captures, and opens the saved receiving. The existing HTML, CSV, JSON, observation review, release-watch and portable-project actions use this receiving.

Choosing **Use observations without metadata** clears the selected companion. Original CSV observations can still be acquired; their meaning coverage stays unavailable until an original historical edition is adopted. The browser never derives meaning from a series name or a current source page.

The browser retains the operation ID, original project revision, migration, source mode and metadata digest before sending. The full selected File uses the existing browser upload store; session storage contains only the compact file identity. If the connection or page is interrupted, choose **Continue** in the original recovery panel. Once metadata reached the project, native recovery uses its staged original source. If it did not reach the project and the browser cannot restore the File, re-select the named original metadata file and continue the same action. Both its complete file SHA256 and sorted metadata-edition identity must match. The source selection cannot be changed while this action is retained.

An HTTP Retry-After remains part of the original source attempt. The recovery panel displays the retained retry time when available. Continuing before that time preserves the same pending acquisition. An already completed action reopens its saved result. Saved receiving choices identify their ALFRED or FRED API historical source, and the result context retains that distinction.

The workspace serves the original pure source model and metadata reader through explicit local module routes. The installed distribution includes the browser module and guide with the existing economic application.

## Source contracts

Typed package exports:

- ./seller/fred/alfred/model: source/schema constants, exact request construction, CSV and metadata interpretation.
- ./seller/fred/alfred/source: seal, validate, acquire, inspect, store, read and adopt historical metadata.
- ./seller/fred/alfred/cli: native command dispatcher.

A capture's hash covers exactly {schema,selection,source}. Every retained CSV and metadata body is also checked against its original SHA256. A selected historical column must bind the actual returned series and vintage. Core API and current-publication source meanings remain distinct throughout the project.

Primary references: [ALFRED download formats](https://alfred.stlouisfed.org/help/downloaddata), [official DFF download form](https://alfred.stlouisfed.org/series/downloaddata?seid=DFF), [FRED real-time periods](https://fred.stlouisfed.org/docs/api/fred/realtime_period.html), and [original API observation selection](https://fred.stlouisfed.org/docs/api/fred/series_observations.html).
