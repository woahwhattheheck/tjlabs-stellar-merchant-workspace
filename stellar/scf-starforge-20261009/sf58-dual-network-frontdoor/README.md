# Dual-network native Stellar facilitator gateway

Run one private native facilitator for `stellar:testnet` and one for
`stellar:pubnet`, then use this gateway to route payment requests and catalog
discovery to the matching backend. Each original `@x402/stellar` SDK instance
owns its configured network, RPC and signing accounts.

The [native catalog operating guide](../native-facilitator/CATALOG.md) covers
merchant authority configuration, successful settlement cataloging, journal
ownership, persistent receipt identity, discovery and restart.

## Start the installed gateway

```sh
SF58_TESTNET_ORIGIN=http://127.0.0.1:5101 \
SF58_PUBNET_ORIGIN=http://127.0.0.1:5102 \
SF58_UPSTREAM_TIMEOUT_MS=120000 \
starforge stellar-facilitator-gateway
```

From this source checkout, replace the command with:

```sh
node stellar/scf-starforge-20261009/sf58-dual-network-frontdoor/server.mjs
```

The gateway uses Node 22+ and built-in modules. The native backend's SDK and
schema dependencies are installed following its own README.

| Environment variable | Meaning | Default |
| --- | --- | --- |
| `SF58_TESTNET_ORIGIN` | Original testnet facilitator origin | Required |
| `SF58_PUBNET_ORIGIN` | Original pubnet facilitator origin | Required |
| `SF58_TESTNET_BEARER` | Existing testnet backend bearer | Omitted |
| `SF58_PUBNET_BEARER` | Existing pubnet backend bearer | Omitted |
| `SF58_ACCESS_TOKEN` | Gateway's incoming bearer token | Omitted for local bind |
| `SF58_LISTEN_ADDRESS` | Listening address | `127.0.0.1` |
| `SF58_PORT` | Listening port | `8788` |
| `SF58_BODY_TIMEOUT_MS` | Absolute inbound JSON body deadline | `8000` |
| `SF58_UPSTREAM_TIMEOUT_MS` | Upstream response deadline | `12000` |

A non-local bind requires `SF58_ACCESS_TOKEN`. Set the upstream and reverse
proxy deadlines for the native SDK settlement plus its durable catalog commit.
The inbound body deadline remains separate.

Backend origins are HTTPS, with HTTP permitted for explicitly configured local
loopback services. Each is an origin without credentials, path or query.
The gateway attaches only the corresponding configured backend bearer.

## Native payment requests

`POST /verify` and `POST /settle` accept the standard x402 v2 JSON envelope
containing `paymentPayload` and `paymentRequirements`. The accepted network
and requirements network must agree on one supported Stellar network, and the
two scheme values must agree.

The gateway forwards the original request bytes to that backend. It checks the
JSON response's network when present and returns the original response bytes
and HTTP status. The original SDK performs authorization verification, replay
handling, signing and settlement.

The default body cap is 1 MiB, upstream response cap is 2 MiB and concurrency
cap is 32. The module API accepts explicit limits, deadlines and a fetch
implementation for a host integration.

## Catalog extension outcomes

Successful native settlements can publish their metadata through the original
SF25, SF54 and SF60 composition. The gateway preserves the selected trusted
backend's valid `EXTENSION-RESPONSES` header alongside the payment response.
The encoded header is consumed by the resource server. A malformed optional
header is dropped without changing the upstream payment result.

## Original catalog discovery

`GET /discovery/resources` and `GET /discovery/search` require exactly one
explicit network query parameter. The entire query goes to that backend's
original catalog, preserving filtering, ranking, pagination and search cursors.

```sh
curl --fail-with-body \
  'http://127.0.0.1:8788/discovery/resources?network=stellar:testnet&limit=20'

curl --fail-with-body \
  'http://127.0.0.1:8788/discovery/search?network=stellar:pubnet&q=weather'
```

Supply the configured incoming bearer for authenticated gateways:

```sh
curl --fail-with-body -H "Authorization: Bearer $SF58_ACCESS_TOKEN" \
  'http://127.0.0.1:8788/discovery/search?network=stellar:testnet&q=weather'
```

Follow returned cursors on the same network and with the original query.
Catalog changes can invalidate a search cursor; restart that query when the
original API reports a stale cursor. Discovery GETs accept no body and use the
gateway's existing authentication, capacity and deadline controls.

## Supported networks and operations

`GET /supported` reads both original backends. Each must advertise its
configured network and v2 schemes. Signer addresses retain the SDK's original
`stellar:*` family key. Extensions are the intersection of both declarations,
so a global Bazaar declaration requires both backends to support it.

`GET /healthz` reports local configuration. `GET /readyz` performs the same
live two-backend supported read and returns 200 when both responses are valid,
or 503 when a backend cannot supply its supported capabilities. Configure
readiness frequency for the actual service traffic and provider limits.

The installed module export
`@tokenjunkielabs/starforge-merchant/facilitator/frontdoor` exposes
`makeFrontdoor()`, `combineSupported()`, `originOnly()` and `NETWORKS`
from this original source. The operator guide links the matching native
facilitator commands and catalog recovery interfaces.
