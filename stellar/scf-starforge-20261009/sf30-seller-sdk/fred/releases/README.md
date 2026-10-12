# FRED release calendar and vintage planning

This native source arm connects watched FRED series and recurring briefing templates to complete release calendars and actual series vintage histories. It prepares the original observation selections needed to catch up on missed source editions. The existing FRED project owns saved operations, browser interaction, observation adoption, successor review and publication.

A release source capture preserves the exact request, full response text, byte digest and actual receipt time for every page in the selected metadata date and calendar/vintage intervals. Calendar dates guide scheduling; returned series vintage dates drive observation acquisition.

## Source and operating entrypoints

| Module | Responsibility |
| --- | --- |
| model.mjs | Selection normalization; original requests; complete metadata, release, calendar and vintage parsing; deterministic source graph; capture identity and inspection |
| source.mjs | Existing private key binding, paginated acquisition, durable recovery, complete source receiving and reopening |
| watch.mjs | Immutable watched series or complete original briefing-template binding |
| planner.mjs | Comparable source spans, calendar changes, late discovered vintages, source meaning changes and coherent observation selections |
| acquisition-cli.mjs | Native source capture/status/inspect/receive/export and complete watch/plan files |
| project-cli.mjs | Project operations maintained by the companion integration |

The ES modules reuse the existing FRED model, provider, briefing template and private file helpers. The direct source path needs Node with the same fetch/AbortSignal support as the existing provider and the original Linux flock helper. It introduces no additional HTTP client or credential store.

The installed command forwards the same complete source operations through the existing FRED CLI:

~~~sh
starforge fred releases --help
starforge fred releases capture --directory /absolute/private/ppiaco-release-20261012 --selection /absolute/private/ppiaco-release-selection.json
~~~

Use starforge fred releases followed by capture, status, inspect, receive, export, watch, plan or page with the options shown below. Project mutations remain the companion release-* commands. The original module entrypoint is also available:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/acquisition-cli.mjs help
~~~

Use the existing privately configured FRED API key through its environment-variable name. The default is FRED_API_KEY; --key-env accepts another existing name. The original requestFred function adds the secret only to the outgoing official API URL. Retained requests contain no key. Receipt headers are limited to the original content type, server date, entity tag and last-modified value.

## Capture a complete selected interval

The dated example, examples/ppiaco-release-selection.json, is an operating selection for October 12, 2026. It contains series and date criteria, not supplied economic values. The provider discovers the original release ID through series/release.

~~~json
{
  "series": ["PPIACO"],
  "asOf": "2026-10-12",
  "calendarStart": "2026-09-01",
  "calendarEnd": "2026-12-31",
  "vintageStart": "2026-09-01",
  "vintageEnd": "2026-10-12",
  "pageSize": 2,
  "maxRows": 100000
}
~~~

The small page size makes this dated source exercise use normal continuation wherever the original result spans multiple pages. Normal operating selections can use the default page size of 1,000. Per-release dates and per-series vintages accept sizes from 1 through 10,000.

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/acquisition-cli.mjs capture \
  --directory /absolute/private/ppiaco-release-20261012 \
  --selection stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/examples/ppiaco-release-selection.json
~~~

The deterministic graph requests:

1. Every selected series' original metadata at realtime_start = realtime_end = asOf.
2. Every selected series' original release mapping at that same metadata date.
3. Every calendar page for each distinct returned release ID, using the selected calendar interval and include_release_dates_with_no_data=true.
4. Every vintage page for each selected series, using the explicit vintage interval.

Shared release calendars are fetched once. Pages preserve source count, offset, returned limit and ascending order. Counts must remain consistent, dates must remain within the selected interval, and page boundaries must advance without duplicates. The retained number of rows must match the complete source count. A zero-row result is complete only when its count is zero. Total row capacity covers calendar and series vintage entries together.

The immutable capture.json contains all original responses. The progress.json file saves each fully returned page before semantic inspection, alongside selection criteria, the key environment name and operation state. The capture SHA binds the normalized selection and all retained responses.

