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

## Capture through Merchant agent tools

An agent connected to the installed Merchant operator can capture the same running case without shell access. The four reporting tools use the host-declared Grant workspace, the existing retained-file transport and the same native capture implementation described above.

| Tool | Operation |
| --- | --- |
| `merchant_grant_reporting_catalog` | Retain the complete installed toolkit catalog through the original Command finder loader, ready to select as a capture input. |
| `merchant_grant_reporting_capture` | Capture one reviewed case version, original Source Tables project and complete selected toolkit catalog. Return every output as an original retained file snapshot. |
| `merchant_grant_reporting_capture_inspect` | Reopen an existing capture request, validate its frozen files and complete response, and recover output retention after a lost response. |
| `merchant_grant_reporting_capture_list` | Page the retained requests for one declared workspace. Follow `nextOffset` until it is null; inspect a selected request to obtain its complete outputs. |

### Select complete original inputs

Use `merchant_grant_workspaces` to identify the original host-declared workspace alias. Use `merchant_grant_inputs` to list its declared files, then call it with each selected input alias to obtain that file's actual name, byte count and SHA-256. Read the existing case through `merchant_grant_case` and retain its original case ID and reviewed version. Call `merchant_grant_reporting_catalog` with that workspace to retain the complete catalog from the original installed Command finder loader. Use its returned snapshot `id` and `file.sha256` directly as `catalog` and `expectedCatalogSha256`. The loader uses the host's installed metadata and accepts no agent-selected checkout or executable path.

The source project is the complete original Source Tables JSON, including its baseline, source editions, workbook selections, mappings and reviews. Select the original snapshot returned by `merchant_grant_source_snapshot` or a subsequent source-edit tool: pass its complete retained `id` and `file.sha256`. The original Source Tables importer recognizes that original `stellar-forge.sf47-planning-source-agent.v1` response, validates its embedded book and matching baseline, and retains every original response byte in the portable preparation. It does not require extracting or rewriting the book in chat.

An existing `merchant_grant_workbook_handover` also supplies a complete `planning-source-project.json` companion in `files`. Select that named member's retained `id` and `file.sha256`, preserving the handover's reviewed saved-plan identity. A declared or received complete source-project file remains supported. The catalog is the complete selected toolkit catalog JSON. Both inputs are original UTF-8 files, each within the native 32 MiB bound. The agent supplies their file references and exact hashes rather than an arbitrary host path or a shortened report.

Each input reference selects exactly one of these forms:

~~~json
{"hostInput":"declared-source-project"}
{"snapshotId":"snapshot-returned-by-the-original-tool"}
{"transferId":"transfer-returned-by-the-original-committed-upload"}
~~~

Use the actual returned identifier. A reference may include `sourceWorkspace` when the original file belongs to another declared workspace; the case still belongs to the selected capture workspace. For a received file, finish the existing `merchant_grant_receive_begin`, `receive_chunk` and `receive_commit` sequence and retain its original transfer ID and complete hash. Existing snapshots use the returned `file.sha256`. The wrapper verifies the complete original bytes before staging and preserves each original filename.

The capture call takes these fields:

| Field | Selection |
| --- | --- |
| `workspace` | Original host-declared Grant workspace alias. |
| `caseId`, `expectedVersion` | Actual original operating case and its reviewed version. The version is required in the agent interface. |
| `requestId` | Stable capture request identity, 1–100 letters, numbers, dots, underscores or hyphens, starting with a letter or number. |
| `fields` | The same report-fields object used by native capture: `id`, `title`, `asOfDate`, `receivingWorkspace` and `commandFinderUrl`, with the optional reporting fields shown above. |
| `sourceProject`, `expectedSourceProjectSha256` | Original source-project reference and exact complete SHA-256. |
| `catalog`, `expectedCatalogSha256` | Original selected toolkit catalog reference and exact complete SHA-256. |
| `procedureSelection` | Optional original native procedure selection for a complete case attachment. |
| `tableInputs` | Optional complete local Source Tables inputs for that procedure selection, each with its own key, original reference and SHA-256. |

For example, assemble the call with the identities returned by the preceding reads:

~~~json
{
  "workspace": "original-grant",
  "caseId": "<original operation- identifier>",
  "expectedVersion": 37,
  "requestId": "reporting-period-01",
  "fields": {
    "id": "reporting-period-01",
    "title": "Period 01 grant reporting",
    "owner": "Recording operator",
    "period": "Period 01",
    "asOfDate": "2026-10-31",
    "receivingWorkspace": "/absolute/private/receiving-grant-workspace",
    "commandFinderUrl": "http://127.0.0.1:8846"
  },
  "sourceProject": {"hostInput": "planning-source-project"},
  "expectedSourceProjectSha256": "<complete hash returned for this source project>",
  "catalog": {"snapshotId": "<id returned by merchant_grant_reporting_catalog>"},
  "expectedCatalogSha256": "<file.sha256 returned by merchant_grant_reporting_catalog>"
}
~~~

Replace the example alias, case ID, version, dates, operator, destination and hashes with the original selected values. The receiving path and Command finder address are retained operating-plan inputs; capture does not execute that receiving destination. Workspace, staged input and capture output paths come from the host's original configuration. The agent interface accepts a complete catalog file; checkout-based catalog selection remains available through the native command.

A new request retains its exact arguments, binding selection and one plan creation time before capture. Omit `fields.savedAt` to choose that time once. An identical request reopens its own retained result; changing fields, source references, hashes or case version under the same request ID is a conflict. Review the new selection and use another request ID for a different report.

