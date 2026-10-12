# Retained release plans for economic briefing projects

A release watch keeps an economic project ready for its next analyst edition. Capture the original FRED release metadata and vintage history, select the series or an existing briefing template, review the resulting catch-up plan, and acquire the observation vintages you choose. Each acquired edition joins the project's existing source inventory, analyst review, recurring briefing and merchant publication workflow.

The browser workspace, installed operator client and native commands all use the same project state and operation IDs. The runtime entry points are in [project.mjs](../project.mjs); complete project and transfer interfaces are in [project-types.d.mts](./project-types.d.mts). The native command runner is [project-cli.mjs](./project-cli.mjs).

## Source dates and observation dates

A release calendar date is published by the underlying source; it can precede data availability on FRED or ALFRED. The release acquisition requests dates with no data as well, retaining upcoming dates for the schedule. See the official [release/dates documentation](https://fred.stlouisfed.org/docs/api/fred/release_dates.html).

Series vintage history identifies dates when the series gained new values or revisions. The planner uses the original returned vintage dates to select observation acquisitions. See the official [series/vintagedates documentation](https://fred.stlouisfed.org/docs/api/fred/series_vintagedates.html).

A saved plan carries the metadata date, both source intervals, calendar changes, vintage changes, source meaning changes, coverage, and its exact observation selections. A planned observation selection contains the original series set, as-of date, observation start and end, page size and row capacity. The acquisition passes that complete selection into the original FRED observation provider.

## Start from the existing private project

Use the existing installed FRED command and existing key environment binding. These project commands share the current economic workspace and installation; they do not require a second product instance.

Read the project revision and current original captures:

~~~sh
starforge fred show --project /private/economic-project
starforge fred release-captures --project /private/economic-project
starforge fred release-watches --project /private/economic-project
~~~

For each new mutation, use the revision currently returned by the project. Choose one operation ID and retain it with that action. When continuing an interrupted operation, reuse that same ID, original expected revision and original inputs.

The example selections below are editable configuration. Choose intervals that cover the watched baseline through the metadata date you are acquiring.

## 1. Retain complete release source data

A release selection file has this shape:

~~~json
{
  "series": ["CPIAUCSL", "GDP", "UNRATE"],
  "asOf": "2026-10-12",
  "calendarStart": "2026-01-01",
  "calendarEnd": "2026-12-31",
  "vintageStart": "2026-01-01",
  "vintageEnd": "2026-10-12",
  "pageSize": 1000,
  "maxRows": 100000
}
~~~

Acquire through the project's existing key binding:

~~~sh
starforge fred release-acquire --project /private/economic-project --id release-source-20261012 --expected-revision REVISION --selection /private/release-selection.json
~~~

The result includes releaseCaptureId, its source summary and the committed revision. The acquisition retains original provider response bodies, credential-free requests, provider response hashes and actual retrieval times. A restart continues the same paginated request graph from the original acquisition directory.

To receive an already captured release source:

~~~sh
starforge fred release-import --project /private/economic-project --id release-import-20261012 --expected-revision REVISION --input /private/original-release-capture.json
~~~

The importer validates and stages the complete source before adopting it into the project. If the project operation is pending or its successful response was lost, the continuation can use the small retained identity:

~~~sh
starforge fred release-import --project /private/economic-project --id release-import-20261012 --expected-revision ORIGINAL_REVISION --capture RELEASE_CAPTURE_SHA
~~~

The continuation must identify that original import operation. Supplying both the body and the ID requires them to agree. An ordinary source read selects a capture already committed to the project:

~~~sh
starforge fred release-source --project /private/economic-project --capture RELEASE_CAPTURE_SHA --out /private/release-source-copy.json
~~~

## 2. Save a watch

A series-only watch file can be saved before the project has an analyst briefing:

~~~json
{
  "name": "Monthly macro briefing",
  "series": ["CPIAUCSL", "GDP", "UNRATE"],
  "observationStart": "2024-01-01",
  "observationEnd": "as_of",
  "baselineAsOf": "2025-12-31",
  "catchUp": "all_vintages",
  "pageSize": 1000,
  "maxRows": 1000000
}
~~~

~~~sh
starforge fred release-watch-save --project /private/economic-project --id macro-watch-20261012 --expected-revision REVISION --watch-config /private/macro-watch.json
~~~

To bind the watch to an existing recurring briefing, replace the series field with templateId from the project's saved template inventory. The watch retains the complete original template and its original review binding. If you supply both series and templateId, the selected series must match every template series.

Choose all_vintages to retain each applicable missed vintage as a separate acquisition. Choose latest_vintage to select the latest available source vintage for the current catch-up. Each watch is immutable and has an ID beginning fred-release-watch-. Save a new watch when its series, baseline, template, coverage or catch-up policy changes.

## 3. Review and save the complete plan

Select the watch and the acquired release snapshot. Add a previous release snapshot when comparing against an earlier retained source.

~~~sh
starforge fred release-plan-preview --project /private/economic-project --watch WATCH_ID --after-capture RELEASE_CAPTURE_SHA --section acquisitions --limit 100 --out /private/release-plan-preview.json
~~~

The preview returns projectId, revision, previewId and a page of the plan. The preview ID binds the entire plan and completion snapshot. Paging changes the returned section, while the same full plan remains selected.

Use these sections to review parallel aspects of the source:

| Section | What the rows contain |
| --- | --- |
| acquisitions | Explicit observation selections, triggering dates and reasons |
| calendarChanges | Added, removed, changed and newly covered calendar dates |
| vintageChanges | Newly discovered, retained-span and coverage changes |
| events | Source vintage dates with their reasons and completion state |
| schedule | Calendar dates with upcoming or published phase |

Follow nextOffset until it is null to read all rows of a section. Every page retains the same full plan ID, source IDs, metadata date, coverage and summary. Meaning changes, source changes and requiredSourceSelections remain in the full saved plan download.

Save the reviewed preview with the same watch and source choices:

~~~sh
starforge fred release-plan-save --project /private/economic-project --id macro-plan-20261012 --expected-revision REVISION --watch WATCH_ID --after-capture RELEASE_CAPTURE_SHA --preview-id PREVIEW_SHA
~~~

If the preview included --before-capture, include the same flag when saving. The project checks the preview before creating a pending mutation, and again inside the original project transaction. A source or completion-history change requires reviewing a new preview.

Download the full retained plan:

~~~sh
starforge fred release-plan-file --project /private/economic-project --plan PLAN_ID --out /private/macro-release-plan.json
~~~

The full descriptor includes all plan sections, full watch, required source selections and completedAsOf snapshot. An incomplete catch-up interval provides the complete source selection needed to acquire the missing span. Retain that returned selection, acquire it as a new release source, and preview the watch against the resulting snapshot.

## 4. Acquire a chosen observation vintage

Choose an asOf date from the saved plan's acquisitions rows:

~~~sh
starforge fred release-vintage-acquire --project /private/economic-project --id macro-vintage-20261012 --expected-revision REVISION --plan PLAN_ID --as-of PLANNED_DATE
~~~

The original observation provider acquires that selection and adopts the resulting capture into the original project's economic source inventory. The result returns captureId, the exact selection and a catchUp record containing watchId, planId, asOf, captureId and selection.

Use another operation ID for another chosen date. Reusing the original operation ID returns its committed result. Choosing the same already completed plan/date under another operation can reuse the retained capture.

Completion applies to the original watch and exact release source snapshot. When a later source snapshot reveals a newly available series vintage on an already-seen date, the later plan can include that date again. Saving a plan retains the completion snapshot that existed before its original save operation; future acquisitions do not rewrite that plan.

SIGINT and SIGTERM preserve acquisition progress. Read the existing project's pending action and continue it with its original operation identity. The workspace exposes the source's response count, selection and retained provider retry time when present.

## 5. Prepare the next analyst edition

The acquired capture ID is an ordinary project source ID. Select it in the workspace, review the series meaning and values, and use the existing saved template to preview and save a successor briefing. The [recurring briefing guide](../TEMPLATES.md) covers rolling windows, baseline selection, original missing values and the complete comparison export.

The resulting saved analyst review uses the existing publish command and merchant configuration. Keep the same commercial workflow for the actual advertised briefing member. Release watches and calendar plans remain reusable project operations that prepare the next analyst edition.

## Portable receiving and reopening

Use the original project export and receive commands:

~~~sh
starforge fred export --project /private/economic-project --out /private/economic-project-with-releases.json
starforge fred receive --project /private/received-economic-project --source /private/economic-project-with-releases.json
starforge fred release-watches --project /private/received-economic-project
starforge fred release-plan --project /private/received-economic-project --plan PLAN_ID --section acquisitions
~~~

A project with release activity exports stellar-forge.fred-project-bundle.v4. Its identity contains exactly schema, state, captures, publicationPlans, briefings, releaseCaptures and releasePlans. The bundleSha256 hashes those fields. Original economic captures, reviews, analyst files and payment plan inputs remain in the same transfer.

The state keeps compact release source summaries, complete immutable watches, plan summaries and catch-up records. The transfer includes every full original release capture and full saved plan. A watch can exist before any analyst report, so the v4 briefings array can be empty.

Receiving validates the full source inventories, normalized summaries, watch/template links, saved plan against its original source captures, and each acquired observation's exact planned selection. Its saved completion dates must correspond to earlier same-watch, same-snapshot acquisition operations. Reopening reconstructs the original plan and source identities.

Projects without release activity retain their existing v1, v2 or v3 export structure and identity. Project transfer uses the original 256 MiB bundle capacity; individual original release captures and full plans use 64 MiB capacity. File exports are create-only, so choose a fresh destination when retaining another edition.

## Programmatic entry points

Import runtime functions from ../project.mjs. The type-only FredReleaseProjectApi interface describes every release project method. All mutations use directory, id and expectedRevision; read operations preserve the current project revision in their inventory or page envelope.

| Operation | Runtime function |
| --- | --- |
| Source inventory / raw source | listFredReleaseCaptures / getFredReleaseCapture |
| Import / acquire release source | importFredReleaseCapture / acquireFredReleaseCapture |
| Watch inventory / save watch | listFredReleaseWatches / saveFredReleaseWatch |
| Preview / save plan | previewFredReleasePlan / saveFredReleasePlan |
| Read page / full saved JSON | getFredReleasePlan / downloadFredReleasePlan |
| Acquire selected observation vintage | acquireFredPlannedVintage |

The installed browser client and MCP operator use these same server operations. Full-file selectors identify release-source by releaseCaptureId and release-plan by planId, retaining the existing file-read and download lifecycle.
