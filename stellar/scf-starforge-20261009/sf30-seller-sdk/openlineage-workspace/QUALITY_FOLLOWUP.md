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

If another action changes the saved workspace while fields are open, the desk retains the entered fields and shows the opened and current response. **Keep my edited fields over reviewed current fields** merges only edited fields after that review. The previous entered version remains available to restore. Save the current fields after reviewing this change.

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
