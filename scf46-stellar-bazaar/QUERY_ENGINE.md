# Native catalog query engine

`BazaarCatalog` serves repeated list pages and search cursors from an in-process,
revision-invalidated query index. The existing catalog, HTTP discovery, pricing and
Atlas callers use the same catalog class and authoritative records.

## Searchable request metadata

Search reads the request schemas that sellers publish. HTTP request examples describe
sample values; the companion Bazaar schema carries the parameter descriptions.

| Transport | Source in a catalog row | Searchable content |
| --- | --- | --- |
| HTTP | `extensions.bazaar.schema.properties.input.properties.queryParams` | Query parameter names, descriptions and titles, including nested fields |
| HTTP | `extensions.bazaar.schema.properties.input.properties.body` | Body field names, descriptions and titles, including nested fields |
| HTTP | The same input schema's `pathParams` and `headers` groups, when declared | Schema field names and annotations |
| MCP | `extensions.bazaar.info.input.inputSchema` | Tool argument names, descriptions and titles, including nested fields |

The seller discovery compiler emits HTTP `querySchema` and `bodySchema` at the first
two paths. MCP uses its actual tool input schema. Both one-shot
`rankBazaarEntries` and the catalog-owned lexical index share this extraction and
the same scoring function.

The traversal follows object properties, array items and tuple items, `allOf`,
`anyOf`, `oneOf`, and schemas for additional or patterned object values. Local
JSON-pointer references resolve within their original schema document, including
referenced HTTP input containers. Unreferenced definitions do not add terms.
Example/default values, output schemas and response payloads stay outside the
parameter text. References require no network access.

Traversal is breadth first so shallow parameter fields precede deeper fields. Each
schema walk queues at most 128 nodes, limits schema depth to 16 and considers at
most 32 children per property map or composition/tuple list. Locating HTTP parameter
groups has its own 128-node, depth-16 bound. Local pointers have at most 32 segments,
and repeated schema objects are visited once per walk context. All parameter groups
share one 2,048-character, 128-token field.

The original field weights remain:

| Field | Weight |
| --- | ---: |
| Service name | 9 |
| MCP tool name | 8 |
| Tags | 7 |
| Input description | 4 |
| Resource description | 4 |
| Request parameter metadata | 2 |
| Resource URL | 0.6 |

Parameter metadata contributes exact normalized terms. Typo matching and phrase
bonuses use the original five name, tag and description fields. Expanded request
metadata can change matches and scores; the scoring formula, field weights and
canonical tie breaks stay consistent between the one-shot and indexed APIs.

## Repeated queries and catalog changes

Unfiltered listing builds canonical key order once. Repeated offsets and limits
reuse it. Replacing a value retains its key position; retirement and reinsertion
follow the authoritative Map's insertion order.

Filtered reads begin with the smallest typed posting for transport, extension and
payment fields. Each candidate must satisfy all payment filters within one accepted
payment option. Network and recipient fields from separate options cannot combine
into an offer.

The first nonempty search prepares only its selected rows. Later queries reuse
tokenized fields and exact-term postings, preparing newly selected rows as needed.
Typo lookup uses first-character and length buckets with the existing one-or-two-edit
limits. Corpus statistics include every filtered row, including rows without a query
match. Complete-result caching then serves further limits and cursors for that query.

Insert, replace and retirement operations invalidate cached results. A prepared
replacement updates only its own term postings and field lengths; retirement removes
its unused terms and buckets. A row that has never been searched adds no lexical work
to insertion. A staged catalog clone owns a fresh Map and fresh query state.

Public reads clone returned pages. The HTTP JSON and pagination envelopes retain
their existing `no-store` header, error handling and stale-cursor rejection.
The index operates within the current catalog revision.

Caches share an LRU limit of 64 results and 200,000 row references. Oversize results
are computed without retention. Query keys include the exact filters and query text.
Cached values reference already-owned rows; field tokens and postings retain only
prepared current rows. Discarding a catalog instance releases its query state.

## Inspect an existing instance

```js
console.log(catalog.queryStats);
```

The detached numeric snapshot includes list/search hits and misses, index/order
builds, candidate checks, ranking runs, evictions, invalidations and retained
result/reference counts. Lexical counters include prepared rows, queried corpus
rows, scored candidates, term lookups and fuzzy comparisons. Current sizes include
retained documents, tokens, unique terms and posting references.

Counters belong to the catalog instance and restart for a new instance or staged
clone. Diagnostics contain aggregate numbers, and the HTTP surface remains unchanged.

## Accepted source measurements

The indexed scoring implementation comes from
[the merged catalog optimization](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2432).
Its recorded source run used Node v24.19.0, a complete 27-row public testnet catalog
and nine existing query probes. Across 24 ranked results, the original scorer, the
refactored one-shot scorer and the indexed scorer returned identical canonical IDs,
floating-point scores and ordering before this request-metadata expansion.

The recorded performance comparison used 60 alternating nine-query batches with
the outer result cache bypassed:

| Recorded measure | Original ranking | Indexed ranking |
| --- | ---: | ---: |
| Median batch | 3.725175 ms | 0.392129 ms |
| 95th percentile batch | 10.056082 ms | 0.971889 ms |
| CPU across measured batches | 303.394 ms | 30.590 ms |

These are warmed lexical-index measurements for that 27-row corpus. The request
schema coverage described above is an additional source change; those earlier
measurements apply to the imported optimization. Relevance assessment depends on
the catalog metadata and the queries people use.

See [distribution and operation](DISTRIBUTION.md) for the existing package entry
points and serving workflow.
