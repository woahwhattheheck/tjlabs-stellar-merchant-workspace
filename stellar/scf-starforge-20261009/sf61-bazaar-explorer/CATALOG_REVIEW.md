# Receive a catalog review into the original Atlas request

A catalog review carries a complete saved page, selected original row, payment
alternative and applied search. The grant reader prepares it with the same
catalog identity and ranking modules used by Atlas. Receipt opens the existing
Atlas selection and request editor. Its source, review and prepared request
travel together in the complete workspace export.

## Browser workflow

In the grant page's **Search the catalog** opening, load the retained page, apply
a query and exact filters, then choose **Inspect**. Read the full declaration and
payment alternatives. Name the request, choose **Prepare complete review file**,
then **Download selection**.

In Atlas, expand **Receive a catalog review** and choose that complete JSON file.
Atlas displays the full declaration, selected terms, source digest, query and
original row/option before receiving it. Choose **Receive and open this request**.

Supply the concrete URL, advertised method, headers and original body/ticket input
required by the resource. Review the prepared buyer configuration and use
**Create buyer handoff** when applicable. Approval, signing and payment continue
through the configured buyer. Observation metadata never changes a configured
buyer, signer or service route.

The saved request's **Download original catalog review** action reads and hashes
the complete retained file. Full workspace export and cold receiving retain it
beside its original capture and request revisions.

## Installed CLI

Close the browser process before opening its private single-writer workspace
from the CLI. Replace these illustrative absolute paths with the actual complete
file and private directory on the receiving host.

```sh
starforge atlas-workspace inspect-review \
  --input /data/atlas-catalog-review.json

starforge atlas-workspace receive-review \
  --workspace /private/atlas \
  --input /data/atlas-catalog-review.json

starforge atlas --workspace /private/atlas --port 0
```

Inspection does not open a workspace. Receipt returns the original capture ID and
saved selection ID. It can initialize a new private Atlas workspace under an
existing private parent. Optional `--selection ID` supplies a stable caller-owned
ID; `--name TEXT` names a newly received capture. Repeated receipt preserves
existing capture names and prepared request revisions.

`atlas-workspace review --workspace /private/atlas --selection ACTUAL_ID` returns
the complete retained review text and exact byte/hash identity. If equivalent
JSON formatting has arrived in several files, `retainedFiles` lists every
original file SHA. Use `--sha256 ACTUAL_FILE_SHA` to read that complete copy.
Formatting changes retain the same canonical selection identity.

The original `selection`, `prepare`, `handoff`, `export`, `inspect` and
`receive --resume` commands continue the same store.
[CAPTURE_SEARCH.md](CAPTURE_SEARCH.md) documents those existing commands.

## Typed application API

The pure installed export is
`@tokenjunkielabs/starforge-merchant/catalog/atlas/review`.
It works in maintained Node and, through declared browser routes, a secure browser
context. It uses Web Crypto SHA-256, UTF-8 and the original query modules.

```js
import { readFile } from 'node:fs/promises';
import { openCatalogReviewPage, inspectCatalogReview } from
  '@tokenjunkielabs/starforge-merchant/catalog/atlas/review';
import { openAtlasWorkspace } from
  '@tokenjunkielabs/starforge-merchant/catalog/atlas/search';

const page = await openCatalogReviewPage({
  pageText: await readFile(originalPagePath, 'utf8'),
  sourceUrl: originalSourceUrl,
  capturedAt: originalAcquisitionTime,
  expectedSha256: originalPageSha256
});
const result = page.search({
  query: 'topic',
  filters: { type: 'http', network: 'stellar:testnet' },
  pageSize: 10
});
const selected = await page.createSelection({
  row: reviewedResult.row,
  acceptIndex: reviewedOriginalAcceptIndex,
  query: result.request.query,
  filters: result.request.filters,
  label: reviewedRequestName
});
const inspected = await inspectCatalogReview(selected.text);

const workspace = await openAtlasWorkspace({
  directory: privateDirectory, create: true
});
try {
  const received = await workspace.receiveCatalogReview({
    reviewText: inspected.text, selectionId: stableSelectionId
  });
  const original = await workspace.catalogReview({
    selectionId: received.selection.id, sha256: inspected.sha256
  });
  retainCompleteFile(original.text, original.sha256);
} finally {
  await workspace.close();
}
```

