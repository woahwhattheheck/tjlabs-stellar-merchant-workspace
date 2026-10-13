# Grant reporting procedures

Prepare a complete customer reporting procedure from the original Grant case, its Source Tables project and the currently selected Starforge toolkit. The result is an ordinary saved Operating plan: ordered work, retained command registrations, explicit original inputs, expected results, owners and receiving instructions. The same plan opens in the existing editor and travels as complete JSON, readable HTML or Markdown.

## Prepare a report in Command finder

Open **Operating plans → Create Grant reporting plan**.

1. Enter the plan title, customer or programme, operating owner and reporting period label. Select the report end date. Add a start date for a period report, or leave it empty for cumulative reporting through the end date.
2. Choose the complete original Grant case JSON. The native case read/show value and the exported operations.json carry the programme, plan, records and sources used by the reporting builder.
3. Choose the complete original Source Tables project JSON. A raw planning-source project and the retained native wrapper are both supported by the maintained importer. The editable workbook handover includes this as planning-source-project.json.
4. Enter the original Grant workspace directory, original Source Tables JSON path, report output directory, receiving workspace directory and Command finder address. Use absolute paths on the computer that will perform the work. Retain the complete loopback HTTP address and its explicit port, including `:80` when that is the selected listener.
5. Describe who receives the completed report, where it belongs and how the next operator continues.
6. Select **Preview procedure**. The builder validates the complete native inputs and captures the selected toolkit catalog with the plan. Expand the ordered steps to review their original selections, commands, work and expected results.
7. Select **Create plan and open**. The complete result enters the existing Operating plans receiver and opens in its normal editor. Add actual work results, update step status and save revisions as the reporting work progresses.

The browser file picker retains the selected JSON contents. The operating paths are entered separately because a browser file selection does not disclose the original computer path. Use the original path and workspace relationship that the native commands will read.

An earlier Source Tables baseline from the same plan remains an earlier baseline. The procedure retains both complete baseline identities and the selected table editions, workbook selections, reviews, field mappings and row-binding identities. Review an intended baseline change in the original Source Tables Rebase workflow, keep the earlier project, and save the reviewed successor path and baseline in a procedure revision before native preview. The maintained Source Tables importer validates the original workbook bytes, selected cells, editions and mappings.

## Keep the preparation between sessions

Entered preparation fields are saved as you work. The original case, complete source project and captured catalog are retained with the preparation. Reopen a saved preparation from the selector at the top of the dialog.

**Download preparation JSON** produces one portable file containing all entered fields, the complete original JSON inputs and the current complete preview, when one exists. **Open preparation JSON** restores those contents under a new preparation name. A restored preparation keeps its original Operating plan identity and UTC creation time. Every complete original file is checked against its retained byte count and SHA-256; an existing preview must match the procedure generated from those exact inputs. Earlier preparations without a separate creation-time field retain the original preview time, or their preparation creation time when no preview exists.

**Copy preparation** carries the entered fields and complete source selections into a new preparation and a new Operating plan identity. Use it for the next reporting period. After a plan has been saved, the original preparation opens that same plan; further reporting work and results belong to the existing plan revision history.

If another tab saves the same preparation first, the editor retains the current entered work and identifies the conflict. **Copy preparation** saves that work under a new preparation name. The other tab's saved preparation remains available in the selector.

A source file can contain up to 32 MiB of complete UTF-8 JSON. The complete portable preparation can contain up to 96 MiB. Complete Operating plans retain the existing 32 MiB limit. Download the portable preparation when moving to another computer, browser or listener address. Keep the same host spelling and port when reopening existing browser preparations. The complete preparation preserves its original plan ID and creation time through browser and CLI creation.

## Review and distribute the complete result

The preview offers three result downloads:

| Download | Use |
| --- | --- |
| Complete plan JSON | Save grant-reporting-plan.json in the entered report output directory, then receive the original plan and consecutive saved revisions in another Operating plans workspace or the existing Grant-case receiver. |
| Readable HTML | Review or share the complete ordered procedure, its inputs, commands and expected results. |
| Markdown | Keep the complete procedure with operating documentation and review material. |

The preparation JSON has a separate purpose: reopening the original case, source-project and catalog inputs used to create the plan. The ordinary Operating plan JSON remains the shared procedure format.

Repeating preview without changing an input reopens the exact prepared result. Changing a prepared input gives the next preview its own plan identity, so an already downloaded procedure keeps its original contents. Repeating **Create plan and open** uses the existing receiver's retained-history comparison.

