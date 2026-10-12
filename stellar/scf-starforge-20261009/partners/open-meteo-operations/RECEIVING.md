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
3. Change the operating window, threshold, coverage, owner, disposition or notes, then **Save decision revision**. Each imported original revision is labelled separately from its current local revision.
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
