# OpenAQ station studies

OpenAQ Studies turns a selected station and period into a retained, attributed customer study: original source responses, exact observations, a named review, comparative reports, a published dataset and complete portable delivery.

One browser workflow, CLI, typed merchant provider and saved Applications entry compose the existing Frictionless publisher, dataset versions, SF82 releases, SF100 local receiving and original DuckDB customer. Those original engines retain their payment, extraction, import and process ownership.

## Start

Use the complete Stellar Forge source release or a merchant archive containing the OpenAQ contribution. Linux, Node 22.16 or newer, Python 3.10 or newer and the original util-linux flock workspace lock are required. Original native seller dependencies come from the installed merchant archive. An independent customer DuckDB workspace is optional.

Copy the installed example into a private configuration file and set the actual project name, team and purpose:

~~~sh
install -m 600 examples/project.json /absolute/private/openaq-project.json
node cli.mjs init --workspace /absolute/private/station-study --config /absolute/private/openaq-project.json
node cli.mjs serve --workspace /absolute/private/station-study --port 0
~~~

Installed command: **starforge openaq**. Open the private URL printed by serve. The browser puts the bearer token from the URL fragment into session storage and clears the fragment. Every process has a fresh private connection; original project IDs and source editions persist.

The supplied archive plan selects the exact credential-free example from the [official AWS quick start](https://docs.openaq.org/aws/quick-start), location 2178 on May 3, 2022. The supplied archive context is explicitly the [Locations documentation example](https://docs.openaq.org/resources/locations), including its source edition and license dates. It is not presented as a live authenticated API response. The browser loads those examples and requires the operator's actual named source review.

## Complete workflow

1. **Capture a study:** select archive days or API sensors and an explicit-offset period. Review the exact plan JSON and source metadata. A saved monitoring study retains its future plan with version/revision checks.
2. **Review source:** inspect the station timezone, actual licensing/attribution, original response headers and all observations. Record a named decision and the proposed customer use.
3. **Build reports:** select exact capture/review pairs. Compare each sensor/parameter/unit/granularity separately, with original minima/maxima, row/missing/flag counts and source periods. A mean is optional and retained as an exact arithmetic expression.
4. **Publish a dataset:** prepare the original Frictionless candidate, inspect it, record the original publisher review and publish through dataset versions. The complete original source stays attached.
5. **Prepare merchant release:** provide real public SF30 payment terms and the actual HTTPS origin. Prepare and stage the original SF82 package. Merchant Releases owns activation, supervision, stop and rollback.
6. **Receive and analyze:** open the complete original local receiving/customer application for the host-selected DuckDB customer. It owns all selected pages, source mapping, import, saved queries, annotations, reports and package delivery. Its actual nested operation state stays visible.
7. **Deliver and reopen:** export selected accepted captures, reviews and compatible reports as one original Frictionless archive. Receive into another initialized project, preserve original IDs and verify every selected member. Reopening uses no provider call.

See OPERATING.md for exact request, recovery, release and receiving interfaces.

## Source interpretation

[OpenAQ's date contract](https://docs.openaq.org/using-the-api/dates-datetimes) defines observation datetimes as exclusive period ends. A local midnight end can occur in the previous day's archive object. The table therefore retains archive_local_day separately from datetime_local and its period-end local_day; it does not replace the file's location-local day with a UTC calendar day.

The [AWS archive](https://docs.openaq.org/aws/about) contains one location/local-day CSV with all available sensors. An object can be patched later. Each capture keeps actual bytes, SHA-256, ETag, Last-Modified and acquisition time. An unchanged URL alone is not an unchanged edition.

Archive CSV does not supply sensor averaging intervals, source flags, coverage, owner or license. Those fields remain absent or unknown unless supplied by their original metadata source. API measurements, hours and days retain their distinct [aggregation meanings](https://docs.openaq.org/resources/measurements).

Numeric tokens remain strings. No unit conversion, zero substitution, rounding or regulatory AQI is introduced. Every source row remains available. Reports keep different captures, sensors, units and intervals separate. Optional means are explicitly unweighted; original per-observation coverage is not a completeness certificate for a project window.

## API account

Archive acquisition needs no key. API acquisition uses the host's authorized registered OpenAQ account. Add the following selected account object to the project configuration before initialization:

~~~json
{
  "api": {
    "account": "research-team",
    "apiKeyEnv": "OPENAQ_API_KEY",
    "quotaDirectory": "/absolute/private/openaq-account",
    "requestsPerSecond": 1,
    "callsPerDay": 2000
  }
}
~~~

The actual key stays in the host environment. Requests send X-API-Key only to the fixed HTTPS API origin; redirects are refused. Stored receipts exclude private headers, and errors do not expose provider response bodies. The browser and merchant tools never take a key.

OpenAQ's [published free limits](https://docs.openaq.org/using-the-api/rate-limits) are 60 requests/minute and 2,000/hour. The existing supplier controller supports per-second reservations and a rolling 24-hour ceiling. This integration selects a conservative local policy of one request/second and at most 2,000 per rolling 24 hours. It is not an hourly-accounting implementation or an assertion about actual remaining provider balance. Provider 429, Retry-After and rate headers remain authoritative. Use the same account/quota directory for concurrent projects; unrelated account clients can still consume provider allowance.

## Customer identity and rights

An optional customer declaration selects an existing independently owned DuckDB service:

~~~json
{
  "customer": {
    "name": "original-customer",
    "workspaceId": "ACTUAL_32_HEX_WORKSPACE_ID",
    "database": "/absolute/private/customer/workspace.duckdb"
  }
}
~~~

Use actual existing identity values. This project does not create that independent database/service. Local SF100 receiving is not a paid purchase; a deployed merchant's payment remains the original Buyer/native payment operation.

OpenAQ attribution, actual location license dates, original provider terms and named review travel with the source and reports. No blanket CC BY license is assigned to all observations. A documentation example remains labeled as such. Review records describe the actual intended use and do not grant new rights. See [OpenAQ terms](https://docs.openaq.org/about/terms) and the [license model](https://docs.openaq.org/resources/licenses).

This product operates selected customer studies and attributed reports. It is not a replacement general OpenAQ API or a republication of their explorer.

## Installed Applications and agents

The additive OpenAQ contribution registers the command, source exports, complete browser assets, the **openaq-studies** Applications provider and a typed merchant provider. Applications validates the installed runtime, all 19 application code/assets and the initialized declaration before launch, then owns Start/Open/Stop.

For an existing listener, create a private operator config and select it through the original merchant host's **openaqConnection** setting:

~~~json
{
  "schema": "stellar-forge.openaq-operator.v1",
  "workspaces": {
    "research": {
      "label": "Air-quality research",
      "connectionFile": "/absolute/private/station-study/connection.json",
      "workspaceId": "ACTUAL_INITIALIZED_UUID",
      "configurationSha256": "ACTUAL_CONFIGURATION_SHA256"
    }
  }
}
~~~

The placeholders are not valid identities. Use values returned by initialization. Agents connect with merchant_openaq_connect, retain the actual instanceId, and call named capture/review/report/publication/customer/export tools. Exact request/operation reads work across the full history. File chunks use original native retained read handles and hash-bound transfers. Agent disconnect closes only its own connection/read resources.

## Storage and closure

Private project directories retain immutable captures, original input/attempt history, studies, reviews, reports and original publication/customer joins. One native flock owner serializes mutations. Reopening after process loss marks formerly running operations interrupted; no implicit source dispatch occurs.

Closing drains accepted work, pauses the project's own cancellable capture/export, attempts each owned original disposal and preserves failed handles for retry. Independent customer and Applications hosts retain their own owner. Complete project exports include selected scientific/source content, not credentials, connection tokens, unrelated projects or independent customer database internals.