Capture brackets its reads with the same case/version and original-file checks as the native command. It borrows the original managed service when running, or may start only that host-authorized original service. The original client releases a borrowed connection and closes only a service it owns. The adapter finishes that lifecycle before returning the complete capture. Business case records remain unchanged by capture.

### Select an original procedure and local tables

The optional `procedureSelection` uses the existing native receiver's `actor`, `note`, `selectedRevision`, `parentSourceId`, `sourceIds`, `tables`, `editions` and `stepLinks`. Select actual retained sources, Installation editions and task-outcome revisions. Each complete step-link row retains `stepId`, `sourceIds`, `tableKeys`, `editionKeys` and `note`.

Within `procedureSelection.tables`, the agent may select `case-plan`, `case-source` or `preceding-procedure`. A case-source row also carries its actual `sourceId`. A preceding-procedure choice retains the original parent source selection.

For an additional local table, use `tableInputs` with a complete original input reference:

~~~json
{
  "procedureSelection": {
    "actor": "Recording operator",
    "note": "Retain the reviewed original reporting sources.",
    "tables": [
      {"key": "original-native-plan", "origin": "case-plan"}
    ]
  },
  "tableInputs": [
    {
      "key": "selected-source-project",
      "input": {"hostInput": "planning-source-project"},
      "expectedSha256": "<complete original project hash>"
    }
  ]
}
~~~

Each key is distinct across the native table selection and local table inputs. Keys use 1–128 letters, numbers, dots, underscores or hyphens, starting with a letter or number. Up to 256 local table inputs are accepted. Their supplied bytes are staged intact and passed into the original native local-table reader. The selected procedure remains the same complete `grant-procedure.json` used by the established save, export and receiving commands.

### Read the whole capture and recover its response

The capture response identifies its `requestId`, `requestSha256`, original case/version, plan ID, retained creation time and state. Each output appears in `files` as `{name, snapshot}`. The complete result includes the portable preparation, Operating plan JSON, HTML and Markdown handovers, `capture.json`, and the optional native procedure. Its inline selection summarizes the original case, plan, reporting period and book; the full table mappings and procedure verification stay in the complete output files. Output snapshots retain their original metadata and `fileRead` reference without repeating large JSON values in the tool response.

For each output, use `snapshot.fileRead` exactly as returned. It selects `merchant_grant_file_read` with the original workspace, snapshot ID and complete SHA-256. Continue with the returned read ID and next byte offset until the whole file is read, retaining that same snapshot and hash. The existing `merchant_grant_snapshot` and `merchant_grant_rows` calls inspect JSON values and named arrays; their page presentation does not replace the complete file.

Keep the request ID after a lost response and call `merchant_grant_reporting_capture_inspect` with the same workspace and request ID. A completed capture is reopened from its frozen members and original output snapshots. This path does not depend on an input alias still pointing at its former file, and does not reread a later native case.

| Inspection state | Retained work and continuation |
| --- | --- |
| `COMPLETE` | The capture and every named output snapshot are complete. Continue from those original files and identities. |
| `RETENTION_INCOMPLETE` | The native capture completed, but some output snapshots could not be retained. Restore the original retained storage, then inspect this same request to finish publication. |
| `INCOMPLETE` | The capture directory exists without its final manifest. Inspect again while its original publication is running. After an interrupted publication, keep every returned complete file; a valid portable preparation can reopen in the browser or canonical creator. A different native capture uses a new reviewed request ID and preserves this directory. |
| `PREPARED` | The request is retained and no capture directory has been published. Repeat the identical capture call with its original arguments to continue against the reviewed case and file selection. |

The listing also distinguishes a directory whose request is still being retained (`PREPARING`) and a capture manifest awaiting complete result retention (`CAPTURED`). Its rows are discovery metadata. Inspect the selected request to validate its complete files and recover the actual response.

Open the resulting `reporting-preparation.json` through **Open preparation JSON** in the existing Operating plans editor to retain its original ID, creation time, files and preview. An optional `grant-procedure.json` continues through the original native save/export/receive sequence above, using the actual returned source ID and case version. The same receiving operator retains the saved procedure and full case archive.


## Attach the complete procedure to the customer case

Open the same Grant case and choose **Operating procedures**. Prepare the complete Operating plan with the actual case sources, Source Tables selections and original Installation or task-outcome editions. Review every selected step link, then save it through the case's original actor, version and request controls.

The original command-line route is starforge grant-procedures. Its prepare, save, show, export, inspect and receive commands use the same native Grant client and complete procedure format. A private client binding selects the actual managed workspace; it is kept with the operator rather than placed in the public procedure.

Export the entire procedure delivery directory when returning the work. It contains the original Operating plan JSON and readable handovers, selected source tables and native editions, their full verification, and the complete original Grant case. The receiving operator imports this through the existing Grant receiver at the selected receiving workspace. Preserve the actual destination plan/case mapping and the original procedure parent chain.

When the next operator returns a saved revision, reopen the original case and choose its previous procedure as the parent. The original OperatingPlan receiver verifies the full prefix history before accepting the new revision. Repeat an interrupted save or import with the same request ID and exact retained input; its native receipt determines the outcome.

See [Grant operating procedures](../../../scf_2026/sf47_budget_model/workspace/GRANT_PROCEDURES.md) for the complete native selection and command contract, and [complete case receiving](../../../scf_2026/sf47_budget_model/workspace/GRANT_PROCEDURES_RECEIVING.md) for its original two-operator continuation.
