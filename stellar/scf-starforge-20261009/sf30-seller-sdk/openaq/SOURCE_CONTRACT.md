# Source, time and edition contract

## Exact native routes

| Selection | Original route |
|---|---|
| Location | GET https://api.openaq.org/v3/locations/{locationId} |
| Selected sensor | GET /v3/sensors/{sensorId} |
| Location sensors | GET /v3/locations/{locationId}/sensors |
| Reported values | GET /v3/sensors/{sensorId}/measurements |
| Hourly / daily averages | GET /v3/sensors/{sensorId}/hours or /days |
| Source flags | GET /v3/sensors/{sensorId}/flags |
| License and provider | IDs returned by the original location |
| Public archive | https://openaq-data-archive.s3.amazonaws.com/records/csv.gz/locationid={id}/year={YYYY}/month={MM}/location-{id}-{YYYYMMDD}.csv.gz |

The API wire uses datetime_from, datetime_to, limit and page. Plans require explicit datetime offsets. Source origin and routes are fixed; arbitrary proxy URLs and redirect-followed credentials are not supported.

The official archive is the documented no-sign-request route. API reads use the host's registered account and environment key reference. No explorer scraping, alternate mirror or bundled key is introduced.

## Retention and recovery

An immutable request attempt precedes each actual GET. Complete response bytes and an acquisition receipt are written before projection. Receipts bind URL, request identity, size/hash, acquisition time and public response headers. Private key headers and error bodies are excluded.

All selected API pages are acquired before publishing the capture. A full last page needs a subsequent page unless the original count establishes the end. Contradictory counts/pages or exhausted reviewed bounds fail the complete capture. API pages are individually acquired responses; no point-in-time database snapshot is asserted.

The original gzip stays retained for archive capture. The expanded CSV hash, original headers and all source-row positions accompany the projection. Exactly one known singular/plural header variant is accepted for sensor_id/sensors_id and unit/units; duplicate/ambiguous columns are refused.

On explicit resume, a completed original receipt is reopened without HTTP. An incomplete GET can be retried with its earlier attempt retained. A changed reviewed payload under the same original request UUID is refused. An archive URL may be patched later, so a new capture is a new observed edition.

## Exact observations and numeric meaning

All 30 published columns are text. The table preserves capture/location/sensor/parameter identity, unit, exact value_token, value_present, resolution, original UTC/local period bounds, archive local day, coordinate tokens, flags, coverage/summary JSON and original source-file/hash/row/URL/acquisition time.

The existing exact JSON parser turns numeric tokens into strings and rejects duplicate keys. The original CSV parser decodes transport quoting without changing numeric values. Numeric comparisons use integer coefficients and decimal exponents. No binary-float number replaces the original token.

Flags remain true, false or unknown. Relevant original flags pages accompany API captures; archive flags and sensor averaging intervals remain unknown because that CSV carries neither. Negative and repeated observations remain in the complete source.

## Periods and comparisons

[OpenAQ dates/datetimes](https://docs.openaq.org/using-the-api/dates-datetimes) defines datetimes as exclusive period ends and dates as period-start labels. The original local offset and IANA location timezone remain explicit.

A May 3 archive row ending May 4 at 00:00 local keeps that timestamp/end date and a separate archive_local_day of May 3. No interval is inferred from gaps between observations. No UTC-day substitution occurs.

[Measurements, hours and days](https://docs.openaq.org/resources/measurements) describe different original aggregations. Reports separate them, plus capture, sensor, unit and interval. Optional means are exact unweighted expressions, not daily provider aggregates, time-weighted statistics or AQI. Source-flagged exclusion only changes explicitly selected numeric summaries.

Counts describe the retained source rows. Per-observation coverage stays raw structured data. No absent-hour interpolation, inferred completeness certificate, regulatory result or health advice is generated.

## Metadata and rights

API captures retain the actual location/provider/license/sensor responses. Archive metadata is explicitly operator-supplied or documentation context. The supplied location 2178 context is the original documentation example with a stated last observation in 2024; it is not labeled as a fresh live response.

The selected location carries license dates/attribution. Its [license resource](https://docs.openaq.org/resources/licenses) describes permissions. A generic CC BY example is not assigned to every observation. Location 2178's documentation example names US Public Domain with its own dates; the CSV itself has no license field.

Named review, original source URLs, attribution and intended customer use accompany descriptors, reports and complete archives. The [OpenAQ terms](https://docs.openaq.org/about/terms) and applicable original-provider terms remain part of that use.

## Existing engines

CSV parsing/exact JSON preserve observations. The original supplier controller owns source-account reservations. Frictionless package.py owns complete source capture/export/receiving. The existing Frictionless/Postgres publisher owns candidate extraction/review/publication. SF82 owns merchant preparation/store. Local SF100 owns page delivery and recovery; the independent original DuckDB customer owns mapping/import/analysis/reports/collections.

RetainedFileReads and retained-download own native transfers. Installed Applications owns process lifecycle and selected runtime/source identity. This project records every original nested result and does not translate wrapper completion into paid, published, imported or deployed status.
