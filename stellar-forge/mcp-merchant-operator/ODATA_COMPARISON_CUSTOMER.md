# Remote OData comparison customer workflow

The customer client operates a complete comparison through the existing merchant MCP service: select two retained collections, create the comparison, inspect its original cells and entity keys, save reviews, publish a frozen edition, download every declared source file, and reopen that edition with the native comparison engine. The downloaded source also opens in the existing Analysis application for SQL, reports, workbook delivery and complete workspace transfer.

Run the installed command as `starforge odata-comparison-customer`. From the selected complete source checkout, the equivalent entry is:

```sh
node "$SOURCE/stellar-forge/mcp-merchant-operator/odata-comparison-cli.mjs" --help
```

The JavaScript API is exported as `@tokenjunkielabs/starforge-merchant/operator/odata-comparison-client`. The command is registered by its own `odata-comparison-customer` distribution contribution. It composes the [original comparison tools](ODATA_WORKSPACES.md), [complete native comparison](../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/COLLECTION_COMPARISONS.md), the existing retained-file downloader and the original source receiver.

## Select the original source pair

Use the host's existing HTTPS endpoint or loopback HTTP listener, configured workspace alias and live service ID. The bearer stays in the selected environment variable, `MCP_ACCESS_TOKEN` by default; `--token-env` selects an existing alternative. The merchant host retains its original workspace, service, process and authorization boundaries.

```sh
starforge odata-comparison-customer collections \
  --url "$MERCHANT_MCP_URL" --workspace supplier \
  --service orders --offset 0 --limit 50

starforge odata-comparison-customer list \
  --url "$MERCHANT_MCP_URL" --workspace supplier \
  --service orders --offset 0 --limit 50
```

Continue each returned `page.nextOffset` until it is null. The first command reuses the complete collection customer's listing. An incomplete collection or comparison retains its original selection for continuation; choose completed collection inputs before creating the comparison.

Inspect the two selected collections through their existing customer command:

```sh
starforge odata-collection-customer inspect \
  --url "$MERCHANT_MCP_URL" --workspace supplier \
  --service orders --collection "$BEFORE_COLLECTION" > "$PRIVATE/before.json"

starforge odata-collection-customer inspect \
  --url "$MERCHANT_MCP_URL" --workspace supplier \
  --service orders --collection "$AFTER_COLLECTION" > "$PRIVATE/after.json"
```

Use an owned private directory with `umask 077` for the retained request and result files. The exact source-pair hashes are each inspection's top-level `collectionSha256`. Retain them together with the collection IDs. The collection's analytical source digest, the comparison manifest digest and a published comparison source digest have different purposes:

| Identity | Meaning | Used by |
| --- | --- | --- |
| Collection ID + collectionSha256 | One complete original collection and its selected pages, query and projection | Comparison creation |
| Comparison ID + manifestSha256 | The original comparison computation over the selected pair | Inspection, rows, review and receiving |
| Review revision | The complete current review history version | Publication |
| editionId | The frozen comparison-manifest and review-history pair | Published edition selection |
| Source SHA-256 | The exact published source.json bytes and declared file closure | Source inspection, download and restore |

Save a creation request using the actual IDs and hashes:

```json
{
  "schema": "stellar-forge.odata-comparison-create-request.v1",
  "liveServiceId": "orders",
  "comparisonId": "orders-selected-fields",
  "beforeCollectionId": "orders-complete",
  "afterCollectionId": "orders-country-selection",
  "expectedBeforeSha256": "<before.collectionSha256>",
  "expectedAfterSha256": "<after.collectionSha256>",
  "title": "Orders source and selected-field comparison"
}
```

The bracketed hash values denote the actual preceding inspection results. The selected collection IDs must already exist in this same live service. Optional `fields` chooses distinct original field paths; omitting it lets the native engine select its original union. Optional `limits` uses the existing `maxInputBytes`, `maxOutputBytes` and `maxCells` controls.

```sh
starforge odata-comparison-customer create \
  --url "$MERCHANT_MCP_URL" --workspace supplier \
  --service orders --comparison orders-selected-fields \
  --request "$PRIVATE/create-comparison.json"
```

Keep this comparison ID and exact request after an interrupted reply. The original store reopens the selected comparison and rejects a different pair, title or computation selection under that ID. `--request-sha256` additionally binds the complete private request file. The command returns the actual request path, bytes and SHA-256 with the native result.

## Inspect, understand and review the original rows

```sh
starforge odata-comparison-customer inspect \
  --url "$MERCHANT_MCP_URL" --workspace supplier \
  --service orders --comparison orders-selected-fields \
  --offset 0 --limit 50

starforge odata-comparison-customer rows \
  --url "$MERCHANT_MCP_URL" --workspace supplier \
  --service orders --comparison orders-selected-fields \
  --kind cells --status changed --offset 0 --limit 50
```