### Continue the same acquisition

Run the same command with the same directory, selection and key environment name. The source graph validates and replays retained pages, then requests only the next missing response. A completed directory returns its original capture without another provider call.

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/acquisition-cli.mjs status \
  --directory /absolute/private/ppiaco-release-20261012
~~~

Status includes operation state, response count, the next credential-free request and any retained provider retry time. A provider 429 continues after that exact time. An interrupted response remains available for inspection. If the provider changed a paginated count or returned an inconsistent page, preserve that operation and select a new acquisition directory after examining the source.

Changing criteria belongs to a new acquisition directory. The original selection and key environment reference remain bound during continuation. Source captures are limited to 64 MiB, and each page uses the existing 8 MiB provider limit.

## Watch a source or recurring briefing

A watch is an immutable descriptor with an ID consisting of fred-release-watch- followed by its SHA256.

| Field | Meaning |
| --- | --- |
| name | Operator-facing source or report name |
| series | Complete watched original series IDs |
| template | Full validated original briefing template, or null |
| observationStart | Earliest observation period requested in catch-up captures |
| observationEnd | Fixed original observation end, or as_of to end at each selected acquisition date |
| baselineAsOf | Explicit starting date for normal catch-up history |
| catchUp | all_vintages or latest_vintage |
| pageSize, maxRows | Existing observation provider settings |

A template watch derives its series from the original template when series is omitted. Supplied series must match every template series exactly. The full original template retains its source basis, meaning and reviewed comparisons. Project integration validates its retained review and capture lineage before saving.

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/acquisition-cli.mjs watch \
  --input stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/examples/ppiaco-watch.json \
  --output /absolute/private/ppiaco-watch.json
~~~

Choose enough observation history for the report's actual comparisons. A year-over-year monthly briefing needs the corresponding prior-year observations. The original observation and briefing engines determine returned coverage and missing values.

## Plan from retained source

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/acquisition-cli.mjs plan \
  --watch /absolute/private/ppiaco-watch.json \
  --after /absolute/private/ppiaco-release-20261012/capture.json \
  --output /absolute/private/ppiaco-plan-20261012.json
~~~

For a later snapshot, pass --before with the complete previous release capture. The optional --completed file contains a JSON array of actual completed observation as-of dates belonging to this same watch and after-capture SHA. Project integration produces that completion snapshot from retained acquisition records. A completion from another source snapshot is not a permanent date-only cursor.

The complete plan retains its watch, before/after source identities, normalized completion snapshot, coverage, required source selections, source and meaning changes, original calendar/vintage changes, every watched vintage event and exact observation acquisitions.

### Late discovery and continued work

The planner compares per-series date sets inside the actual common source interval. A vintage first appearing inside that overlap is LATE_DISCOVERED_VINTAGE, including when it precedes the baseline. History entering a newly selected interval remains ENTERED_VINTAGE_COVERAGE.

Known post-baseline vintages without a completion in this source snapshot remain KNOWN_UNCOMPLETED_VINTAGE candidates. Reading a calendar does not complete an observation acquisition. Changed original update metadata, observation coverage or meaning can select a series' latest returned vintage for SOURCE_UPDATE_RECHECK. The resulting original observation capture establishes whether values changed.

The all_vintages policy prepares every selected, uncompleted, usable original date. The latest_vintage policy prepares the latest actual returned watched vintage when work remains. Completion of that latest date in this same source snapshot satisfies the latest-only selection.

Each acquisition has this shape:

~~~js
{
  asOf,
  changedSeries,
  triggerVintageDates,
  reasons,
  selection: {
    schema: 'stellar-forge.fred-selection.v1',
    series,
    asOf,
    start,
    end,
    pageSize,
    maxRows
  }
}
~~~

The changedSeries array names series whose original vintage lists contain the selected date. The selection.series array contains every watched series. Pass the complete normalized selection unchanged to the existing captureFred engine through the saved project plan. Original numeric strings, missing markers and real-time context flow into the existing successor preview and review.

