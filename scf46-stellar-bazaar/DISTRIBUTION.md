# Search published services in the installed catalog

The merchant distribution carries the Bazaar catalog, its retained query index
and its ranking implementation together. The existing catalog service and Atlas
workspace consume that same source.

The `bazaar-query` registration adds the catalog's package exports and this guide.
The original commands continue to start, search and receive the installed product.

## Locate the installed source

Run:

```sh
starforge registrations --source bazaar-query
starforge registrations --command catalog
starforge registrations --command atlas
```

The source registration lists these package exports:

| Package import | Maintained interface |
| --- | --- |
| `@tokenjunkielabs/starforge-merchant/catalog` | `BazaarCatalog`, catalog entry validation and the original discovery HTTP handler |
| `@tokenjunkielabs/starforge-merchant/catalog/query-index` | `CatalogQueryIndex` for catalog-owned filtering, result caching and ranking |
| `@tokenjunkielabs/starforge-merchant/catalog/ranking` | `rankBazaarEntries`, query analysis and the retained `BazaarRankingIndex` |

Use the existing `catalog/operator` and `catalog/workspace` exports for a durable
operator. The low-level query and ranking indexes belong to their owning catalog;
an embedding application must pass row changes through that owner's normal
replacement and retirement operations. [QUERY_ENGINE.md](QUERY_ENGINE.md)
describes their shared scoring and lifecycle contract.

The installed archive's `manifest.json` identifies the source commit and records
the exact file blobs, lengths and digests. Its `distributionInputs` and
`distributionContributions` include the `bazaar-query` declaration. The source
inventory includes both `src/ranking.mjs` and `src/query-index.mjs`, plus the
operator documentation.

## Open the existing catalog and Atlas

For an existing catalog, retain its original data directory and seller policy.
The normal installed service command is:

```sh
starforge catalog-serve \
  --directory /srv/starforge/catalog \
  --policy /srv/starforge/sellers.json \
  --port 8787
```

Use the actual directory and policy belonging to that installation. The
[operator guide](../stellar/scf-starforge-20261009/sf60-durable-catalog-transaction/OPERATOR.md)
covers startup, signed offer updates, withdrawal and its supported control
transports.

Open Atlas against that service and its original saved workspace:

```sh
starforge atlas \
  --local-upstream http://127.0.0.1:8787 \
  --workspace /private/atlas
```

Use the service's printed address when it selected a different port. Atlas keeps
the catalog observations, selected payment option and prepared customer request
in its own saved workspace.

An already running process keeps its loaded source. Apply a new installed archive
through the original service's normal shutdown and restart procedure, reopening
the same catalog journal and Atlas workspace. The next process rebuilds its
process-local query state from the retained catalog.

## Search the original offered services

The installed operator accepts the same query parameters as the discovery API:

```sh
starforge catalog search \
  --directory /srv/starforge/catalog \
  --query 'query=weather&limit=20'
```

Search describes the work or input the customer needs. Ranking reads the service,
route and declared input metadata retained in each HTTP or MCP discovery entry.
The complete supported schema fields and text limits are documented in
[the query engine guide](QUERY_ENGINE.md).

A new search expression reuses the lexical state of already prepared rows.
A selective search prepares its selected corpus; later searches prepare
additional rows as they need them. Replacing or retiring an offer updates its
owned index state.

| Parameter | Use |
| --- | --- |
| `query` | Required nonempty search text, up to 1,024 characters |
| `type` | Select `http` or `mcp` entries |
| `network`, `scheme`, `asset`, `payTo` | Select an original offered payment option |
| `extensions` | Select an advertised extension |
| `limit` | Page size from 1 through 100 |
| `cursor` | Continue the original search using its returned opaque cursor |

Use network and asset values from the original listing. Payment filters apply
together to an offered option, so terms from different options do not combine
into a new offer.

The HTTP search route is `GET /discovery/search`. Both interfaces return
`resources` and `pagination.cursor`. Retain the original query and every filter
when following that cursor. A changed catalog generation requires a fresh search.

Atlas uses those same resources for selection and buyer preparation. Reopen the
saved original selection to continue a customer request after later catalog
changes. The [Atlas workspace guide](../stellar/scf-starforge-20261009/sf61-bazaar-explorer/WORKSPACE.md)
covers complete export, receiving and interrupted transfer recovery.

## Include the engine in an existing release

The base distribution already includes `scf46-stellar-bazaar/src`. The
source-owned `bazaar-query.json` contribution includes both operating guides and
exports the same original modules. Build the next maintained archive from the
chosen immutable source commit:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/path/to/checkout \
  --ref SELECTED_COMMIT \
  --out /absolute/private/merchant-package \
  --offline
```

For an existing selected product, preserve its original selection and output
state. Add `bazaar-query` to that maintained recipe when the product deliberately
exposes the catalog package exports and these guides. Runtime source already
reached through the original catalog imports remains part of its normal source
closure.

The builder records the selected declaration bytes and complete source inventory.
Receive that archive through the maintained installation workflow, then reopen
the original catalog and Atlas directories using their existing operators.
