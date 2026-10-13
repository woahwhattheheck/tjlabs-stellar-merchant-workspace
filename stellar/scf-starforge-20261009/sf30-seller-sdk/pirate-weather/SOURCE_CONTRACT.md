# Pirate Weather source contract

## Original authority

The request and response implementation is grounded in Pirate Weather's original OpenAPI 2.10.2 source, Git blob `cc35937e75cb4c135b11726800cf03b263bbfa6f`, and the provider's maintained documentation:

- [Original OpenAPI blob](https://api.github.com/repos/Pirate-Weather/pirateweather/git/blobs/cc35937e75cb4c135b11726800cf03b263bbfa6f)
- [API requests](https://docs.pirateweather.net/en/latest/API/)
- [Response data blocks](https://docs.pirateweather.net/en/latest/API/data-blocks/)
- [Alerts, flags, errors and usage](https://docs.pirateweather.net/en/latest/API/alerts-flags-errors/)
- [Provider terms](https://pirate-weather.apiable.io/terms)

These source references are retained in every report. The supported source is one original forecast response for an explicitly selected coordinate and unit system. Historical acquisition, automatic re-estimation and extra provider interfaces are outside this request contract.

## Customer contract

The operator supplies the actual complete object:

| Field | Required meaning |
| --- | --- |
| `id` | One UUID retained across this customer's contract revisions |
| `title`, `customer`, `purpose` | Actual report title, designated recipient and agreed purpose |
| `destination` | Agreed destination description; saving it does not send a message |
| `units` | Explicit provider system: `us`, `si`, `ca` or `uk` |
| `horizonHours` | Exactly 48 |
| `locations` | One to three entries, each with a unique stable ID, label, numeric latitude and longitude |
| `schedule.timeZone` | Explicit IANA time zone |
| `schedule.slots` | Two distinct local `HH:MM` review slots |

Latitude is in [-90, 90]; longitude is in [-180, 180]. A location ID starts with a lowercase letter and contains up to 48 lowercase letters, digits or hyphens. Contract identity hashes the exact stored contract-edition object, including original actor, reason, ordinal and time. Revisions use the prior contract SHA and retain its UUID.

Saving a changed purpose, title or customer does not mislabel a previous capture. A reused original body can be bound to the newly selected contract by an explicit import, producing a contract-specific capture while retaining the same byte object.

## Provider invocation

A preview freezes:

```text
GET https://api.pirateweather.net/forecast/{private-api-key}/{latitude},{longitude}
?units={explicit-unit-system}
```

The saved request uses a private-key placeholder. It keeps all original response blocks: the request does not add an exclude list or extended-hour option. The real key is read from the saved environment-variable reference immediately before the explicit invocation. Redirects are not followed.

One original invocation is retained with its stable operation UUID, selected contract SHA, location, exact request digest, named actor and purpose. On receipt, headers are checkpointed before the body stream. The body stream is bounded at 8 MiB and the owned request is aborted/cancelled on every interrupted path, including a failed header checkpoint. The original interruption reason and retained byte prefix remain visible.

The original response includes explicit start and observation timestamps, actual HTTP status or null, original header pairs, actual byte count/SHA256, and a boolean complete-body outcome. A failed status or an incomplete body remains a retained source exception; it is not silently promoted to a report source.

## Existing-file intake and unknown replies

An import requires the exact original UTF-8 body file, its SHA256, filename, named actor/reason, actual start and observation times, actual HTTP status (or null), original header name/value pairs and explicit body completeness.

The browser/CLI computes the original file digest but does not invent HTTP metadata. An imported record is labelled as an original retained-file source. It does not claim that this application performed that historical provider request.

A complete report source must be a complete HTTP 200 response with valid unique-key JSON. The body must contain actual returned coordinates, a valid provider time zone, `flags.units` matching the selected unit system, and a nonempty hourly block with safe integral Unix times. The source retains all other flags, fields and blocks, including currently, daily and alerts.

An unknown `capture.fetch` can be reconciled only to that original invocation through an explicit `capture.reconcile` request. The original invocation, returned source identity and its actual time/status/body evidence remain linked. It is never reissued by `resume`.

Source reuse compares both the exact source identity and selected contract SHA. It never changes a source body to fit a later contract.

## Usage and rate limits

Header names are compared case-insensitively; original name/value pairs and repeated values remain retained. The source keeps `ratelimit-limit`, `ratelimit-remaining`, `ratelimit-reset`, `x-forecast-api-calls`, `retry-after`, `date`, `cache-control`, `x-node-id` and `x-response-time`.

For the supported provider contract, an unambiguous integral `ratelimit-reset` is a delay in seconds after the retained response observation. An unambiguous `Retry-After` is either such a delay or an explicit date. When both produce valid deadlines, the later deadline governs. Ambiguous, missing or unsupported values remain visible and are not guessed.

A returned 429 or explicit zero remaining quota creates a hold. A known future deadline is never bypassed. An undated hold requires a named source-grounded decision: a later complete original HTTP 200 response with explicit positive remaining quota. Importing that source alone does not clear the hold. The release decision retains the old hold and source digests and performs zero provider invocations.

## Exact report projection

A report uses one selected complete capture per contract location and an explicit UTC start aligned to an hour. The 48-hour end is exclusive.

Each original hourly record within the window produces one row for each actual field except its time key. Source-order field traversal and original hourly row ordinal are retained. No missing field is inserted. Duplicate times and non-hourly times are not collapsed.

The following columns are fixed in order:

```text
locationId,location,requestedLatitude,requestedLongitude,returnedLatitude,
returnedLongitude,timeZone,timeUnix,timeUtc,timeLocal,sourceOrdinal,field,
value,valueType,csvEncoding,unitSystem,captureId,responseSha256,flagsSha256
```

Original JSON numeric tokens become exact strings with `valueType=number-token`. Null, boolean and string values remain distinct. Arrays and objects retain their structure using exact numeric-token strings and an explicit corresponding value type. Scientific notation, trailing decimal zeros and negative values are not rounded.

Safe Unix times produce UTC and local labels using the provider's original time zone. Requested coordinates remain contract values; returned coordinates remain original response values. The workbench does not alias them.

Coverage records expected 48 hours, selected records, unique times, missing hours, duplicate-hour counts, non-hourly times and complete/incomplete status. A reviewer can approve a report with explicit source gaps, but the gaps remain in every output.

The report stores its original source summaries, complete body references, request metadata, unit system, flags, source authority, contract SHA and previous-report link. Its SHA256 identity covers all report content. Comparing editions requires the same contract UUID and unit system; added, removed and changed values retain their original before/after source.

## CSV, JSON, HTML and native dataset

Report JSON is the complete saved report object. HTML is an escaped, offline-readable rendering with its source/coverage context. Report CSV keeps negative numeric tokens as numeric literals and prefixes only formula-like text once with an apostrophe. The `csvEncoding` column identifies that text transformation. JSON and original bodies retain exact original text.

The native SF30 dataset uses the same fixed columns as strings and preserves the original projected values without spreadsheet escaping. Numeric text is not advertised as a numeric range/sort column. Dataset configuration, actual CSV snapshot, source.json, report, approval, original capture records and original response bodies travel through the maintained publisher.

The original SF82 release retains its source, payment configuration, staged digest and selection generation. A receiving directory is bound through the native publisher relocation API and a source-bound installation sidecar; immutable release source is preserved. The original Buyer Inbox/complete dataset receiver retains its actual attempts, outcome, accounting source and output bytes.

## Trust and provenance boundaries

The named operator is responsible for selecting the actual customer contract and authentic imported source metadata. The application verifies structural/hash consistency and maintains the source history; it does not certify provider forecasts or invent an independent observation.

Raw responses may contain location and customer context. Complete projects are private operator artifacts. API-key values, current bearer tokens, live control sockets and process lock files are excluded; source hashes and original operation/release IDs remain.

A complete-project importer uses the currently trusted installed code and rejects a different included application manifest. It validates each archive byte and member, the original workspace identity/revision/counts, original request references and native relocation bindings before opening the received case. A project containing source is not permission to execute arbitrary uploaded code.