Use **Use current source catalog** when intentionally preparing against a refreshed toolkit. The existing Operating plans registration comparison remains available after creation; it identifies changed registrations while keeping the saved original selection.

## Native work and receiving

Save the complete plan at the exact native filename shown in the preview, then perform its generated steps in order using the entered workspaces and paths. For generated headless Grant commands, close the original Grant listener first; reopen that same workspace and browser address when returning to its page. Native reporting capture and the original grant-procedures commands use the managed client lifecycle described below. The procedure retains the original case and saved plan selections, the Source Tables project and its baseline, the reporting period and the selected native registrations.

Record the completed native command result or reviewed output in the corresponding step, then save a plan revision. Export the complete plan JSON for the receiving operator. The original Grant-case receiver attaches that existing plan to its case; the complete Grant case, source tables and reporting outputs continue through their maintained native receiving paths.

The workbook process is described in [WORKBOOK_HANDOVER.md](../../../scf_2026/sf47_budget_model/workspace/WORKBOOK_HANDOVER.md). Generic procedure editing, historical revisions and source-registration comparison are described in [OPERATING_PLANS.md](./OPERATING_PLANS.md).

## Builder interface

The shared asynchronous createGrantReportingPlan(input) function accepts these original inputs:

| Field | Value |
| --- | --- |
| catalog | Complete catalog from the selected Command finder toolkit. |
| case | Complete native Grant case read/show value or operations.json export. |
| sourceProject | Complete original Source Tables project or its retained native wrapper. |
| paths | workspace, sourceProject, outputDirectory, receivingWorkspace and commandFinderUrl. |
| id | Stable new Operating plan identifier. |
| title, customer, period, owner, receiving | Entered procedure fields. |
| asOfDate | Required report end date in YYYY-MM-DD form. |
| startDate | Optional period start date; omission selects cumulative reporting. |
| savedAt | Optional explicit UTC creation time for reopening the same prepared result. Portable preparations retain it as planCreatedAt. |
| sourceRoot, sourceSelection | Optional original checkout and recipe for the native catalog-comparison step. Installed browser preparations normally omit these. |

Await the function: the original Source Tables importer checks complete retained source and workbook material. The return value uses the maintained stellar-forge.operating-plan.v1 model, including its original registration snapshots and complete initial revision.

## Create the same procedure from the command line

The original installed command accepts the same complete preparation downloaded by the browser:

~~~sh
starforge grant-reporting-plan create \
  --input /absolute/inputs/reporting-preparation.json \
  --out /absolute/reports/period-01/grant-reporting-plan.json
~~~

Set the preparation's output directory to /absolute/reports/period-01 before its preview. The CLI output must match that directory's grant-reporting-plan.json so the retained procedure commands open the intended file. Existing output files are preserved. Reopening a completed creation uses its original output and the normal Operating plans read/edit/receive commands.

The complete preparation already contains its selected toolkit catalog. An explicit --catalog must match that complete catalog exactly. Keep that selection when using the CLI; use **Use current source catalog** and create a new preview in the browser when deliberately changing the toolkit. All original UTF-8 file contents are checked against their retained bytes and SHA-256 before the saved preview is regenerated. The preview must match the complete plan rebuilt from those original inputs.

The command also accepts one full input JSON with catalog, case, sourceProject, paths, stable id, savedAt and the entered customer/reporting fields listed above. A complete native input without a retained catalog can use --catalog COMPLETE_CATALOG.json or the maintained --source-root / --selection loader to select its toolkit. An input that already contains a catalog keeps that catalog; use the editor to prepare an intentional source change. The older compact reference format and its selected archive, Installation, task outcome and explicitly formatted table files remain supported by this same command.

The complete creator is exported as @tokenjunkielabs/starforge-merchant/operator/grant-reporting. Its prepareGrantReportingPlan function returns the plan, complete normalized selection and retained procedure filename. The source entry discovery/grant-reporting.mjs forwards to the same maintained grant-reporting-core.mjs; both expose the complete input helpers and grantReportingProcedureFile. The original compact builder remains exported as @tokenjunkielabs/starforge-merchant/operator/grant-reporting-plan. Both create the original OperatingPlan model and leave every generated step planned.