Inspection pages the original files, retained files, current reviews and review history independently; follow the relevant `pagination` member's `nextOffset`. Row pages return their own `nextOffset`, `kind`, comparison digest and total. Remote pages accept 1–100 records.

`--kind entities` returns the full joined entity records. `--kind cells` returns changed cells with the original before/after states and lexical values. The optional status is an entity status: `changed`, `unchanged`, `before_only` or `after_only`. It does not select a cell's change classification.

The native engine joins declared entity keys and retains the original values and types. Its distinctions include field selection, missing and null values, type and declaration changes, source spelling, typed equality and actual value changes. Int64 and Decimal values retain exact source spellings. Original Guid and temporal key identity normalization is separate from retained source text.

The completed Northwind customer operation compared 830 original entities on both sides, matched all 830 keys and produced 4,150 changed cells when the full seven-field projection was compared with the OrderID/ShipCountry selection. All 4,150 cells were `selection_changed`. The selected projection explains that result; those cells do not establish changed order values. The [worked customer receiver](../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/examples/COMPARISON_CUSTOMER.md) retains that original source, review, browser, Analysis, report, workbook and restore operation.

### Retain each review request

Reviews support comparison, entity, column and cell scopes. Use the exact returned `entityKey` for an entity/cell review and the original `field` for a column/cell review. Read the current `reviews.revision`, select the analyst's decision and save one original request:

```json
{
  "schema": "stellar-forge.odata-comparison-review-request.v1",
  "liveServiceId": "orders",
  "comparisonId": "orders-selected-fields",
  "requestId": "orders-selected-fields-column-01",
  "expectedRevision": 0,
  "scope": "column",
  "field": "ShipCountry",
  "status": "note",
  "actor": "Customer analyst",
  "note": "Review of the original selected country values."
}
```

Replace the sample revision with the actual inspected value. Select `accepted`, `investigate`, `excluded` or `note` as appropriate to the original review. A comparison review omits both entityKey and field; entity and cell scopes preserve the exact returned key.

```sh
starforge odata-comparison-customer review \
  --url "$MERCHANT_MCP_URL" --workspace supplier \
  --service orders --comparison orders-selected-fields \
  --request "$PRIVATE/review-column-01.json"
```

After an uncertain reply, repeat that exact original request and ID. The native review history checks the retained request before the current revision, so a previously committed review can be recovered even after a later analyst edit. A newly intended edit gets its own request ID and the then-current revision. The client never generates a replacement review ID or silently retries a write.

For a full request already declared in the original host's `comparisonReviews` configuration, use:

```sh
starforge odata-comparison-customer review \
  --url "$MERCHANT_MCP_URL" --workspace supplier \
  --service orders --comparison orders-selected-fields \
  --review-alias reviewed_country_note
```

The host verifies that alias's complete bytes and SHA-256 before invoking the same native review. This is also the existing route for a large original entity key that exceeds the HTTP request envelope. The native key limit remains 2 MiB; the ordinary HTTP client's request and response limits still apply to inline calls and row pages. A supplied original in-process client can consume the same methods without changing their source semantics.

## Publish and select a frozen edition

Inspect the comparison again, then publish the actual current review revision:

```sh
starforge odata-comparison-customer publish \
  --url "$MERCHANT_MCP_URL" --workspace supplier \
  --service orders --comparison orders-selected-fields \
  --revision "$REVIEW_REVISION"
```

Retain the returned `editionId`, `sha256`, `comparisonSha256`, `reviewRevision`, original manifest reference and complete file references. The publication's `sha256` is the exact source.json digest used below. Publishing the same unchanged review returns the same frozen edition. Subsequent review edits leave that edition intact.

If the publication reply was interrupted, inspect the actual retained editions:

```sh
starforge odata-comparison-customer editions \
  --url "$MERCHANT_MCP_URL" --workspace supplier \
  --service orders --comparison orders-selected-fields \
  --offset 0 --limit 50
```

This command filters `editions/<editionId>/source.json` from one page of the original retained-file inventory. Its `pageKind` is `retainedFiles`: **follow page.nextOffset even if that page's editions array is empty**. The offsets count every original retained-file entry. Each returned edition has its original source bytes and digest. Keep the selected edition from this history rather than publishing an unintended later review to replace a lost reply.

Verify the chosen edition and its actual ranged source bytes:

