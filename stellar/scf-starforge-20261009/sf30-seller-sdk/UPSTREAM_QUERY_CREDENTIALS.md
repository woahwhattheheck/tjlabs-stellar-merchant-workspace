# Private upstream query credentials

A provider that authenticates a request through a URL query field can use the
original SF30 transport and merchant workspace. The operator supplies an
environment reference in `queryEnv`; buyers supply only the ordinary public
query inputs. The existing seller route, payment gate, upstream deadline,
response validation and settlement path remain the delivery owners.

## Configure the provider binding

[Marketaux documents](https://www.marketaux.com/documentation#authentication)
a required `api_token` GET parameter for its financial news API. A binding for
its documented news endpoint is:

~~~json
{
  "schema": "stellar-forge.seller-upstreams.v1",
  "bindings": {
    "marketNews": {
      "origin": "https://api.marketaux.com",
      "path": "/v1/news/all",
      "method": "GET",
      "query": ["symbols", "search", "language", "limit", "page"],
      "queryEnv": {"api_token": "MARKETAUX_API_TOKEN"},
      "responseMode": "json",
      "timeoutMs": 10000,
      "maxResponseBytes": 1048576,
      "maxInFlight": 8
    }
  }
}
~~~

Connect `marketNews` to the existing seller configuration's GET handler route.
Set the real `MARKETAUX_API_TOKEN` in the receiving host's deployment secret
environment, then use the ordinary `upstream-serve.mjs --config ... --upstreams
...` command. The bindings file contains the variable name. Its value is read
from the host environment.

The normal `--check` and paid launch validate required values before listening.
An unpaid challenge-only launch validates references and defers their values
until an admitted backend attempt. SF82 release staging, inspection and package
review enumerate `MARKETAUX_API_TOKEN` without reading its value. The SF82 binding
review displays `queryEnvironment` alongside the existing `headerEnvironment`.

Each `queryEnv` object permits up to 16 named fields. Values in the JSON object
must be valid environment variable names. Resolved credentials are nonempty,
well-formed strings of at most 8,192 characters, without control characters;
the complete authenticated target must still fit the transport's 8,192-character
URL limit.

## Use the merchant workspace

[OpenAPI's API key security scheme](https://spec.openapis.org/oas/v3.1.1.html#security-scheme-object)
supports `in: "query"`. The existing workspace now understands that declared
scheme in the same security-alternative selector as header API keys and OAuth.

1. Load the provider's original OpenAPI source, select the route and original
   backend server, and select the required security alternative.
2. Under **Backend credentials and response settings**, enter the mapping in
   **Private query → environment variable references**. For a scheme named
   `marketauxKey` that declares `name: "api_token"`, enter
   `{"api_token":"MARKETAUX_API_TOKEN"}`.
3. Keep public request examples and query serialization settings restricted to
   buyer inputs such as `symbols` and `page`. A private credential field in a
   public example is rejected.
4. Validate and save the complete merchant package. Review the backend query
   name and environment reference under **Backend authentication**, and install
   the environment value on the host that launches that package.

A saved plan operation uses the existing schema:

~~~json
{
  "method": "GET",
  "path": "/v1/news/all",
  "amountAtomic": "20000",
  "securityAlternative": 0,
  "queryEnv": {"api_token": "MARKETAUX_API_TOKEN"},
  "requestExample": {"query": {"symbols": "MSFT", "page": 1}}
}
~~~

The amount is an example operator choice and belongs with the merchant's own
payment terms. The compiler retains the original source and emits `queryEnv`
into the runnable `upstreams.json`. It merges original path and operation
parameters, then removes private query fields from the generated public
operation. A path-level credential declaration cannot reappear through OpenAPI
parameter inheritance.

Multiple security schemes in one alternative must each have their own required
credential target. A query key and header key can coexist; two required schemes
cannot independently supply the same query parameter. The original security
declaration controls which alternatives are available.

## Runtime behavior

The original handler prepares public inputs and computes any durable request
identity before resolving query credentials. It then resolves the private
snapshot within the same admitted request lifetime and adds each value with
`URLSearchParams.set`. Credential names cannot overlap either side of the public
`query` mapping. A buyer cannot replace a credential through an alias, repeated
query field or an undeclared input.

Missing or invalid values produce `503 UPSTREAM_CONFIGURATION_UNAVAILABLE`
before a backend dispatch. Request aborts and credential-factory waits share
the original timeout. Operation replays use the existing completed response and
do not resolve a new credential or dispatch another backend call.

The launcher retains its existing environment snapshot for one process
lifetime. Restart it after changing deployment secrets. Programmatic hosts
that supply their own mutable environment or private credential factory can
rotate the value between invocations. For example:

~~~js
import { createUpstreamHandler } from './upstream-handler.mjs';

const marketNews = createUpstreamHandler({
  baseUrl: 'https://api.marketaux.com',
  path: '/v1/news/all',
  query: ['symbols', 'search', 'language', 'limit', 'page'],
  queryCredentials: () => ({
    api_token: process.env.MARKETAUX_API_TOKEN,
  }),
});
~~~

This factory receives only the original `{signal}`, never buyer input. Its
configuration is trusted server code and its returned values stay private.

When the original shared-response cache is enabled, it resolves one immutable
header/query credential snapshot before cache selection. Both snapshots and
the existing OAuth generation participate in a private equality digest.
Changing a query key retires the old cache generation; results and in-flight
work remain with their original source owner. Credential values and the digest
are absent from inspection, counters and buyer responses. Authenticated HTTP
freshness restrictions apply to query-authenticated cache entries.

## Provider response reflections

Some providers copy their authenticated request URL into result metadata. The
native exchange removes exact credential text and conventional URI/form
encodings from response text and JSON string values, using `[redacted]`.
JSON string escapes are decoded for comparison, while untouched JSON tokens,
including large numeric literals, retain their original representation.
Response contracts validate the sanitized bytes before delivery.

Exposed response headers containing the credential are dropped. This also
covers retained failure bodies and the permitted `Retry-After` header.
A reflected value in opaque binary content, or a JSON position that cannot be
sanitized without changing syntax or numeric meaning, produces
`502 UPSTREAM_CREDENTIAL_REFLECTED`.

For SSE and NDJSON, the original source iterator sanitizes complete UTF-8 lines
before yielding bytes. It preserves line endings and handles credentials split
across incoming chunks. The line limit is the existing seller's 1 MiB record
ceiling; total source/output bytes, backpressure, deadlines and cancellation
remain under the original stream owner. No separate stream or response cache
is introduced.

The request sent to the provider carries the credential as required by that
provider's API. Public request URLs, operator snapshots, completion callbacks,
release metadata and durable request hashes retain the public inputs and
environment references. Provider-specific adapters should still project useful
article/data records and merchant pagination metadata for their buyers.

## Source entrypoints

- `upstream-query-credentials.mjs`: reference validation, private resolution and
  response sanitization.
- `upstream.mjs`: declarative compilation, environment-reference discovery and
  the original application composition.
- `upstream-handler.mjs` and `upstream-stream.mjs`: original buffered and finite
  streaming exchanges.
- `response-cache/upstream.mjs`: original cache generation and source lifecycle.
- `../sf61-openapi-seller-import/workspace/`: declared security selection,
  operator form, public request projection and package compilation.
- `../sf82-seller-pilot/release-upstreams.mjs`: immutable release inspection
  showing query environment references.
