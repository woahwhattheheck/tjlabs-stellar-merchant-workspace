# Choose and retain an original discovery catalog

A buyer host can expose several trusted Bazaar catalogs through its existing MCP
endpoint, browser console and typed clients. Each browse or search operation selects
one catalog. Its complete pages, declared request inputs, payment alternatives and
saved purchases keep that original source identity.

This supports services operated through different discovery providers while keeping
each service's existing native route, payment configuration, signer and inbox.
Catalog IDs select operator configuration; the tools never accept a replacement
provider URL from the browsing client.

## Configure the host

The original single-source setting remains supported:

```sh
export BAZAAR_DISCOVERY_URL=https://your-original-catalog.example
starforge mcp-buyer
```

It appears as catalog ID `default`, with label `Configured catalog`. Keep the
existing access token or OAuth configuration, permitted merchant origins, operator
module and saved state directory described in [README.md](README.md).

For several sources, save an operator-owned UTF-8 JSON file with this shape. Replace
the example URLs with the actual original catalog bases used by the services:

```json
{
  "schema": "stellar-forge.bazaar-catalogs.v1",
  "defaultCatalogId": "reports",
  "catalogs": [
    {
      "id": "reports",
      "label": "Research services",
      "url": "https://your-report-catalog.example"
    },
    {
      "id": "operations",
      "label": "Operational data",
      "url": "https://your-operations-catalog.example/marketplace/"
    }
  ]
}
```

Point the existing launcher at that file:

```sh
export BAZAAR_CATALOGS_FILE=/private/commerce/catalogs.json
starforge mcp-buyer
```

The file path must be absolute and its complete encoded size at most 64 KiB. A
configuration has one through sixteen catalogs and an explicit default. IDs use
1–64 lowercase letters, digits or hyphens, starting with a letter or digit. Labels
have 1–80 visible characters. Each catalog has a distinct ID and URL base; a trailing
slash alone does not define a second source. Bases are complete HTTP or HTTPS URLs
without embedded credentials, query parameters or fragments. The original base
path is retained when the broker appends `discovery/resources` or `discovery/search`.

If `BAZAAR_DISCOVERY_URL` is also set, it must match the named default's canonical
URL. Trusted operator modules can instead export `discoveryCatalogs` with this
same schema. Programmatic hosts can pass it to `startMcpWorkspace()` or the broker
constructor. Multiple supplied configurations must agree; startup reports a
configuration error when they differ. Catalog membership is fixed for the lifetime
of the running broker.

Desktop MCP clients use the same configuration through the existing
`client-config.mjs --catalogs /absolute/private/catalogs.json` generator. A
registry operator can supply its saved list through `--operator` with the original
state directory and permitted origins. [STDIO.md](STDIO.md) gives the complete
registration commands and merged-client configuration.

Authentication and per-tool OAuth scopes use the existing host configuration.
`bazaar_catalogs` is a read-only tool and uses the same configured resource scope
unless the operator gives it an explicit entry in the existing tool-scope map.

## Read the configured list and select a source

Call `bazaar_catalogs` with an empty argument object. Its result is the complete
configuration above plus `total`, the number of configured catalogs. The list is
small and unpaginated. It exposes the original source bases and labels available
to this authenticated buyer.

Both discovery tools accept an optional `catalogId`:

```json
{
  "name": "bazaar_resources",
  "arguments": {"catalogId": "reports", "limit": 25, "offset": 0}
}
```

```json
{
  "name": "bazaar_search",
  "arguments": {"catalogId": "operations", "query": "reporting period", "limit": 25}
}
```

Omitting the ID selects the host's configured default for that new operation.
An unknown ID returns `BAZAAR_CATALOG_UNKNOWN`. The ID is a host selector and is
removed before sending the original provider request. The existing resource,
payment and amount filters retain their original semantics.

Every new discovery page records:

| Source field | Meaning |
| --- | --- |
| `catalog.id`, `catalog.url` | Original configured source identity |
| `catalog.label` | Operator's display label at observation time |
| `url` | Exact provider request, including the original filters and pagination |
| `mode`, `request` | Complete normalized browse or search arguments |
| `observedAt` | Time the page was acquired |
| `pageSha256`, `pageBytes` | Digest and size of the complete original provider page |