A fixed observation end is retained exactly. An as_of end follows the selected original vintage. Events before the watched observation start remain visible and do not create an unusable observation interval.

### Coverage and calendar changes

If the captured vintage interval does not cover the normal interval after baseline, coverage.missingSpans states the exact missing spans. The requiredSourceSelections array provides a normalized acquisition selection to fill them while preserving overlap with retained history. Known usable vintages remain available for acquisition.

Calendar additions/removals are compared where both intervals cover the date and the same release remains in the watched selection. Entries outside that common span are identified as entering/leaving coverage. Changes to the series-to-release association are separate. A removed calendar entry does not assert publisher cancellation.

Schedule phase compares the original date with the plan's explicit metadataAsOf: UPCOMING_CALENDAR_DATE or PUBLISHED_CALENDAR_DATE. The actual retrieval window stays separate. Neither phase establishes series availability.

## Complete files and receiving

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/acquisition-cli.mjs export \
  --capture /absolute/private/ppiaco-release-20261012/capture.json \
  --output /absolute/private/ppiaco-release-full.json

node stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/acquisition-cli.mjs receive \
  --capture /absolute/private/ppiaco-release-full.json \
  --directory /absolute/private/received-ppiaco-release

node stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/acquisition-cli.mjs page \
  --plan /absolute/private/ppiaco-plan-20261012.json \
  --section events --offset 0 --limit 100
~~~

Exports include every original response. Receiving validates the deterministic graph, every page digest and the capture identity before saving. Existing output files are reused only when their complete JSON is identical.

Source capture returns { directory, capture, model, reused }. The reader returns { capture, model }. Inspection provides full series, releases, calendar and vintages arrays, source intervals and actual receipt window.

The source-context validator validates and recomputes the complete plan:

~~~js
validateFredReleasePlan(plan, { before, after })
~~~

The context-free form validates the descriptor and its normalized selections. Project import and execution use full source context. The pageFredReleasePlan function returns one selected array page and its source/plan identities; the full saved plan remains available.

The companion project integration carries raw release captures, complete watches and plans, and actual catch-up capture references through the existing project receiving workflow. Successor review and publication use the original observation/briefing implementation.

## Source semantics

The [FRED real-time interval](https://fred.stlouisfed.org/docs/api/fred/realtime_period.html) is inclusive at both ends and describes when information was known. Its interval, returned calendar date, acquisition timestamp and observation window remain separate fields.

A [publisher release date](https://fred.stlouisfed.org/docs/api/fred/release_dates.html) does not establish FRED or ALFRED availability. Upcoming acquisition explicitly requests include_release_dates_with_no_data=true because the default excludes future dates without data.

[Series vintage dates](https://fred.stlouisfed.org/docs/api/fred/series_vintagedates.html) identify additions or revisions to values. An unchanged release does not produce another vintage. For a coherent multi-series capture, the [observations API](https://fred.stlouisfed.org/docs/api/fred/series_observations.html#vintage_dates) permits as-of dates on which a particular series did not change. Intersecting all series' change-date lists would omit valid combined snapshots.

[ALFRED's source policy](https://alfred.stlouisfed.org/help) explains that new and revised observations normally enter after release, typically within one business day. It uses the source release date when available, then a provider date, with first FRED availability as fallback. The planner therefore compares complete captured sets across overlapping spans instead of polling only dates after a maximum.

Per-release dates and per-series vintages allow 1–10,000 results per page. The separate [all-release calendar](https://fred.stlouisfed.org/docs/api/fred/releases_dates.html) allows 1–1,000 and has different defaults. This implementation resolves the [original series release mapping](https://fred.stlouisfed.org/docs/api/fred/series_release.html) and fetches each per-release calendar. Completeness describes the fully received selected interval and retrieval window.

## FRED notice

This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.

Original source use remains subject to the [FRED API Terms of Use](https://fred.stlouisfed.org/docs/api/terms_of_use.html).