The original preparation retains file-byte hashes separately from the normalized native case/project hashes shown in the procedure. On the operating host, compare the actual selected paths with the retained original files before recording their receiving results. Native table edition, mapping, binding, review and workbook identities are retained explicitly; a stale review or baseline remains visible.

## Capture the running case into a complete preparation

Use `starforge grant-reporting-plan capture` on the original operating computer when the case already runs in the managed Grant application. Capture reads that selected case, the complete original Source Tables JSON and the selected toolkit catalog, then builds the same portable preparation and canonical Operating plan used by Command finder.

Keep the existing private client binding with the operator. Its `directory`, `scenarioFile` and `pythonExecutable` select the original managed workspace and source. With `allowStart` omitted or false, the client borrows the running application. Closing that connection drains its admitted reads and leaves the application running. Explicit `allowStart: true` permits the maintained launcher to start the selected service when needed; the client closes only the service it starts. Capture checks the reviewed source selection when opening and finishes this lifecycle before publishing its completed directory. The portable preparation retains the operating selections and complete inputs; the private launch record and access token stay with the original client.

Create a report-fields file such as:

~~~json
{
  "id": "reporting-period-01",
  "title": "Period 01 grant reporting",
  "customer": "Selected customer or programme",
  "period": "Period 01",
  "owner": "Recording operator",
  "receiving": "Return the complete procedure and original case delivery to the selected receiving workspace.",
  "startDate": "2026-10-01",
  "asOfDate": "2026-10-31",
  "receivingWorkspace": "/absolute/private/receiving-grant-workspace",
  "commandFinderUrl": "http://127.0.0.1:8846"
}
~~~

Use the actual report dates, owner and listener address. Required report fields are `id`, `title`, `asOfDate`, `receivingWorkspace` and `commandFinderUrl`. The optional `savedAt` fixes the Operating plan's original UTC creation time; otherwise capture selects and retains it once. Omit `startDate` for cumulative reporting. Keep the plan ID for that preparation; use a new ID and output directory for a different prepared report.

Run the complete capture against the selected case and reviewed current version:

~~~sh
starforge grant-reporting-plan capture \
  --binding /absolute/private/original-client.json \
  --case "$GRANT_CASE_ID" \
  --expected-version "$GRANT_CASE_VERSION" \
  --source-project /absolute/inputs/planning-source-project.json \
  --input /absolute/inputs/report-fields.json \
  --catalog /absolute/inputs/selected-toolkit-catalog.json \
  --out /absolute/reports/period-01
~~~

Use an existing ordinary parent directory and a new output directory. The workspace path comes from the inspected client binding; the source-project path comes from the complete selected file; the report output directory comes from `--out`. The fields file supplies the receiving workspace and exact loopback HTTP address, including its explicit port. To load the toolkit from a selected checkout instead of a catalog file, replace `--catalog` with `--source-root /absolute/checkout --selection PRODUCT`. The preparation retains that checkout and selection for the plan's registration-comparison step, including when reopened in the browser. **Use current source catalog** deliberately replaces the catalog and clears the earlier checkout selection.

Capture brackets the operation with complete case reads and checks the exact Source Tables file again before completing. `--expected-version` selects the reviewed case version; when omitted, the first complete native read selects it. A case or original-file change requires a new reviewed capture. The selected source editions, workbook selections, mappings, reviews and planning baseline pass through the same maintained importer and reporting builder as browser creation.

The completed output contains:

| File | Complete retained result |
| --- | --- |
| `reporting-preparation.json` | Portable preparation with all report fields, full original case, Source Tables and catalog files, their byte counts and hashes, and the complete canonical preview. |
| `grant-reporting-plan.json` | The same Operating plan JSON, with its retained ID, UTC creation time and original registration selections. |
| `grant-reporting-plan.html` and `grant-reporting-plan.md` | Complete readable handovers rendered from that same Operating plan. |
| `capture.json` | The capture's original selections, native read metadata and complete output identities. |
| `grant-procedure.json` | Present when `--procedure-selection` is supplied; the existing native receiver's complete reviewed procedure for this case. |

Open a completed capture without reconnecting to the application:

~~~sh
starforge grant-reporting-plan capture-show \
  --directory /absolute/reports/period-01
~~~

