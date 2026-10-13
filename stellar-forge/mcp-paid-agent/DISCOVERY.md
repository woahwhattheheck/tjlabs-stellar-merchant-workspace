# Discover an offered service and prepare its exact request

The buyer workspace connects catalog browsing, ranked search, a seller's declared
inputs and a prepared quote. The browser console, HTTP MCP tools, stdio tools and
typed Node client use the same broker and cached resource observations.

Start the installed workspace with its existing discovery URL or
[trusted catalog list](CATALOGS.md), access token, allowed resource origins and
saved state:

```sh
starforge mcp-buyer
```

The launcher prints the MCP endpoint and `/console/` address. The complete
configuration is in [README.md](README.md#start-the-local-http-workspace).
Use the same state directory and host operator configuration when upgrading.

## Browse or search

| Operation | Use |
| --- | --- |
| `bazaar_catalogs` | Read the complete trusted catalog list and default source. |
| `bazaar_resources` | Browse the advertised catalog using its original offset pagination. |
| `bazaar_search` | Rank resources for a nonempty search expression and follow the source's opaque cursor. |
| `bazaar_describe` | Inspect a returned handle's complete original declaration, input schema and eligible payment alternatives. |
| `bazaar_preview` | Prepare a quote for the selected alternative and the explicit customer input. |

Browsing accepts these arguments:

```json
{
  "type": "http",
  "network": "stellar:testnet",
  "limit": 25,
  "offset": 0
}
```

Search adds the customer's words and uses a cursor for continuation:

```json
{
  "query": "weather forecast",
  "type": "http",
  "network": "stellar:testnet",
  "limit": 25
}
```

Use the actual network and payment values advertised by the services you intend
to buy. These examples show argument syntax; the configured service supplies the
real catalog.

| Argument | Meaning |
| --- | --- |
| `catalogId` | Select an original configured catalog; omission uses the host default for a new operation. |
| `type` | HTTP or MCP resource: `http` or `mcp`. |
| `network`, `scheme`, `asset`, `payTo` | Match those terms together on one original payment alternative. |
| `extensions` | Select an advertised extension using the catalog's native filter. |
| `maxAmount` | Buyer-side ceiling expressed as a nonnegative integer string in the offered asset's atomic units. |
| `limit` | Page size from 1 through 100; default 25. |
| `offset` | Browse position in original source rows, from 0 through 1,000,000. |
| `query` | Search text, nonblank and at most 1,024 characters. |
| `cursor` | Opaque search continuation from the original response. |

The amount filter is applied locally to the same eligible payment alternative
as the other payment filters. It does not convert between assets or combine
terms from different alternatives.

## Continue the same catalog operation

Every successful page includes `resources`, `partialResults`, `pagination`,
`source`, `page` and `continuation`.

The source records the original `catalog: {id,label,url}`, exact request URL,
observation time, mode and normalized arguments. Resource summaries carry
`catalogId`; descriptions and saved quote status retain the same source. The pagination object retains the upstream fields. The normalized
continuation has this form:

```json
{
  "tool": "bazaar_search",
  "arguments": {
    "query": "weather forecast",
    "type": "http",
    "network": "stellar:testnet",
    "limit": 25,
    "cursor": "ORIGINAL_RETURNED_CURSOR"
  }
}
```

Pass the returned tool and complete arguments unchanged to continue. A browse
continuation uses `bazaar_resources` and its next `offset`. Continue even when
a page has no eligible rows but supplies a next step: payment filtering can empty
a page without exhausting the source catalog. A multi-catalog continuation pins
the resolved `catalogId`, including when the initial call omitted it. The SDK
checks that the catalog ID and original URL remain the same across every page.

The page's row counts have one exact relationship:

```text
received = returned + filtered + invalid
```

Returned rows are usable observations meeting the requested filters. Filtered
rows are otherwise usable resources that do not meet those filters. Invalid rows
have an unusable resource, input declaration, offer shape or URL. Pagination
advances over all received source rows.

`continuation: null` means no usable next request was provided for this page.
Inspect `page.continuationError` to distinguish a malformed or stalled
continuation from normal exhaustion. `partialResults` remains the original
upstream flag and remains relevant at the final reported page.

Changing the search or filters starts a new operation. A stale search cursor
requires a fresh search. A handle belongs to this broker's cached observation;
after expiry or eviction, discover the resource again and review its new terms.

## Read the declaration and enter the customer input

Select a returned handle and call `bazaar_describe`. Read its `bazaar`
declaration and `preview.input` description. Its `accepts` array contains
the complete eligible alternatives in the order used by `acceptIndex`.

For the direct HTTP GET/HEAD workflow, explicitly supply the intended path
parameters and query. An exact resource with query fields uses:

```json
{
  "handle": "ORIGINAL_RESOURCE_HANDLE",
  "acceptIndex": 0,
  "input": {
    "query": {
      "symbol": "XLM"
    }
  }
}
```

Keys declared in the seller's query schema are available even when its example
omits them. Supply query values as strings, or arrays of strings where the seller
declares an array. The descriptor explains each parameter's schema type and
encoding. When query serialization is declared, the original seller codec
applies its form/explode rules, including repeated pairs or a comma-separated
array. Otherwise strings stay literal and arrays become repeated query pairs.
Keep string identifiers and exact decimal strings in their declared representation.

Explicit customer values replace that key's existing query pairs; fixed query
parameters for other keys stay in the URL. Required query names are checked
against the final URL, so an existing fixed value counts. The form leaves example
values and defaults for the customer to inspect and choose explicitly. Unsupported
query declarations produce their original structured error.

### Published path parameters

A published URL such as **/inspect/:address** declares a value inside the path.
Its original **bazaar.routeTemplate** and **input.pathParams** declaration supply
the template and field meanings. Read **preview.input.path** alongside the query
description. It reports the original template, advertised parameter names, required
explicit values, already fixed bindings, field descriptions and input limits.

Supply raw string values under **input.path**. The maintained route identity
codec encodes each value once into the advertised segment and preserves the
original origin and fixed route segments. Query inputs continue through the
existing query codec after the concrete path is resolved.

~~~json
{
  "handle": "ORIGINAL_RESOURCE_HANDLE",
  "acceptIndex": 0,
  "input": {
    "path": {
      "address": "CUSTOMER_SELECTED_ADDRESS"
    },
    "query": {}
  }
}
~~~

Use the selected advertisement's actual field names and the intended address.
A resource whose URL already names a concrete address reports it in
**fixedValues**; preserve that binding when supplying inputs. An advertised
placeholder requires its explicit value. A caller supplies values, while the
original advertisement supplies the route template. Unsupported schemas,
unadvertised inputs, missing required values and mismatched templates return the
source's structured **PATH_*** errors.

The prepared quote's **requestUrl** contains the complete concrete URL. Its
original resource and accepted payment terms remain available for review,
execution and recovery.

For a remote MCP resource, provide its declared JSON argument object:

```json
{
  "handle": "ORIGINAL_RESOURCE_HANDLE",
  "acceptIndex": 0,
  "input": {
    "arguments": {
      "recordId": "CUSTOMER_SELECTED_RECORD"
    }
  }
}
```

The original remote MCP adapter retains the tool name, transport, canonical
arguments and schema identity. The body-aware HTTP workflow for POST/PUT/PATCH
continues through [the native buyer workspace](NATIVE_WORKSPACE.md).

Review the prepared quote's exact request URL or MCP invocation, original
resource, full `acceptedTerms`, expiry and quote ID. Continue through the
existing host approval and execution workflow in [CONSOLE.md](CONSOLE.md).
An uncertain execution is recovered using that same quote and its retained
result.

## Use the typed Node client

The installed package exports:

```js
import { openBazaarDiscoveryClient }
  from '@tokenjunkielabs/starforge-merchant/buyer/mcp/discovery';

const discovery = await openBazaarDiscoveryClient({
  url: 'http://127.0.0.1:3210/',
  tokenEnv: 'MCP_ACCESS_TOKEN',
});
try {
  const configured = await discovery.catalogs();
  for await (const page of discovery.searchPages({
    catalogId: configured.defaultCatalogId,
    query: 'weather forecast', type: 'http', network: 'stellar:testnet', limit: 25,
  })) {
    console.log(JSON.stringify({
      source: page.source,
      coverage: page.page,
      partialResults: page.partialResults,
      resources: page.resources,
    }, null, 2));
  }
} finally {
  await discovery.close();
}
```

Use the endpoint printed by your original workspace. The transport reads its
token from the configured environment variable, initializes the maintained MCP
protocol and preserves structured tool errors and recovery metadata.

| Client method | Behavior |
| --- | --- |
| `catalogs()` | Read all configured source IDs, labels and URLs with the default ID. |
| `browse(request)`, `search(request)` | Return one complete discovery page with original source and row coverage. |
| `browsePages(request)`, `searchPages(request)` | Yield complete pages on demand and preserve the original catalog and filters across continuation. |
| `describe(handle)` | Read the original cached declaration and full payment alternatives. |
| `previewHttp({handle, path, query, acceptIndex})` | Bind explicit path values and query fields to the original advertised route. |
| `previewHttpQuery({handle, query, acceptIndex})` | Prepare the explicit HTTP query using the seller's maintained codec. |
| `previewMcpArguments({handle, arguments, acceptIndex})` | Prepare the original remote MCP invocation. |
| `preview({handle, acceptIndex, input})` | Use the shared preview operation directly. |
| `close()` | Abort owned pending calls and wait for their completion. |

For a selected current HTTP handle:

~~~js
const description = await discovery.describe(selectedHandle);
const quote = await discovery.previewHttp({
  handle: description.handle,
  acceptIndex: selectedPaymentIndex,
  path: { address: selectedAddress },
  query: {},
});
console.log(quote.requestUrl);
~~~

The same input is accepted by **preview({handle, input: {path, query}})**.
**previewHttpQuery** retains its existing query-only interface. The client
captures inputs before yielding to the transport, preserving the selected values
if the caller later edits its form or request object.

Each call accepts an optional `{signal, timeoutMs}`. The default timeout is
120 seconds; select 1 through 300,000 milliseconds for this client. Iterators
request another page only when their consumer advances. Breaking iteration
finishes that scan. A server continuation error is raised after the current
page has been yielded; the error retains that page as `error.page`.

For an already connected native client, use
`openBazaarDiscoveryClient({client: originalClient})`. That client supplies a
stable `endpoint` and `call(tool, args, {requestSignal, timeoutMs})` method that
returns the original structured tool data, throws its errors and honors
cancellation. The discovery wrapper captures that binding and closes only its
own calls. The original owner keeps the transport and saved workspace.

## Installed source

```sh
starforge registrations --source buyer-discovery
starforge registrations --command mcp-buyer
```

The source-owned `buyer-discovery` contribution registers the typed client and
this operating guide. The existing `mcp-buyer` and `mcp-stdio` commands load
the shared broker, discovery request handling, descriptor, HTTP query codec and
original route identity/path codec.
The complete archive also includes the browser's corresponding discovery form
and connection handling.

Install the next maintained archive from the chosen source edition and restart
the original buyer process with its same configuration and state directory.
The archive manifest retains the selected source commit, contribution and full
source inventory. Continue original quotes through their history and use newly
observed handles for new request preparation.
