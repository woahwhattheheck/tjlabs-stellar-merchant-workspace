# Receive and continue a complete weather delivery

A customer can open a delivered weather report in an independent review workspace, edit the operating decisions, freeze a later report, and send the complete editable work onward. The source responses, model selection, UTC windows, grid coordinates, units, member columns, original report and receiving relationships travel with that work.

Use the installed `starforge weather-operations` command or this directory's `cli.mjs`. The maintained Node runtime must provide `node:sqlite`; Python 3 is used when opening an older ZIP. This operation uses the existing weather parser, calculations, storage and browser application.

## Prepare the editable delivery

From the original weather workspace, export the frozen report with its selected decisions and complete retained revisions:

~~~sh
npx --no-install starforge weather-operations report-export \
  --settings /private/weather/settings.json \
  --report REPORT_ID \
  --format handover \
  --output /private/weather-delivery/report.weather.json
~~~

The browser's **Frozen reports → Editable package** produces the same format. The receiving file contains every original response needed by the selected decisions and their earlier local revisions, plus earlier receiving relationships.

All file paths are canonical absolute paths. Create each output parent with mode 0700. Input files use 0600; a downloaded receiving file can be made private with `chmod 600 /private/weather-delivery/report.weather.json`. Output publication is create-only: select a new filename for a later edition.

### Open an existing frozen ZIP

The original ZIP report format already retains the report, selected decisions, source JSON, CSV and manifest. Convert that full archive directly:

~~~sh
npx --no-install starforge weather-operations from-report-zip \
  --input /private/weather-delivery/original-report.zip \
  --archive-sha ORIGINAL_ZIP_SHA256 \
  --output /private/weather-delivery/original-report.weather.json
~~~

The optional `--archive-sha` checks the original ZIP byte hash supplied with the delivery. Conversion checks the archive's complete file selection and manifest, verifies every recorded byte length and SHA-256, reads the exact source JSON and recomputes the selected decisions through the maintained parser and analysis. Entries are read in memory; they are never extracted into the filesystem.

The ZIP retains the decision revisions that were selected when it was frozen. Those selected revisions become editable local decisions. Later editable deliveries add all revisions retained in the receiving workspace. The original ZIP itself remains in the package and receiving lineage with its byte hash. Because the old ZIP has no workspace-origin field, its frozen report hash supplies an explicit archive origin.

## Continue the original report in one operation

The [complete native example](examples/receive-original-report.mjs) operates a retained original ZIP through the authenticated HTTP application, saves receiving review notes as a new local decision revision, freezes the next report, reopens the original delivery, and receives/re-exports the complete work in a second private workspace. The two receiving directories, original ZIP and all three complete editable packages remain available afterward.

~~~sh
node stellar/scf-starforge-20261009/partners/open-meteo-operations/examples/receive-original-report.mjs \
  --archive /private/weather-delivery/original-report.zip \
  --archive-sha ORIGINAL_ZIP_SHA256 \
  --output /private/weather-delivery/new-receiving-operation \
  --note "Independent receiving review completed from the retained source package."
~~~

Choose a new output directory beneath an existing private parent. This uses the original source values, windows, thresholds, responsible owner and disposition; the explicitly supplied receiving note creates the new decision revision. The saved `receiving-continuation.json` identifies both private settings files, the original and resulting report/source identities, the retained local revision and complete delivery files. Open either settings file through the normal `serve` command to continue the customer work.

## Operate the complete browser receiving journey

The [browser receiving programme](examples/browser-receiving.mjs) continues the original 7573 frozen report through two actual browser workspaces. It retains the original ZIP, opens its exact forecast/history/ensemble sources, saves one local decision revision, freezes a report with all three selected decisions, downloads complete report and editable packages, receives the onward work, and reopens the first delivery with the later local revision preserved. Both workspaces are closed before the final CLI reopen.

~~~sh
node stellar/scf-starforge-20261009/partners/open-meteo-operations/examples/browser-receiving.mjs \
  --runtime /absolute/starforge-runtime \
  --archive /private/weather-delivery/original-report.zip \
  --output /private/weather-delivery/browser-receiving-operation \
  --chrome /absolute/chrome-headless-shell \
  --playwright /absolute/node_modules/playwright