Returned resource summaries carry `catalogId`. Descriptions add the original
provider `rowIndex` to the same source. The handle binds that catalog to its
original resource and offer. A quote retains this source in SQLite and returns it
as `source` in preview, status and history. Host approval receives the retained
source beside the exact quoted request.

## Continue the same operation

Use the returned `continuation.tool` and complete `continuation.arguments`. A
multi-catalog continuation explicitly retains the selected ID, even when the first
request used the default. Its remaining filters, cursor or offset continue the
original operation. The SDK checks the original catalog ID and URL across pages;
a changed label does not change source identity.

The original `source.request` records what the first call actually supplied. It
can therefore omit `catalogId` while the page's `source.catalog` and continuation
identify the resolved source. The original single-catalog default preserves its
compatible implicit continuation shape. The [discovery guide](DISCOVERY.md)
describes complete coverage counts, partial results and pagination errors.

Each source has its own ranking and coverage. To inspect a different catalog,
start a new browse or search with its ID. Saved handles and quotes continue to
refer to their original source when a user edits the next search's selection.

## Use the console or typed client

The console reads the configured list after connection and shows the selected
catalog's exact URL. Choose a source, enter the task and filters, then run Browse
or Search. Editing the selector changes the next request. Existing results retain
the source and filters last applied; Load more continues those results. Refresh
catalogs reloads the available choices on the same connection.

Inspect, quote review and saved history show the original catalog. The native
request desk also checks that an offer was acquired from the configured service's
original catalog before displaying it as a compatible choice.

The installed discovery client exposes `catalogs()` alongside the existing
browse, search, describe and preview methods:

```js
import { openBazaarDiscoveryClient } from
  '@tokenjunkielabs/starforge-merchant/buyer/mcp/discovery';

const client = await openBazaarDiscoveryClient({url: 'http://127.0.0.1:3210/mcp'});
try {
  const configured = await client.catalogs();
  const catalog = configured.catalogs.find(value => value.id === 'reports');
  if (!catalog) throw new Error('Select an original configured catalog.');
  for await (const page of client.searchPages({
    catalogId: catalog.id, query: 'reporting period', limit: 25
  })) {
    console.log(page.source.catalog, page.page, page.resources);
  }
} finally {
  await client.close();
}
```

The client validates complete page source URLs and continuation arguments. A
native request client exposes the same discovery client through `buyer.discovery`.
For an existing service, read `buyer.forWorkspace(id).workspace()`, find the catalog
whose URL equals that service's `catalogUrl`, then use its ID for discovery. Keep
that scoped native client for prepare, review, execute, recovery and file reads.

## Join existing native services

The [native registry](NATIVE_REGISTRY.md) derives its catalog set from the exact
catalog URLs already saved in the registered native workspace manifests. Several
services may share one catalog; services on different catalogs remain separately
bound. The default workspace determines the default catalog.

Registry descriptions may supply optional `catalogs: [{id,label,url}, ...]` to
name that exact original source set. With no names supplied, one source uses
`default`; several sources receive stable URL-derived IDs. `request-workspace`
and `request-workspaces` expose each service's `catalogUrl`, and the registry adds
its `catalogId` and `catalogLabel`. These are discovery bindings alongside the
original route and payment configuration.

Native preparation verifies the selected complete page against that original
catalog URL. Its durable `preparation.source.catalog` survives later page eviction,
reconnect and restart with the original intent. Changing the browsing catalog
cannot redirect an already prepared request. Existing legacy preparations and
quotes remain readable with their original available source fields. The broker's
existing configuration-change rule still applies: changing the source membership,
default ID or permitted merchant origins requires a new review of an unexecuted
quote. Its earlier source, history and saved result remain available.

Registry membership and original native manifest digests remain immutable. To
configure a changed source or service set, stop the original host and initialize a
new registry directory from the desired existing native workspaces. Their original
inboxes, spending ledgers and saved results continue through the receiving host.

## Run and receive the complete workflow

The installed `starforge mcp-catalog-journey` command reads the selected native
workspace, resolves its original configured catalog, walks every original page,
prepares a matching service after the first page and continues the same intent to
its complete saved response. An explicit `discovery.arguments.catalogId` must
match the selected workspace's catalog. The run retains both the supplied
configuration and the actual resolved source/request.

Use [CATALOG_JOURNEY.md](CATALOG_JOURNEY.md) with the existing running merchant,
original funded native workspace and actual request inputs. Its source/page checks,
phase observations and complete saved output support the installed receiving
workflow through the original operator.
