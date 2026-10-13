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

Save the complete plan at the exact native filename shown in the preview, then perform its generated steps in order using the entered workspaces and paths. Close the original Grant listener before running the headless Grant commands; reopen that same workspace and browser address when returning to its page. The procedure retains the original case and saved plan selections, the Source Tables project and its baseline, the reporting period and the selected native registrations.

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

## Attach the complete procedure to the customer case

Open the same Grant case and choose **Operating procedures**. Prepare the complete Operating plan with the actual case sources, Source Tables selections and original Installation or task-outcome editions. Review every selected step link, then save it through the case's original actor, version and request controls.

The original command-line route is starforge grant-procedures. Its prepare, save, show, export, inspect and receive commands use the same native Grant client and complete procedure format. A private client binding selects the actual managed workspace; it is kept with the operator rather than placed in the public procedure.

Export the entire procedure delivery directory when returning the work. It contains the original Operating plan JSON and readable handovers, selected source tables and native editions, their full verification, and the complete original Grant case. The receiving operator imports this through the existing Grant receiver at the selected receiving workspace. Preserve the actual destination plan/case mapping and the original procedure parent chain.

When the next operator returns a saved revision, reopen the original case and choose its previous procedure as the parent. The original OperatingPlan receiver verifies the full prefix history before accepting the new revision. Repeat an interrupted save or import with the same request ID and exact retained input; its native receipt determines the outcome.

See [Grant operating procedures](../../../scf_2026/sf47_budget_model/workspace/GRANT_PROCEDURES.md) for the complete native selection and command contract, and [complete case receiving](../../../scf_2026/sf47_budget_model/workspace/GRANT_PROCEDURES_RECEIVING.md) for its original two-operator continuation.
