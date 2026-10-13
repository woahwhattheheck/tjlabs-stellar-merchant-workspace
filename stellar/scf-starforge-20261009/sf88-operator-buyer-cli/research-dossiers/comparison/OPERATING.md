# Model, platform and architecture comparisons

Use **Comparisons** in the existing Research workspace to carry a named question through an explicit comparison protocol, immutable candidate editions, original measured runs, researcher judgments and a reviewed decision. Each accepted action remains in the original dossier revision history. Its complete original run JSON and attachment bytes live in the existing dossier content store and travel in the full dossier portable export.

## Start with the actual question and sources

Open the maintained Research application and select the existing workspace and dossier. Retain the relevant source editions through the original source controls first. A source reference in a comparison selects an exact retained edition and a page, row or other locator. Its question must match the comparison's original question.

Open **Comparisons**, then create a comparison case. Enter the decision or research purpose, population and operating scope. Name each criterion and its meaning, unit and direction. Select **MEASURED** for a value produced by the original evaluation; select **JUDGMENT** for a named person's assessment. A criterion may be descriptive. Keep missing or unavailable observations explicit.

Scope should identify the real comparison conditions. Depending on the work, these include population and exclusions, market, evaluation period, prospective or concurrent design, currency and price year, runout, operating constraints, hardware, supported tasks and source-use conditions. A criterion label alone does not establish comparability.

Enter the actual operator identifier and name, then prepare the complete request. Inspect the saved JSON, including the original question, sources and expected dossier revision. Receive that exact request to create the first case edition.

## Define complete candidates

Select the case and create each **Model**, **Platform** or **Architecture** candidate. Record its original release or configuration edition, description and complete JSON configuration. Link the retained method or product source editions that support the selection.

Save a later candidate edition when its configuration changes. The preceding edition and runs remain available. A run binds an exact case and candidate edition; changing a displayed name never relabels existing measurements.

Editing the case creates another protocol edition. Select or create candidate editions deliberately for that protocol. Earlier case editions and their reports remain reachable in **Case editions**. Keep results under their original protocol when the population, measurement definition or criterion changes.

## Receive an original measured run

Use **Import measured run** and select the exact candidate edition. Upload the evaluator's complete UTF-8 JSON envelope with schema `sf88-research-comparison-run/v1`. The screen preserves the original filename, complete byte count and SHA256 while showing a readable run and attachment summary. Download the selected original when reviewing its full producer result.

The envelope contains:

- A stable `externalRunId`; `kind` equal to `SOURCE_NATIVE`, `IMPORTED_MEASUREMENT` or `TRAINING_FIXTURE`; actual status and start/end times; and elapsed milliseconds or an explicit null.
- The original engine name, version, full command argument array, runtime and configuration objects.
- Input cohort and protocol identities, full input definition, original source references and original artifact identifiers.
- Every metric's identifier, measured criterion, label, original value, unit, definition, denominator object, cohort reference and supporting artifact identifiers.
- The complete producer result object, limitations and all original attachments.

An attachment contains `id`, safe relative `path`, `role`, `mediaType`, exact `bytes`, SHA256 and canonical `bodyBase64`. The receiver verifies every byte and declared reference. The complete run JSON is limited to 64 MiB; all decoded attachment bytes together are limited to 64 MiB. Retain a larger original result through the existing source workflow and keep its exact source references in the run definition; do not silently omit the source or call an incomplete bundle complete.

A metric's value is a finite number, exact decimal string, or null with a nonempty `undefinedReason`. Units must match a unit declared by the measured criterion. A failed or cancelled run remains an explicit retained outcome. Training fixtures keep that label in the report.

The workspace preserves the producer's measurements. Domain evaluators own the actual calculation and its input selection. Before combining two observations in research, inspect their retained cohort, denominator, units, period, method and source. Run output may include paired uncertainty, subgroup diagnostics, calibration or sensitivity results in its complete producer result and attachments without forcing those structures into a generic score.

Prepare and inspect the original import request, then receive it. The original raw JSON and each member become independently downloadable. Reusing an external run identifier for the same exact case and candidate reuses the accepted run only if the complete raw identity matches.

## Record judgments and decisions

Create a **Named judgment** for a judgment criterion. Select the exact candidate edition, record the researcher's assessment, reviewer, ISO timestamp and rationale, then attach the original sources and relevant retained run IDs. The backend checks that every referenced run belongs to that candidate and protocol.