~~~

Use Node with `node:sqlite`, Python 3, and the existing matching Playwright/browser runtime. The original source archive for this operation is 33,416 bytes with SHA-256 `28d56f92cdf35756773a40eb5a0125d03b5b0f86d5ebf63485d2c79365643f53`. The programme checks these exact input bytes before receiving. Its saved selection and progress keep a continuation on the same private roots. `operation/decision-update.json` records the receiving operator's explicit revision, and `deliveries/` contains the full original and onward customer files. The receiving note and report retain source dates and windows; the programme uses the saved source values.

A recipient's revision history can create more local decision records than the number selected in a frozen report. The programme derives the second workspace's exact selection through the native receiving plan, including every retained revision and original-to-local mapping.

## Open the receiving workspace

The review workspace has its own private directory and stable origin identity:

~~~sh
npx --no-install starforge weather-operations review-init \
  --state-root /private/weather-review

npx --no-install starforge weather-operations handover-review \
  --settings /private/weather-review/settings.json \
  --input /private/weather-delivery/report.weather.json
~~~

Review returns the exact package SHA-256, frozen report identity, source count and bytes, model/time-zone details, decision revisions, and any original-record conflicts. Receive those exact reviewed bytes:

~~~sh
npx --no-install starforge weather-operations handover-receive \
  --settings /private/weather-review/settings.json \
  --input /private/weather-delivery/report.weather.json \
  --expected-sha PACKAGE_SHA256_FROM_REVIEW
~~~

Receiving returns the original-to-local mapping and the received report identity. The full import is one SQLite transaction. If an original identity already exists with different content, the transaction leaves the receiving workspace intact and identifies the conflict during review. A later local decision revision remains available when the original package is received again.

`review-init` reopens the same existing review settings. It rejects a different workspace configuration at that path. The complete review operation needs the retained delivery file and this review directory; the customer's original buyer operator is independent of this editable report workflow.

## Continue the work in the browser

~~~sh
npx --no-install starforge weather-operations serve \
  --settings /private/weather-review/settings.json \
  --descriptor /private/weather-launch/review-launch.json
~~~

Open the returned local URL on the machine running the workspace. The server uses the existing private launch capability, loopback session and origin checks.

1. **Frozen reports:** choose the complete `.weather.json` file, select **Review complete package**, then **Receive complete editable work**.
2. Select **Edit received decisions**. The receiving report's selected decision opens with the original source and current local revision.
3. Change the operating window, threshold, coverage, owner, disposition or notes, then **Save decision revision**. The editor opens the decision's exact retained variable and unit, so changing notes preserves the numeric threshold and its meaning. Each imported original revision is labelled separately from its current local revision.
4. **Frozen reports:** select the intended current decisions and freeze the next report. Download its **Editable package**, **Complete ZIP**, **HTML report** or **JSON**.
5. **Receiving history:** reopen the exact original received file, inspect original-to-local relationships, or open every source in that delivery. Older received reports and sources remain directly addressable when the main recent-record tables have advanced.

The review workspace displays received requests and source data. Acquiring fresh provider data or operating the original buyer uses an operator workspace initialized through the existing `init` path. An operator workspace can also receive these editable packages and combine received sources with its own retained sources in a later report.

## Continue through the native API

The workspace offers `reviewHandover(content)`, `receiveHandover(content, { expectedSha256 })`, and `handover(reportId)` alongside the existing decision/report methods. The input `content` is the complete UTF-8 package string; `expectedSha256` identifies those exact bytes.

A received decision is an ordinary versioned weather decision. Read the current decision from `workspace.summary()`; retain its ID, capture ID and rule while changing the desired operating fields:

~~~js
const state = await workspace.summary();
const current = state.decisions.find(value => value.id === receivedDecisionId);
const revised = await workspace.saveDecision({
  id: current.id,
  expectedRevision: current.revision,
  captureId: current.captureId,
  decision: {
    title: current.title,
    owner: nextOwner,
    disposition: 'monitor',
    notes: nextOperatingNotes,
    rule: current.rule
  }
});
const report = await workspace.freezeReport({
  title: nextReportTitle,
  owner: nextOwner,
  notes: nextReportNotes,
  decisions: [{ id: revised.id, revision: revised.revision }]
});
const nextDelivery = await workspace.handover(report.id);
~~~

The installed public exports are:

| Export | Operation |
| --- | --- |
| `@tokenjunkielabs/starforge-merchant/partners/open-meteo/receiving` | Create, inspect and map the full portable receiving contract |
| `@tokenjunkielabs/starforge-merchant/partners/open-meteo/legacy` | Convert an original frozen ZIP through `weatherHandoverFromZip` |
| Existing `/partners/open-meteo/workspace` | Initialize, reopen, receive, revise and export work |
| Existing `/partners/open-meteo/server` | Run the authenticated receiving browser |

Use the installed package name declared by your distribution; the subpaths above are contribution-owned and travel with the complete weather component.

Authenticated HTTP operations are `POST /api/handover/review` with `{content}`, `POST /api/handover/receive` with `{content, expectedSha256}`, `GET /api/reports/:id/download?format=handover`, and `GET /api/receiving/:packageSha256/original`. The original-download response includes the exact received bytes and `x-content-sha256`. Existing decision and report routes continue the local operation.

## Identity and retention

| Record | Receiving behavior |
| --- | --- |
| Original source JSON | Exact original bytes, source SHA, model request and parsed metadata are retained |
| Source site and request | Deterministic local identities preserve the original site revision, coordinates, time zone, model, dates and units |
| Original decision revision | A deterministic local decision starts at revision 1, with the original revision retained in the receiving mapping |
| Later local edits | Append local revisions under the same local decision; repeated receiving leaves those revisions intact |
| Frozen report | The original report remains in the receiving record; the local frozen report records its source identity and mapped editable records |
| Repeated package | Reopens the same receiving record and local report |
| Later package from the same origin | Reuses matching immutable sources and adds newly selected original revisions |
| Forwarded editable work | Retains the selected local revision history and complete earlier receiving relationships |
| Original older ZIP | Retained with its byte hash in the receiving lineage |

The package admits up to 48 MiB, 128 retained source responses, 4,096 selected/history decision revisions and 1,024 earlier receiving records. Each source retains the existing 1 MiB response limit. A frozen report keeps the existing 32 selected-decision and 16 selected-source limits. Limits fail explicitly before import; content is never truncated to fit. ZIP conversion additionally limits archive size to 32 MiB, entry count to 64, individual expanded entries to 64 MiB and total expanded data to 128 MiB.

Hashes identify bytes and retained relationships. The original provider attribution and capture provenance remain visible throughout the operation. The receiving workspace recomputes the weather decisions using the exact retained data and the maintained product rules.


## Continue with a selected real provider case

The complete browser caller also accepts a selected report ZIP through
`--archive-sha256` and `--archive-bytes`. Supply both values from that archive's
retained identity. The caller verifies the whole file before receiving it and
keeps that selection through both workspaces and every continuation. Its default
selection remains the original 33,416-byte report documented above.

The maintained provider-case programme can prepare a complete new operating
report from actual Open-Meteo responses:

```sh
node examples/capture-receiving-case.mjs \
  --runtime /private/original-stellar-runtime \
  --output /private/weather-provider-case \
  --forecast-start YYYY-MM-DD
```

It selects New York's two-day operational forecast, three-day ERA5 history across
the November 2024 clock change, and the two-day ICON ensemble. Use
`--history-start` and `--history-end` to select another historical window. The
forecast date defaults to the current UTC day for a new case and remains bound to
the saved selection when the same case resumes. When the selected runtime uses
an explicit CONNECT proxy, pass its environment variable name through
`--proxy-env`.

Every request uses the existing canonical provider contract and native HTTPS
transport. The programme retains the complete response before analysis, creates
the original source-capture records, saves attributed operating decisions, and
freezes one report over those exact revisions. The forecast rule uses 86 °F,
the history rule uses a 40 km/h peak gust threshold, and the ensemble rule uses
10 mm of accumulated precipitation over the retained window. The native engine
retains coverage, returned members, source time and model when computing each
outcome.

