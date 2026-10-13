# Search a retained catalog and continue its original request

Atlas searches the catalog pages already saved in its private workspace. The search
uses the same `CatalogQueryIndex` and schema-aware ranking as the maintained Bazaar
catalog. A result keeps its exact capture, original page, row and offered payment
indexes through selection, native request preparation and complete workspace receiving.

## Open and search

Start the original Atlas browser with the existing private directory:

```sh
starforge atlas --workspace /private/atlas
```

Open a saved catalog under **Saved workspace**. **Apply search** ranks service names,
tags, resource and tool descriptions, URLs and declared HTTP or MCP input fields.
The HTTP schema walk includes the seller's emitted query, path, body and header
containers. The maintained engine keeps its existing bounded local-reference and
composed-schema traversal and lexical/fuzzy scoring.

Use the separate type, network, scheme, asset, recipient and extension fields for
exact filters. Payment filters must describe one original accepted option together.
A testnet network from one option and a mainnet asset from another do not make a
matching offer. All original options remain visible; selection is enabled only for
an option matching the applied filters and the original native buyer's supported
HTTP/Stellar terms.

A nonempty query orders results by relevance. **Show all rows** returns source-page
and original-row order, including rows whose incomplete catalog metadata cannot
participate in ranked search. Each result shows its rank separately from its
original page and zero-based row. Its payment indexes retain the original
`accepts` order. Structural service keys never collapse repeated source observations.

The displayed applied query is independent of text being edited. Previous/next
continue the last applied query, filters, page size and retained source snapshot.
If an in-progress capture receives another page, apply the search again to include
that new source set. **Download this result page** retains the current response,
its coverage, original listings and complete continuation arguments.

## Understand source coverage

Receiving completeness and provider coverage are separate fields:

| Field | Meaning |
| --- | --- |
| `captureComplete` | Every page named by the saved capture is received and the original core has finished receiving it. |
| `receivedRows / expectedRows` | Original rows present compared with rows named by that saved manifest. |
| `reportedTotal` | A consistent total actually declared by the retained provider pages, when available. |
| `allReportedRowsPresent` | True only when the received pages cover a contiguous range from zero through that declared total and the final page does not advertise more results. False denotes partial coverage; null means the provider has not supplied a usable total. |
| `totalChanged` | The retained pages disagree on the provider total. |
| `unindexedRows` | Original source rows retained for browsing whose catalog declarations do not satisfy the existing search projection. |

For example, a completed one-page import with 20 rows from a provider reporting 28
rows is a complete saved import with partial provider coverage. Reaching the last
search-result page exhausts matches in that retained source; it does not acquire
missing provider pages. Paged observations preserve their original timing and
remain observations rather than an atomic provider snapshot.

Search is read-only. The source files, original capture/request identity, chosen
payment terms and buyer authority continue to belong to their existing owners.

## Continue a selected request

Choose one matching original option, save its selection and prepare the explicit
request in the existing editor. The URL retains the original origin and fixed path
values; declared path placeholders can be resolved into the reviewed concrete URL.
Choose the advertised method, query, headers, output destination and body/ticket
inputs required by that operation.

The original SF88 preparation checks the complete saved page and exact local row
and option. Request revisions retain their original source bytes and explicit
inputs. **Create buyer handoff** uses the maintained handoff builder; the existing
buyer owns approval, signing, payment and result receiving. Downloadable assets
continue through their original file-delivery preparation, including the required
output destination and advertised file checks.

The [workspace guide](WORKSPACE.md) covers original handoff, assets, export and
cold receiving. Reopening the complete transfer preserves selections and revisions.
Any receiving-host path changes produce the original core's reopened representation,
with the archived original preparation still retained.

## Use the same workflow from the CLI

Close the Atlas browser process before opening its private single-writer store
from the CLI. These commands operate the same native workspace:

```sh
starforge atlas-workspace summary --workspace /private/atlas

starforge atlas-workspace receive-page \
  --workspace /private/atlas --input /data/original-provider-page.json \
  --name "Reviewed provider capture"

starforge atlas-workspace receive-capture \
  --workspace /private/atlas --input /data/original-native-capture \
  --name "Original complete capture"

starforge atlas-workspace search \
  --workspace /private/atlas --capture CAPTURE_ID \
  --query "request parameter" --type http --network stellar:testnet \
  --scheme exact --page-size 25
```

Use the actual capture ID returned by receipt or summary. `receive-capture`
requires the original `session.json`, `manifest.json` and named native page files.
Repeated receipt reuses identical original bytes and continues missing pages.

Add `--all` to stream every matching response as NDJSON. Each line contains its
original listings, coverage and source-bound continuation. For manual pagination,
pass the returned `snapshotId` to `--snapshot` along with the same query, filters
and next page. A changed source set returns `ATLAS_SEARCH_SNAPSHOT_CHANGED`.

Select using indexes from that result:

```sh
starforge atlas-workspace select \
  --workspace /private/atlas --capture CAPTURE_ID \
  --page-file page-000000.json --row ORIGINAL_ROW --accept ORIGINAL_OPTION \
  --label "Reviewed customer request" --selection request-review-001

starforge atlas-workspace prepare \
  --workspace /private/atlas --selection request-review-001 --revision 0 \
  --request /private/request.json

starforge atlas-workspace handoff \
  --workspace /private/atlas --selection request-review-001 --revision 1
```