Create a **Decision** after reviewing the comparison. List exact candidate version IDs, run IDs and judgment version IDs. State the recommendation, reasoning and limitations, and identify the reviewer and time. Runs and judgments must belong to this protocol and selected candidates; a judgment's supporting runs must also be included in the decision. The complete original records are available from the paged tables and their details controls.

The readable report places measured observations, named judgments and decisions in separate sections. It displays candidate names and releases, original values and units, explicit undefined reasons and the complete row definitions. Paging affects the screen only; the exported report contains the complete selected report model.

## Work safely across tabs and interrupted replies

Working copies use the Research app's existing browser draft database. Form text, source selections, incomplete configuration JSON and the full selected run are saved as entered. A working copy stays attached to its original workspace, dossier, case and protocol edition.

The complete request is saved before the first write. Once prepared, the request stays fixed. **Receive original request** retries that same request ID and body. The backend checks accepted replay before enforcing a new revision, so a lost reply can be recovered after other work has advanced the dossier.

If the request has never been accepted and its revision is stale, inspect the latest saved dossier and deliberately prepare a new working copy against that basis. Preserve the previous request for recovery. An explicit basis change does not rewrite a frozen request.

Two tabs use compare-and-swap draft revisions. A clean draft refreshed from another tab adopts that tab's complete body and revision together. A conflicting local write retains the full entered draft and offers complete download or preservation as a separate working copy. Download a saved working copy before closing a tab with a storage error. Reimporting different content under an existing local identity preserves a separate copy with the original request intact.

A working-copy download carries local editing state. The full dossier portable export carries accepted history and original source bytes. Use both when handing over unfinished work.

## Downloads and complete handover

Use the case report controls for:

- **JSON**: the complete selected report model, exact case/candidate editions, measured records, judgments, decisions, operations and retained source descriptors.
- **HTML**: a readable offline report with the complete model included and explicit original run provenance.
- **CSV**: complete measured and judgment rows for review in a spreadsheet, with formula-leading text protected.

Use each run's **Original run** and artifact links to retrieve the original bytes. The browser verifies the declared whole-file SHA256 and byte count before saving a selected run member.

Use the original dossier **Export** to transfer its complete revision history and every retained content blob, including raw runs and attachments. A comparison report is a readable view of that dossier. Continue from the full dossier export when the receiver needs an editable working project.

Extract/open the receiving package, inspect the actual report and original files, reopen the dossier in the receiving workspace, and continue with a named action. Follow [RECEIVING.md](RECEIVING.md) for the complete source-native course.

## Original CLI and typed client

From this module directory, the complete local command is:

~~~sh
node cli.mjs read --store /absolute/original/research-store --id DOSSIER_ID --section cases
node cli.mjs report --store /absolute/original/research-store --id DOSSIER_ID --case CASE_ID --revision REVISION
node cli.mjs review --store /absolute/original/research-store --id DOSSIER_ID --file /absolute/private/original-request.json
node cli.mjs export --store /absolute/original/research-store --id DOSSIER_ID --case CASE_ID --revision REVISION --format html --out /absolute/private/comparison.html
node cli.mjs file --store /absolute/original/research-store --id DOSSIER_ID --run RUN_ID --artifact ARTIFACT_ID --revision REVISION --out /absolute/private/original-member
~~~

Replace explanatory uppercase values with the actual retained identities. Output files are written exclusively. Use `--connection-file /absolute/private/original-connection.json` and, when required, `--workspace-directory /absolute/original/workspace` instead of `--store` to borrow the existing authenticated Research listener.

The original Research CLI also accepts the `comparison` command family. `ResearchWorkspaceClient` exposes `comparison`, `comparisonReport`, `reviewComparison`, `exportComparison` and `comparisonFile`. Complete types are in [client.d.mts](client.d.mts). The client uses the existing inspected connection and request lifetime; transport failure never generates another review request.

Pages after offset zero require a fixed dossier revision. Keep the case edition, run and file identities fixed while paging or downloading a reviewed result. Select the latest revision explicitly when beginning another review.

## Generic product and private research

This module contains the reusable comparison application. Customer inputs, personal cohort data, commercial proposals and prospect communications belong in their authorized private workspaces. Domain-specific study protocols and evaluator source remain owned by their original research teams. The generic application accepts their complete, versioned results without changing their scientific method.