```sh
starforge odata-comparison-customer source \
  --url "$MERCHANT_MCP_URL" --workspace supplier \
  --service orders --comparison orders-selected-fields \
  --edition "$EDITION_ID" --sha256 "$SOURCE_SHA256"
```

The client checks the exact document digest, native edition derivation, comparison and review manifest roles, consecutive original source packets and every declared file reference. It reads source.json through the original retained-file reader, so display serialization cannot alter the selected source bytes.

## Download, resume and receive the complete source

Choose separate private download and receiving directories whose parent already exists:

```sh
starforge odata-comparison-customer fetch \
  --url "$MERCHANT_MCP_URL" --workspace supplier \
  --service orders --comparison orders-selected-fields \
  --edition "$EDITION_ID" --sha256 "$SOURCE_SHA256" \
  --download "$CUSTOMER_ROOT/merchant-edition" \
  --out "$CUSTOMER_ROOT/comparison" --progress true
```

The complete operation selects the exact source, downloads every unique declared payload, verifies and syncs each file, publishes the original source.json last, and invokes native `restoreCollectionComparison`. Receiving validates every packet body and reconstructs both original collections, comparison output and the selected complete review history. Existing compatible longer local review history is preserved.

The download contains source.json, its content-addressed files/ tree and the original download-state/ checkpoint. A complete published source includes the comparison CSV, comparison manifest, frozen review history, transformation source and every packet holding the original collection inputs. Limits remain 1 MiB for source.json, 32 original records, 32 MiB per original record, 128 MiB for the comparison CSV and 256 MiB of unique declared payloads. Native input, row and projection limits still apply.

Repeat the same command, endpoint, workspace/service/comparison, edition, source digest and directories to resume. The original downloader retains its Linux flock lease, verifies durable prefixes, trims only an owned uncheckpointed suffix, and continues the next byte offset. Completed files are verified and reused. Expired file-read handles reopen the same digest. The default chunk size is 196,608 bytes; `--chunk-size` accepts 1–196,608. Progress JSON goes to stderr and the complete result to stdout.

A new edition uses a new download directory. It may be received into the same compatible comparison directory, preserving the already accepted original source and longer review history.

For separate download and later offline receiving:

```sh
starforge odata-comparison-customer download \
  --url "$MERCHANT_MCP_URL" --workspace supplier \
  --service orders --comparison orders-selected-fields \
  --edition "$EDITION_ID" --sha256 "$SOURCE_SHA256" \
  --out "$CUSTOMER_ROOT/merchant-edition"

starforge odata-comparison-customer verify-download \
  --directory "$CUSTOMER_ROOT/merchant-edition" \
  --edition "$EDITION_ID" --sha256 "$SOURCE_SHA256"

starforge odata-comparison-customer receive \
  --download "$CUSTOMER_ROOT/merchant-edition" \
  --out "$CUSTOMER_ROOT/comparison" \
  --edition "$EDITION_ID" --sha256 "$SOURCE_SHA256"

starforge odata-comparison-customer inspect-received \
  --directory "$CUSTOMER_ROOT/comparison" --replay true

starforge odata-comparison-customer received-rows \
  --directory "$CUSTOMER_ROOT/comparison" \
  --kind cells --status changed --offset 0 --limit 100
```

Offline verification checks the original download checkpoint and every payload hash. Receiving and optional replay use the installed original native source; the package's declared engine and collection source must match that reviewed installed implementation. Preserve the selected complete source checkout with the customer edition. Received row pages accept 1–500 rows and return native nextOffset.

A different source, changed saved file or mismatched engine is reported with the original identity intact. Select the intended source/installation and continue the same saved operation. Received source never becomes an instruction to execute arbitrary uploaded code.

## Continue Analysis, reports and workbook delivery

Register **the selected download's source.json** in the existing Analysis database, using its current workspace revision:

```sh
python -m stellar_forge_buyer.analysis_workspace \
  --database "$CUSTOMER_ANALYSIS" --checkout "$SOURCE" \
  response --name orders_comparison --input-kind document \
  --manifest "$CUSTOMER_ROOT/merchant-edition/source.json" \
  --format csv --expected-revision "$CURRENT_REVISION"
```

The original registration returns the actual source name and positive source revision. Bind those values to the original comparison mapping:

```sh
starforge odata-comparison-customer analysis-mapping \
  --directory "$CUSTOMER_ROOT/comparison" \
  --source orders_comparison --revision "$SOURCE_REVISION" \
  --out "$PRIVATE/comparison-mapping.json"
```

The output file contains the native response-preview input, including source/source_revision and all 13 text columns. Existing identical output bytes reopen; a different file remains preserved. The JSON result also retains its exact output path, size and digest.