Application variables come from the original source and operator's selection.
`createSelection` requires that row to occur in the applied query and all payment
filters to match its one original accepted option. Original row and option
indexes remain distinct even when resources share a service identity.

`page.search` returns full original listings for the selected result page,
matching accepts indexes, ranks, coverage and next page number. An empty query
browses original source order, including unindexed rows. Page size defaults to 50
and is limited to 200. Nonempty queries use the unchanged bounded schema ranking.

`sourceUrl` and `capturedAt` are optional retained observation metadata.
`expectedSha256`, when supplied, must match the original complete bytes. Neither
the pure API nor native receipt fetches that source URL.

## Complete source and selection identity

The `stellar-forge.sf61.catalog-review.v1` JSON retains:

| Field | Meaning |
| --- | --- |
| `source.pageText` | Complete original UTF-8 page, all rows and original envelope. |
| `source.pageSha256`, `bytes`, `rows` | Recomputed complete-page identity and actual row count. |
| `source.pageFile` | Original single-page import name, `page-000000.json`. |
| `source.sourceUrl`, `capturedAt` | Optional original observation metadata. |
| `selection.row`, `acceptIndex`, `catalogKey` | Original row and accepted alternative, plus the maintained service key when indexable. |
| `search.query`, `filters` | Normalized applied search containing the selected row and option. |
| `label` | Reviewed request name. |
| `packetId` | SHA-256 of the canonical complete source, selection, search and label. |

Inspection checks exact fields, UTF-8 bytes, page SHA, row count, original option,
query membership and canonical packet identity. Limits are 1 MiB per original
page, 8 MiB per complete review and 20,000 rows. Nested JSON encoding can make the
review larger than the page. The browser checks the complete selected file before
sending it through the original local HTTP size boundary.

The input is one complete provider page. Coverage retains received rows, reported
total, offset and original partial-results flag. A page with 20 of 28 reported
rows remains partial. Query exhaustion does not change source coverage. Use
Atlas's original complete capture workflow for several native pages.

Receipt uses the original `receivePage` implementation. Reviews live under that
capture's `reviews` directory, selected by packet ID and exact file SHA. The
original selection adds its review origin; preparation and handoff continue using
the complete original page/row/payment binding. Existing private files, mutation
queue, revision guards and transfer format own the lifecycle.

## Existing full receiving journey

`atlas-search-journey` accepts an optional `reviewFile`. It receives that review,
runs every original query, prepares the selected request, creates its handoff,
exports the workspace and reopens it in a receiving directory. It checks the
complete original review bytes alongside the reopened request, query and export.

```json
{
  "workspace": "/private/existing-atlas",
  "reviewFile": "/data/atlas-catalog-review.json",
  "queriesFile": "/data/original-catalog-comparison.json",
  "pageSize": 10,
  "selectionId": "catalog-review-native-001",
  "request": {
    "intentId": "catalog-review-native-intent-001",
    "url": "https://merchant.example/original-resource?parameter=reviewed-value",
    "method": "GET",
    "headers": {}
  },
  "outputDirectory": "/private/new-review-journey"
}
```

Replace the illustrative request with the actual original operation. The existing
workspace must be closed, the selection ID unused and the output directory new.
The review supplies `selected`, `query`, `filters` and `label`; explicit values
must agree. An explicit `captureId` must identify the same original received page.
Optional body/ticket files and `handoff: false` keep their original behavior.

Use the product's genuine 33-query comparison for its corresponding 27-row page.
The complete expected key order remains the same original input. The new native
execution records its own results in `journey.json`; the retained historical
comparison keeps its separate identity.