The source case contains `source-selection.json`, the private source store,
every original response and request record, complete ZIP/HTML/JSON/editable
exports, and `result.json`. Reopening the same case reuses its retained reads,
decisions and frozen report. The programme closes and reopens its source store
before returning the selected archive identity.

A non-success HTTP response or an unexpected content type keeps its complete
response body and request-attempt record under `provider-errors/`. The source
request records the actual HTTP status, original query, body size and SHA,
content type and any `Retry-After` header. Open that saved body to inspect the
provider's response. Running the same case again reuses every successful capture
and gives the outstanding original request a new recorded source attempt. The
case's location, model, dates, variables and units remain bound to its saved
selection.

Feed that exact returned ZIP into the complete browser journey:

```sh
node examples/browser-receiving.mjs \
  --runtime /private/original-stellar-runtime \
  --archive /private/weather-provider-case/delivery/provider-weather-report.zip \
  --archive-sha256 SELECTED_ARCHIVE_SHA256 \
  --archive-bytes SELECTED_ARCHIVE_BYTES \
  --output /private/weather-browser-receiving \
  --chrome /private/chrome/chrome-headless-shell \
  --playwright /path/to/node_modules/playwright
```

The browser operation preserves that case's acquisition times and source
identity. When it receives a different selected archive, its operation selection
records the earlier 33,416-byte archive as a historical engineering reference.
The editable package's native receiving history follows the actual selected
report and its subsequent deliveries.

Open the full `.weather.json` delivery through any independent Weather review
workspace to continue its decisions and reports. The ZIP includes the frozen
report, original source JSON and complete series CSV for ordinary file-based
review.


## Continue with the next complete source edition

The browser caller also operates the report-renewal workflow described in [REPORT_RENEWAL.md](REPORT_RENEWAL.md). Keep the first retained report and prepare a complete next source package with the same provider-case caller. Use a separate private source-case directory and explicitly select the next forecast dates and the historical period you intend to review. The resulting package retains its own actual provider requests, responses, retrieval times, decisions and archive identity.

Pass that full editable package with the original browser command:

~~~sh
node examples/browser-receiving.mjs \
  --runtime /private/original-runtime/stellar/scf-starforge-20261009 \
  --archive /private/source-case/delivery/provider-weather-report.zip \
  --archive-sha256 ACTUAL_SELECTED_ZIP_SHA256 \
  --archive-bytes ACTUAL_SELECTED_ZIP_BYTES \
  --next-package /private/next-source-case/delivery/provider-weather-editable.weather.json \
  --output /private/weather-browser-operation \
  --chrome /private/chrome/chrome-headless-shell \
  --playwright /private/node_modules/playwright
~~~

The caller first completes the original receiving, decision revision, report export and independent onward receiving. It then opens that same original review workspace, receives the next complete provider package and prepares a renewal from the report it just saved. Each decision selects the compatible next capture by its source family and variable. Its explicit UTC window comes from the selected next decision. The current working rule supplies the exact unit, threshold, aggregation and coverage requirement.

The actual browser fills and submits the complete next-edition form, displays its prior/current outcomes and creates the reviewed edition. The saved review binds the full selection before the commit. Repeating that exact accepted commit reopens the same report. The operation then:

- Downloads the complete renewed editable package, ZIP, HTML and JSON.
- Reopens the renewed ZIP through the original converter and retains every source and decision revision carried by its embedded editable history.
- Receives that whole ZIP-derived package in a third independent private workspace and compares its actual receiving map with the native map.
- Reopens the first original package and preserves the later renewed working decisions.
- Closes both active workspaces and opens their saved settings through the original CLI.

The operation saves the complete renewal review, accepted report, source receiving, independent customer receiving and output identities in its existing result file. Its private progress records retain the exact next-package selection. A continuation uses the retained package copy if the original input location is no longer available. Existing source files and accepted decisions remain the inputs for the same saved operation.