| Column group | Original meaning |
| --- | --- |
| entity_key, entity_status | Stable joined key and native entity classification |
| field, change | Original field path and precise change classification |
| before_state, after_state | Missing, null, unselected or present source state |
| before_type, after_type | Declared original OData types |
| before_value, after_value | Preserved source lexical values |
| typed_equal | Native typed-equality result |
| before_row, after_row | Original collection row locators |

Use that mapping with the original response preview/import. Continue its returned preview identity, imported version and activation revision into saved SQL, reports, workbook delivery and full workspace archives. Query and report operations select the actual imported table and returned version; each output retains the original selected source.

The received comparison's `analysis` field describes its original initial analytical publication. If another compatible edition or a longer local review history already exists, that path can remain the earlier source. The explicitly downloaded source.json and its selected source digest are the authority for registering **this frozen review edition**. The mapping itself is the native 13-column mapping for either edition.

The [Analysis guide](../mcp-paid-agent/ANALYSIS.md), [workbooks](../mcp-paid-agent/WORKBOOKS.md) and [archives](../mcp-paid-agent/ARCHIVES.md) provide the existing full operations. They retain source registration, query results, report publication, workbook build/download/receiving and archive restore through the same original database.

Local reviews and publication can continue using the native command:

```sh
starforge odata-live comparison-review \
  --directory "$CUSTOMER_ROOT/comparison" --input "$PRIVATE/native-review.json"

starforge odata-live comparison-publish \
  --directory "$CUSTOMER_ROOT/comparison" --revision "$LOCAL_REVIEW_REVISION"
```

Here native-review.json is the original native object `{requestId,expectedRevision,scope,entityKey?,field?,status,actor,note}`. The remote CLI's schema/liveServiceId/comparisonId wrapper belongs only to its remote request file.

## Receive an edition into another original merchant workspace

A configured host can receive a complete source alias or an explicit published edition from another declared original workspace:

```sh
starforge odata-comparison-customer restore-remote \
  --url "$MERCHANT_MCP_URL" --workspace customer \
  --service orders --comparison received-orders \
  --source-workspace supplier --source-service orders \
  --source-comparison orders-selected-fields \
  --source-edition "$EDITION_ID" --sha256 "$SOURCE_SHA256"
```

Both workspaces are existing host selections. The destination service must already represent the compatible original source; the native receiving path validates that service binding before saving. The customer retains its selected target comparison ID on a retry.

For an already declared complete source alias:

```sh
starforge odata-comparison-customer restore-remote \
  --url "$MERCHANT_MCP_URL" --workspace customer \
  --service orders --comparison received-orders \
  --source-document reviewed_orders_edition --sha256 "$SOURCE_SHA256"
```

Use one route per request. The host verifies the source's complete files, original packet bodies and selected manifest; the client verifies the returned selectedSource and restoredFrom identities. The original workspace backup also carries the service, collections, comparisons, every frozen edition and complete review histories. Use the source-owned [workspace transfer workflow](ODATA_WORKSPACES.md) for that complete host move.

## Integrate the JavaScript client

```js
import {
  inspectMerchantODataComparison,
  publishMerchantODataComparison,
  fetchODataComparison,
  receivedODataComparisonAnalysisMapping
} from '@tokenjunkielabs/starforge-merchant/operator/odata-comparison-client';

const selected = {
  url: process.env.MERCHANT_MCP_URL,
  tokenEnv: 'MCP_ACCESS_TOKEN',
  workspace: 'supplier',
  liveServiceId: 'orders',
  comparisonId: 'orders-selected-fields'
};

const current = await inspectMerchantODataComparison(selected);
// Save/recover the analyst's original requests before selecting publication.
const edition = await publishMerchantODataComparison({
  ...selected, expectedRevision: current.reviews.revision
});
// Retain this complete publication result before subsequent work.
const completed = await fetchODataComparison({
  ...selected, editionId: edition.editionId, expectedSha256: edition.sha256,
  directory: '/private/customer/merchant-edition',
  comparisonDirectory: '/private/customer/comparison'
});

// After registration of completed.download.sourceManifest has returned:
const mapping = await receivedODataComparisonAnalysisMapping({
  directory: completed.receiving.comparison.directory,
  source: registeredSource.name,
  sourceRevision: registeredSource.revision
});
```

An existing host can supply `client: {endpoint, call}` instead of url. The client still selects the exact workspace/service/comparison and original methods, and the retained downloader binds that endpoint and frozen edition in its durable scope. The declarations reuse original native comparison, review, row, file and mapping types.

The complete client source lives beside the source-owned MCP implementation. The client uses the same retained file reader, native engine and original workspace records. The native worked result and current integration remain in the [original OData product thread](https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791764617053699).