The inspector checks the frozen files and their complete identities. Moving a completed directory preserves the original command paths inside the preparation and plan; choose a new preparation when intentionally changing those operating paths. In Command finder, **Open preparation JSON** opens `reporting-preparation.json` with the original plan ID, creation time, original files and complete preview. The existing `create` command also accepts this portable format; the captured directory already contains its native `grant-reporting-plan.json`, so use that complete result and `capture-show` when continuing this capture. Keep a completed capture unchanged. Review revised inputs in a new preparation and output directory.

The completion manifest is written after all declared members. If publication is interrupted, retain that original directory. A complete `reporting-preparation.json` can still reopen the captured inputs in Command finder. `capture-show` requires both the complete manifest and all declared members; a partial directory remains available alongside that portable preparation. Keep a partial directory for recovery and choose a new directory for a new native capture.

### Prepare, save and deliver through the original receiver

To prepare the case attachment during capture, add `--procedure-selection /absolute/inputs/procedure-selection.json`. This is the existing `grant-procedures prepare` selection: a named `actor`, optional `note` and `selectedRevision`, an optional preceding `parentSourceId`, and explicit `sourceIds`, `tables`, `editions` and `stepLinks`. A local-original table uses its complete absolute `file` path. Installation and task-outcome choices name their original record and revision. Use the selected case's actual source IDs and reviewed step links; the [Grant procedures guide](../../../scf_2026/sf47_budget_model/workspace/GRANT_PROCEDURES.md) describes each field.

The optional preparation leaves the complete reviewed `grant-procedure.json` in the capture directory. Save it with the original command and one retained request identity:

~~~sh
starforge grant-procedures save \
  --binding /absolute/private/original-client.json \
  --procedure /absolute/reports/period-01/grant-procedure.json \
  --request-id "$PROCEDURE_SAVE_ID" \
  --operation /absolute/private/period-01-save
~~~

The original writer checks the prepared case version and selected sources, adds the complete procedure as a case source, and independently reopens its bytes. Retain the returned `complete.native.recordId` as the procedure source ID and `complete.native.version` as the resulting case version. An interrupted save resumes with the same command, operation directory and request ID plus `--resume`. Preserve the exact prepared file for that continuation.

If capture omitted a procedure selection, run the existing `grant-procedures prepare` with the captured `grant-reporting-plan.json`, the same binding and case, and the reviewed selection before saving.

Export the complete saved case and procedure:

~~~sh
starforge grant-procedures export \
  --binding /absolute/private/original-client.json \
  --case "$GRANT_CASE_ID" \
  --source "$PROCEDURE_SOURCE_ID" \
  --expected-version "$PROCEDURE_CASE_VERSION" \
  --out /absolute/deliveries/period-01

starforge grant-procedures inspect \
  --directory /absolute/deliveries/period-01
~~~

Use the saved source ID and the reviewed current case version from the native return. If the case has advanced since that save, review its current version before exporting. The delivery contains the original case ZIP, full procedure and Operating plan, selected source tables and native editions, readable handovers and complete member hashes. Continue through the original `grant-procedures receive` command and the [two-operator receiving programme](../../../scf_2026/sf47_budget_model/workspace/GRANT_PROCEDURES_RECEIVING.md), retaining its actual case mapping and complete revision history.

## Attach the complete procedure to the customer case

Open the same Grant case and choose **Operating procedures**. Prepare the complete Operating plan with the actual case sources, Source Tables selections and original Installation or task-outcome editions. Review every selected step link, then save it through the case's original actor, version and request controls.

The original command-line route is starforge grant-procedures. Its prepare, save, show, export, inspect and receive commands use the same native Grant client and complete procedure format. A private client binding selects the actual managed workspace; it is kept with the operator rather than placed in the public procedure.

Export the entire procedure delivery directory when returning the work. It contains the original Operating plan JSON and readable handovers, selected source tables and native editions, their full verification, and the complete original Grant case. The receiving operator imports this through the existing Grant receiver at the selected receiving workspace. Preserve the actual destination plan/case mapping and the original procedure parent chain.

When the next operator returns a saved revision, reopen the original case and choose its previous procedure as the parent. The original OperatingPlan receiver verifies the full prefix history before accepting the new revision. Repeat an interrupted save or import with the same request ID and exact retained input; its native receipt determines the outcome.

See [Grant operating procedures](../../../scf_2026/sf47_budget_model/workspace/GRANT_PROCEDURES.md) for the complete native selection and command contract, and [complete case receiving](../../../scf_2026/sf47_budget_model/workspace/GRANT_PROCEDURES_RECEIVING.md) for its original two-operator continuation.