Replace the row, option and revision with the actual returned values. The request
file is a JSON object containing `intentId`, `url`, `method` and `headers`, with
optional `responseOut` and `ticketHeader`. It describes the concrete intended
operation. Use `--body /absolute/file` or `--ticket /absolute/file` for exact UTF-8
inputs. Omission keeps the current saved input; `--remove-body` or
`--remove-ticket` removes it explicitly. An empty body file is a present zero-byte
body. Every accepted change goes through the original revision guard.

`atlas-workspace export`, `inspect`, and `receive --resume` retain their original
complete transfer behavior.

## Typed installed API

The typed `@tokenjunkielabs/starforge-merchant/catalog/atlas/search` export opens
the same workspace as the original `catalog/atlas/workspace` export:

```js
import { openAtlasWorkspace } from
  '@tokenjunkielabs/starforge-merchant/catalog/atlas/search';

const workspace = await openAtlasWorkspace({
  directory: '/private/atlas',
  create: false
});
try {
  for await (const page of workspace.capturePages({
    captureId: selectedCaptureId,
    query: 'mode',
    filters: { type: 'http', network: 'stellar:testnet' },
    pageSize: 25
  })) {
    consumeOriginalRows(page.offers, page.coverage);
  }
} finally {
  await workspace.close();
}
```

`capture(input)` returns one response. `capturePages(input)` snapshots each complete
continuation before yielding, so caller edits cannot rewrite the source, query or
filters of the ongoing walk. Every result has `snapshotId`, `sourcePages`,
`coverage`, `search`, `offers`, `pagination` and `continuation`. The final
continuation is explicitly null. Partial provider coverage remains visible on that
final page.

The same object exposes `saveSelection`, `selection`, `prepareSelection`,
`createHandoff`, the original receipt methods and `snapshotFiles`.
The caller owns `close()`. The full declaration is [workspace.d.mts](workspace.d.mts).

## Operate the original-source search and receiving journey

`starforge atlas-search-journey --config /private/atlas-journey.json` runs a complete
saved-source workflow. It searches every query in an original query file, finds
an explicitly selected page/row/option, creates a new saved request through the
original preparation and handoff, exports the whole workspace, receives it into a
new directory, then reopens the same request and search. Existing selections keep
their original revisions.

The configuration has this shape; replace every illustrative selection and request
with the existing reviewed source and intended native operation:

```json
{
  "workspace": "/private/atlas",
  "captureId": "ACTUAL_CAPTURE_ID",
  "queriesFile": "/private/original-catalog-comparison.json",
  "query": "ACTUAL_RETAINED_QUERY",
  "filters": { "type": "http", "network": "stellar:testnet" },
  "pageSize": 10,
  "selected": { "pageFile": "page-000000.json", "row": 0, "accept": 0 },
  "selectionId": "atlas-reviewed-request-001",
  "label": "Reviewed retained request",
  "request": {
    "intentId": "atlas-reviewed-intent-001",
    "url": "https://merchant.example/declared-resource?parameter=reviewed-value",
    "method": "GET",
    "headers": {}
  },
  "handoff": true,
  "outputDirectory": "/private/new-atlas-journey"
}
```

Optional `bodyFile` and `ticketFile` are absolute input paths.
For the existing asset workflow, set `handoff: false` and supply the required
original `request.responseOut`; the prepared native file request travels in the
complete workspace.

The output directory and saved selection ID must be new. It contains
`search-pages.ndjson`, the complete `workspace.ndjson`, a received workspace,
its second complete export and `journey.json`. Query timing includes the actual
source/read/paging work. CPU values are original process measurements; RSS and
heap are samples after each query, not peak memory. A failed phase leaves the
original request and completed artifacts available and records its actual error.

The maintained public source package already contains the genuine October 12
27-row Vellar capture and complete 33-query comparison:

- `stellar-forge/developer-site/dist/grant-data/catalog-source-vellar-20261012.json`
- `stellar-forge/developer-site/dist/grant-data/catalog-parameter-evaluation-20261012.json`

Receive the first file as its complete original single page, then use the second
as `queriesFile`. Its capture SHA-256 is
`7d088b72500e47da56170296de80aad2321bc5f707d8e074755d9059f4e4eebf`.
When that exact source is selected, the journey compares every query's complete
ordered service keys to the retained accepted results. With another genuine
capture it records that capture's own results and coverage. Original native
capture folders can be used without flattening or replacing their page files.

The historical comparison has 33 queries and 31 scored query/resource pairs.
The original found-count result (22 to 31) and top-three result (19 to 29) belong to
those 31 pairs. A new Atlas journey records its own execution and receiving results.

## Storage and installed source

The per-capture search index is disposable process memory. Atlas checks private
file identity, size and modification state between cached queries, hashes complete
pages on index construction and rereads the original page when returning or
selecting a row. A new page or changed source metadata rebuilds the source view.
Four small capture indexes can share a cache bounded by 64 MiB of original page
bytes and 20,000 rows; larger captures still search their complete received set
with a temporary index. The host supplies the working memory for that full corpus.

No index or query cache enters the original transfer. Rebuilding it on a receiving
host uses the retained complete source and the installed maintained ranker. The
Atlas contribution registers this guide, typed API and journey in the existing
Starforge package, preserving the existing Atlas and buyer commands.
