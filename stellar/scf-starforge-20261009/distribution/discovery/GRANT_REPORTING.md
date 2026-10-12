# Grant reporting procedures

Prepare a complete customer reporting procedure from the original Grant case, its Source Tables project and the currently selected Starforge toolkit. The result is an ordinary saved Operating plan: ordered work, retained command registrations, explicit original inputs, expected results, owners and receiving instructions. The same plan opens in the existing editor and travels as complete JSON, readable HTML or Markdown.

## Prepare a report in Command finder

Open **Operating plans → Create Grant reporting plan**.

1. Enter the plan title, customer or programme, operating owner and reporting period label. Select the report end date. Add a start date for a period report, or leave it empty for cumulative reporting through the end date.
2. Choose the complete original Grant case JSON. The native case read/show value and the exported operations.json carry the programme, plan, records and sources used by the reporting builder.
3. Choose the complete original Source Tables project JSON. A raw planning-source project and the retained native wrapper are both supported by the maintained importer. The editable workbook handover includes this as planning-source-project.json.
4. Enter the original Grant workspace directory, original Source Tables JSON path, report output directory, receiving workspace directory and Command finder address. Use paths on the computer that will perform the work.
5. Describe who receives the completed report, where it belongs and how the next operator continues.
6. Select **Preview procedure**. The builder validates the complete native inputs and captures the selected toolkit catalog with the plan. Expand the ordered steps to review their original selections, commands, work and expected results.
7. Select **Create plan and open**. The complete result enters the existing Operating plans receiver and opens in its normal editor. Add actual work results, update step status and save revisions as the reporting work progresses.

The browser file picker retains the selected JSON contents. The operating paths are entered separately because a browser file selection does not disclose the original computer path. Use the original path and workspace relationship that the native commands will read.

An earlier Source Tables baseline from the same plan remains an earlier baseline. The procedure includes its explicit comparison and rebase work before native calculation. The maintained Source Tables importer validates the original workbook bytes, selected cells, editions and mappings.

## Keep the preparation between sessions

Entered preparation fields are saved as you work. The original case, complete source project and captured catalog are retained with the preparation. Reopen a saved preparation from the selector at the top of the dialog.

**Download preparation JSON** produces one portable file containing all entered fields, the complete original JSON inputs and the current complete preview, when one exists. **Open preparation JSON** restores those contents under a new preparation name. A restored preview keeps its original Operating plan identity and is checked against the complete saved inputs before use.

**Copy preparation** carries the entered fields and complete source selections into a new preparation and a new Operating plan identity. Use it for the next reporting period. After a plan has been saved, the original preparation opens that same plan; further reporting work and results belong to the existing plan revision history.

If another tab saves the same preparation first, the editor retains the current entered work and identifies the conflict. **Copy preparation** saves that work under a new preparation name. The other tab's saved preparation remains available in the selector.

A source file can contain up to 32 MiB of complete UTF-8 JSON. The complete portable preparation can contain up to 96 MiB. Complete Operating plans retain the existing 32 MiB limit. Download the portable preparation when moving to another computer, browser or listener address.

## Review and distribute the complete result

The preview offers three result downloads:

| Download | Use |
| --- | --- |
| Complete plan JSON | Receive the original plan and consecutive saved revisions in another Operating plans workspace or the existing Grant-case receiver. |
| Readable HTML | Review or share the complete ordered procedure, its inputs, commands and expected results. |
| Markdown | Keep the complete procedure with operating documentation and review material. |

The preparation JSON has a separate purpose: reopening the original case, source-project and catalog inputs used to create the plan. The ordinary Operating plan JSON remains the shared procedure format.

Repeating preview without changing an input reopens the exact prepared result. Changing a prepared input gives the next preview its own plan identity, so an already downloaded procedure keeps its original contents. Repeating **Create plan and open** uses the existing receiver's retained-history comparison.

Use **Use current source catalog** when intentionally preparing against a refreshed toolkit. The existing Operating plans registration comparison remains available after creation; it identifies changed registrations while keeping the saved original selection.

## Native work and receiving

Perform the generated steps in their saved order using the entered workspaces and paths. The procedure retains the original case and saved plan selections, the Source Tables project and its baseline, the reporting period and the selected native registrations.

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
| savedAt | Optional explicit UTC creation time for reopening the same prepared result. |

Await the function: the original Source Tables importer checks complete retained source and workbook material. The return value uses the maintained stellar-forge.operating-plan.v1 model, including its original registration snapshots and complete initial revision.
