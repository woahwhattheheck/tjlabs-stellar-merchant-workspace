# Quality follow-up

Quality follow-up compares two saved Data quality evaluations and keeps a reasoned, versioned staff decision for a later finding. Open **Quality follow-up** in the original workspace navigation.

## Compare original evaluations

Save the earlier and later evaluations in Data quality first. In Quality follow-up, choose those exact saved evaluations. Their event selections, dataset and run filters, original rule versions, adapter version and upstream specification commit remain in the comparison.

Findings correspond automatically only when the dataset, named job, run, direction and check identify one unambiguous pair. To compare different executions, open **Explicit correspondence between different runs** and select the earlier and later runs of the same job. Each run can participate in one correspondence. Changed rule definitions are visible alongside changed values and outcomes.

Repeated assertion identities remain **Correspondence needs review**. Inspect both complete original findings and choose an explicit one-to-one pair. An explicit pair must still retain the same dataset, job, direction, check, assertion identity and selected run correspondence. Other unmatched findings remain visible as **Observed only before** or **Observed only after**.

Inspect the full source-scope changes and the original source links. An absent finding, changed filter or different rule definition never creates a resolution. Enter a comparison title, then save the reviewed comparison. The save binds its exact preview hash and workspace revision. A changed workspace requires a fresh comparison.

## Assign and review follow-up

Choose **Saved comparisons and follow-up**, select the comparison, then open one matched or later-only finding. Enter the responsible person, an optional due date, a decision and its reason. Supported decisions are Open, Investigating, Accepted and Resolved.

An earlier original disposition can be referenced by its exact version. This keeps its complete historical decision in the follow-up even if the original disposition later changes. Link any existing complete result files as supporting evidence. Attach new files through the original Results workflow before linking them here.

Each follow-up save adds a version. Previous reasons, owners, dates, evidence links and earlier-disposition references remain readable. A later finding has one follow-up per saved comparison. Editing that follow-up requires its opened version. The decision records staff judgement independently from the producer assertion or quality-rule outcome.

If another action changes the saved workspace while fields are open, the desk retains the entered fields and shows the opened and current response. **Keep my edited fields on the reviewed current version** merges only edited fields after that review. The previous entered version remains available to restore. Save the current fields after reviewing this change.

## Working copies and interrupted saves

Comparison choices and follow-up fields persist in this browser, separately for each original workspace. **Working copies and complete authoring files** lets you select a saved copy, save a separate copy, download every entered field, or reopen a complete file in the same workspace on another computer.

A concurrent tab cannot overwrite a newer saved copy. Keep the entered fields, save a separate copy, or reopen the current copy. Downloaded working copies include source and version bindings; reopening them does not silently adopt a newer saved response.

Committed writes use the original workspace request journal. If a save is interrupted, use the workspace's pending-request controls to read its saved result or retry the same request. A new operation is unnecessary for a request whose original outcome can be recovered.

## Reports and complete handover

Each saved comparison offers complete JSON, CSV and printable HTML. These preserve original evaluation identities, all findings, correspondence choices, source and rule changes, follow-up histories and linked result metadata. CSV escapes spreadsheet formula prefixes. Open source and result files through the original workspace.

The original whole-workspace export contains independent `qualityFollowup` state, the original Quality state, source objects, operations and all application files. Version 8 adds the follow-up application; source inventories for earlier application versions remain explicit. Receiving older source editions remains supported. A package containing follow-up records requires its complete version 8 application.

## CLI and typed client

```sh
node cli.mjs quality-followup overview --workspace /absolute/workspace
node cli.mjs quality-followup compare --workspace /absolute/workspace --input selection.json
node cli.mjs quality-followup comparison-save --workspace /absolute/workspace --input reviewed.json --operation-id ORIGINAL_ID --revision CURRENT_REVISION
node cli.mjs quality-followup save --workspace /absolute/workspace --input followup.json --operation-id ORIGINAL_ID --revision CURRENT_REVISION
node cli.mjs quality-followup report --workspace /absolute/workspace --comparison-id SAVED_ID --format html --out new-report.html
```

A selection contains `beforeEvaluationId`, `afterEvaluationId`, optional `runPairs` and optional `findingPairs`. A reviewed save adds `title` and the preview's `expectedComparisonHash`. Follow-up input contains `comparisonId`, `rowId`, `decision`, `reason`, optional owner/date/evidence and the optional exact earlier disposition. An edit also contains its saved `id` and `version`.

The typed `QualityFollowupClient` extends the original `QualityClient`. The distribution export is `@tokenjunkielabs/scf-merchant/seller/openlineage/quality-followup`. Its methods are `qualityFollowupOverview`, `compareSavedQuality`, `saveQualityComparison`, `saveQualityFollowup` and `qualityFollowupReport`. The same five operations are declared in the original MCP and merchant tool catalog. Original revision-bound record paging adds `qualityComparisons` and `qualityFollowups`.

## Receiving this workflow

`QUALITY_FOLLOWUP_RECEIVING.mjs` performs one complete original fixture course with retained request inputs and results. It imports the original full OpenLineage fixture, retains a changed second execution, saves both evaluations through the maintained evaluator, records an earlier disposition, compares explicit runs, saves and revises follow-up, verifies exact replay, exports all reports and the complete application, then independently receives and validates that package. The course labels its source as a fixture throughout.

Customer-facing receiving also opens this actual application at desktop and narrow phone widths, operates comparison, explicit correspondence, authoring, working-copy download/reopen and report controls, checks the served source, and retains screenshots. Inspect the actual saved pixels, generated reports and complete reopened output before marking the customer workflow ready. Native results and desktop/phone receiving are separate recorded phases of the same original course.

## Complete receiving commands

Run the native course once in an owned new directory, then continue that same course through the browser:

```sh
node QUALITY_FOLLOWUP_RECEIVING.mjs /absolute/quality-followup-course
node QUALITY_FOLLOWUP_BROWSER.mjs /absolute/quality-followup-course /absolute/browser-config.json
```

The browser configuration contains the actual installed `playwrightModule` and `executablePath`, plus optional browser `args`. The native result, original source inventory, request/receipt files and saved browser origin/profile remain in the same directory. The browser captures exact intents before mutation, recovers an existing request by its original body, retains completed steps and downloads, and exports and receives the final full workspace. Reentry verifies the original selected source. Reuse the original course directory after interruption.

# Repository delivery instructions

Use the current README and the existing product's build/receiving guide. Coordinate through the original implementation and receiving owners, preserve concurrent source, and carry work through its authorized delivery.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Before calling any customer/prospect-facing application, website, dashboard, demo, report, presentation or export ready, open/run/render the exact outgoing version, look at the rendered screen or its actual screenshots, and operate the important user controls. Inspect the actual screenshare width and narrow/mobile width where relevant, populated/empty/loading/error states, downloads/exports and reopening. Capturing screenshots without viewing them is insufficient. Code review, DOM counts, HTTP 200, unit checks and another worker's approval do not replace seeing the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk; do not run broad suites or build a verification product.

Include this complete instruction in delegated assignments and the active owner-controlled policy, boot, build and receiving guidance those workers actually read. Preserve all other owner controls and original operation identities. Leave historical records and third-party/vendor policies intact. Do not force restarts, create watchers or revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
