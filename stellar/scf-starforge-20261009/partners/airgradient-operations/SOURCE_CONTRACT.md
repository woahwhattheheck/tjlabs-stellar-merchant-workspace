# AirGradient source contract

The customer application retains both current official API definitions and binds each original source family explicitly. Every selected response retains its original bytes, HTTP status, content type, public request URL and retrieval time. The source definition travels with the saved project, frozen report and independent receiving package.

## Current original definitions

| Source | Original file | Original bytes | SHA-256 |
| --- | --- | ---: | --- |
| [Public Map OpenAPI](https://map-data.airgradient.com/map/api/v1/docs-json) | [map-openapi-original-20261013.json](sources/map-openapi-original-20261013.json) | 79,954 | f25b2cf80b1148c3fe5a80abc926da0b31009dd27e21b6c9fa19aab4bcb70922 |
| [Authorised Dashboard Swagger](https://api.airgradient.com/public/docs/api/v1/swagger.json) | [dashboard-openapi-original-20261013.json](sources/dashboard-openapi-original-20261013.json) | 18,361 | 8b5372a504a936ed041fad6740dc8787a04143a041f373d1e7864addc4ae274c |

The current Map definition is OpenAPI 3.0.0, title AirGradient Map API, version 1.0, with 37 paths and 62 schemas. Its exact document agrees with the swaggerDoc object in the provider’s complete retained documentation initializer. The Dashboard source is Swagger 2.0, title AirGradient Sensor API, version v1, with 15 paths.

Both originals join the existing [AirGradient source intake](https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791851973806789?thread_ts=1791730220.899469). That completed operation retains the full forty-one-file source packet, twenty actual location selections, original hourly histories, attribution and initial/later report periods. The separate five-source definition packet is F0C8JPPRH5K in that original thread.

## Public indoor and outdoor Map

The fixed origin is https://map-data.airgradient.com. The application verifies the current definition’s actual GET operations, numeric ID, explicit timezone-bearing start/end, requested bucket, response rows and selected measurements before using the connection.

| Location family | Metadata | History and returned rows |
| --- | --- | --- |
| Outdoor | GET /map/api/v1/locations/{id} | GET /map/api/v1/locations/{id}/measures/history; explicit measure/start/end/bucketSize; Pagination data[] of UTC timebucket/value |
| Indoor | GET /map/api/v1/indoor/locations/{id} | GET /map/api/v1/indoor/locations/{id}/measures/history; start/end/bucketSize; Pagination data[] of UTC timebucket and available pm25/pm10/atmp/rhum/rco2 |
| Outdoor catalogue | GET /map/api/v1/locations | page and pagesize |
| Indoor catalogue | GET /map/api/v1/indoor/locations | page and pagesize; source-defined datasource and sensor filters are also documented |

The two location families retain separate namespaces. The customer selects sourceType and provider ID; their compound locationKey is used by tasks, series, report rows, CSV output and prior-edition comparison. An indoor ID does not select an outdoor record that happens to have the same number.

The product uses the provider’s fixed 15m, 1h, 8h and 1d buckets. Outdoor requests select the actual pm25, pm10, atmp, rhum or rco2 measurement. Indoor history returns available fields together in one response; only timebucket is required by its row schema. A missing measurement remains null, and a returned decimal string remains available alongside its separately parsed arithmetic value. Raw source bytes retain every provider field.

The actual public source intake confirms HTTP 200 access for its selected routes, decimal strings and nulls, history envelopes with null page/pagesize, and returned-page total semantics. The application makes ordinary public GET requests and preserves the original datasource/permission context returned by the provider.

IndoorLocationDto carries numeric location ID, original coarse coordinates, sensor type, provider, datasource, linked datasource detail and linked licence detail. It can include device model and firmware. Customer label and display timezone are separate project choices. Outdoor LocationEntity also carries its original name, owner and timezone. Both original metadata objects travel unchanged in raw source; their attribution links are rendered in the customer report.

The earlier [provider source at c361a6f1ef9d0375b5eef630869c1895223a45ee](https://github.com/airgradienthq/airgradient-map/tree/c361a6f1ef9d0375b5eef630869c1895223a45ee/apps/api/src/location) remains useful acquisition context for original aggregation and catalogue behavior. Installed requests are bound to the complete current official definition above.

## Authorised Dashboard

The exact definition is linked by [the official Swagger UI](https://api.airgradient.com/public/docs/api/v1/). The built-in connection checks getPastMeasures, getCurrentMeasures, the actual numeric locationId, required BASIC-ISO from/to fields, ten-day interval limit, Measures array and query-token authentication.

The selected history operation is GET /public/api/v1/locations/{locationId}/measures/past. It returns provider-selected five- or sixty-minute aggregates depending on availability. Thirty days becomes four balanced source intervals per location, each inside the ten-day maximum and with one-second request margins. Original overlapping responses remain retained. Separate half-open interpretation segments assign each provider timestamp once.

| Product measure | Map field or requested measurement | Dashboard corrected field | Retained unit |
| --- | --- | --- | --- |
| PM2.5 | pm25 | pm02_corrected | µg/m³ |
| PM10 | pm10 | pm10_corrected | µg/m³ |
| Temperature | atmp | atmp_corrected | °C |
| Relative humidity | rhum | rhum_corrected | % |
| CO₂ | rco2 | rco2_corrected | ppm |

Dashboard current metadata uses the source-defined per-location current operation. Its host token is read from the connection’s named environment variable. Saved request URLs omit that query token; the complete original Swagger definition and selected variable name remain in receiving.

The provider’s [official display consumer at ea08e603d51c615b34aaa59f135db16f4c3cb7d3](https://github.com/airgradienthq/airgradient-example-display/blob/ea08e603d51c615b34aaa59f135db16f4c3cb7d3/app.js) supplies additional original field/units context. The saved report uses received measurement fields and retains returned datapoints.

## Reporting and continuation

All customer periods are half-open [start, end) UTC intervals with explicit bucket alignment. Public Map coverage counts returned non-null buckets. Dashboard reporting bins contain provider rows by their original timestamp; each bin equally weights its non-null returned aggregates, and the report equally weights populated reporting bins. This meaning appears beside the customer values.

A partial study retains its failed response bodies and original attempt/task references as well as successful inputs. Provider Retry-After deadlines and captured parser failures remain usable on an independent receiver. Incoming current task state advances unfinished work only when appropriate; completed, running or newer local work remains selected. Frozen report reconstruction uses its original successful sources and recorded gaps.

An accepted customer destination retains its original file identities. Reopening it reads those files before returning the original delivery, even after later workspace activity. New destinations can carry the report with its current operational history. ZIP and editable JSON receiving preserve original source definitions, response bodies, project and baseline history, and completed report interpretation.

## Original collection selection and independent receiving

The maintained collection intake consumes the actual **commons.delivery.source_packet.v1** input produced by the original 6A62 source operation. Every file remains its original UTF-8 body, byte count and SHA256. The complete raw packet is retained with its own byte identity; source-scope.json and source-manifest.json bind selected location namespaces, original history URLs, requested ranges, source readers and recorded retrieval windows.

The importer reads the exact Map definition from schemas/map-openapi.json and preserves its source URL. The original source manifest must bind each used file to that body. Selected location metadata must match one actual row in the complete retained provider catalogue page. The source task keeps that original catalogue URL and an explicit location selector; it does not turn a catalogue row into a fabricated single-location HTTP response.

For each selected location and measurement, a retained history identifies its actual request source, interval and bucket. Each report interval is contained by that original request and uses the same provider bucket. The twenty-location 6A62 collection supplies outdoor PM2.5 and all returned indoor fields, so PM2.5 is the shared full-cohort selection. Every original indoor field remains present in the complete packet and can be selected in an indoor customer project.

Retained documents use origin **retained-source**, with the recorded source reader, content basis and retrieval window. They have no local network attempt and no invented HTTP status or exact acquisition timestamp. The original request fingerprint is a content binding for the documented GET URL and retained provider definition. Live acquisition continues to record actual network attempts, status, content type and exact retrieval timestamp.

Frozen reports select original complete documents through a saved source collection and preserve their original request window independently of the report window. Whole editable receiving includes those source collections as immutable objects, rebuilds the saved task selection from the original files and current project revision, checks every raw source and metadata selector, and recomputes each frozen report from its own selected sources. Complete source files and baseline history remain available after receiving and cold reopening.

Customer ZIPs carry the whole original packet beside the editable study. ZIP receiving checks that the standalone original packet is byte-identical to the retained collection and that the visible report JSON matches the frozen report in the editable package. The complete original packet, including the original raw history values and attribution records, remains directly recoverable.
