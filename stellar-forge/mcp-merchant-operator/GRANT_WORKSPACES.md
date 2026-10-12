# Grant planning, delivery and forecasts through Merchant MCP

These tools operate the original SF47 grant workspace. The original Python service owns its saved plans, operating cases, source attachments, work records, invoices, cash observations, reviews and forecasts. The Merchant client uses that service's authenticated HTTP API and its existing managed launch reader.

An agent can inspect the same case that the browser displays, preview a dated remaining-work forecast, save the exact reviewed result, export the complete case and receive it in another declared workspace. Paid invoice allocations, native asset amounts, quoted commercial receipts and conditional grant funding keep the original engine's meaning.

## Connect the original workspace

Use the same installed source edition for the Merchant client and the selected **Grant planning and delivery** application. A running Applications instance is borrowed: Merchant MCP does not take its database lock or stop that instance. If the host explicitly allows startup, merchant_grant_open can launch the same original managed grant service when the workspace is closed. The original workspace.lock prevents a second SQLite owner.

The host supplies a private connection file. All paths resolve against that file, and only host-declared aliases are available in tools.

~~~json
{
  "schema": "stellar-forge.sf47-workspace-connection.v1",
  "workspaces": {
    "grant": {
      "label": "Original grant delivery",
      "directory": "./grant",
      "pythonExecutable": "/usr/bin/python3",
      "allowStart": true,
      "inputs": {
        "original-case": {
          "file": "./received/original-operating-case.zip",
          "kind": "case",
          "mediaType": "application/zip"
        },
        "forecast-assumptions": {
          "file": "./received/forecast-inputs.json",
          "kind": "forecast-inputs",
          "mediaType": "application/json"
        }
      }
    },
    "receiving": {
      "label": "Received operating cases",
      "directory": "./receiving",
      "pythonExecutable": "/usr/bin/python3",
      "allowStart": true
    }
  }
}
~~~

Keep the connection file mode 0600, and workspace directories and receiving parents mode 0700, owned by the operator. An optional scenarioFile selects the original source scenario for an empty workspace. Existing plans keep their original scenario and revision history. An input may declare sha256; the client then rejects a changed file. Otherwise inspect its actual current SHA before an import or forecast preview.

From the selected source root, initialize the existing Merchant configuration:

~~~sh
node stellar-forge/mcp-merchant-operator/serve.mjs init-grant-workspaces \
  --dir /srv/stellar/grant-merchant \
  --connection /srv/stellar/grant-connection.json

node stellar-forge/mcp-merchant-operator/stdio.mjs \
  --config /srv/stellar/grant-merchant/merchant-mcp.json
~~~

An existing Merchant configuration can instead add the grantWorkspaceConnection key with the absolute connection-file path. The original release store, exports directory and all other configured products remain in that same configuration.

merchant_grant_workspaces lists aliases, labels, source-selection hashes and startup permission. merchant_grant_open accepts the selected alias and optional exact expectedSelectionSha256. Opening reads the original private managed-launch.json, verifies the source selection and executed source, and authenticates the actual /api/access listener with its original PID and instance identity.

The service's access token remains in the original private workspace. merchant_grant_browser returns the original access-fragment URL when an operator needs to continue in the browser. Treat that URL like the original private access file.

## Read the saved plan and operating case

| Tools | Original result |
| --- | --- |
| merchant_grant_plans, merchant_grant_plan | Saved plan summaries; current or selected immutable revision with original scenario and reports. |
| merchant_grant_plan_history | Original plan revision history. |
| merchant_grant_cases, merchant_grant_case | Existing case summaries and the full pinned plan, record collections, sources, reviews, forecasts and portfolios. |
| merchant_grant_case_report | Original invoice allocations, native assets, delivery measures and grant-stage reporting. |
| merchant_grant_case_history | One native event-history page, with the original cursor and page result. |
| merchant_grant_forecasts, merchant_grant_forecast | Immutable forecast summaries or the entire saved forecast and current source-change comparison. |
| merchant_grant_portfolios, merchant_grant_portfolio | Saved resource/date allocations, their original forecast, alternatives and current source comparison. |
| merchant_grant_review | Complete original saved business review and its source snapshot. |

Read the original planId and current revision, or the original caseId and program.version, before a mutation. An operating case remains pinned to its selected original planning revision.

### Complete snapshots and array pages

Every successful native read or mutation normally returns a retained snapshot record:

~~~json
{
  "schema": "stellar-forge.sf47-agent-snapshot.v1",
  "id": "snapshot-<original UUID>",
  "workspace": "grant",
  "source": {
    "instanceId": "<actual original launch>",
    "selectionSha256": "<actual source selection>"
  },
  "file": {
    "name": "original-response.json",
    "bytes": 123456,
    "sha256": "<exact original response SHA256>",
    "contentType": "application/json; charset=utf-8"
  },
  "value": {
    "records": {
      "work": {"$originalArray": "/records/work", "count": 42}
    }
  }
}
~~~

The real response includes the actual native file size, hash, launch and result. This example shows the shape only. Scalar values retain their original JSON types; financial amounts that the original engine represents as strings remain strings.

The compact value uses explicit references for arrays and large values. The exact original HTTP body is retained in full. Use merchant_grant_snapshot with pointer "/program" to read selected original metadata; merchant_grant_rows with the snapshot ID, exact expectedSha256, an array pointer, offset and limit to read rows; or merchant_grant_file_read to download the complete exact response.

If the original response succeeds but local file retention fails, the reply keeps that known original result, its source, exact response size and SHA256. It explicitly returns retention.state FAILED, id null and no fileRead handle. Restore local storage and repeat the identical native request ID and payload to retain the original saved result. This differs from GRANT_RESULT_UNCERTAIN, where the original HTTP outcome is unknown.

Rows return the original array count, selected rows and nextOffset. A page is at most 200 rows and approximately 48,000 bytes. A single larger row is identified explicitly with its original index and pointer; inspect its nested fields or download the full file. JSON pointers use ~0 for a tilde and ~1 for a slash. Array indexes are zero-based.

Snapshot paging does not replace native history paging. If the original case_history response indicates another history page, call merchant_grant_case_history with that original next cursor, then page its returned snapshot as needed.

## Save a reviewed forecast

1. Read the original case and record its current version.
2. Supply the original forecast input object inline, or inspect a declared input with merchant_grant_inputs and use its exact SHA.
3. Call merchant_grant_forecast_preview. It runs the original forecast engine without saving a forecast.
4. Read the returned original previewSha256, dated cash scenarios, remaining work, invoice obligations and capacity result.
5. Call merchant_grant_forecast_save with the same original inputs, case version, expectedPreviewSha256, actor and one stable request ID.
6. Reopen the returned original forecast through merchant_grant_forecast; export it or the entire case.

Input selection for a retained host file:

~~~json
{
  "workspace": "grant",
  "caseId": "operation-<original 32 hex characters>",
  "expectedVersion": 29,
  "input": {"hostInput": "forecast-assumptions"},
  "expectedInputSha256": "<the inspected 64-character hash>"
}
~~~

For inline input, replace input and expectedInputSha256 with inputs containing the original forecast object. Never submit both forms.

The input contract remains [the original forecast guide](../../stellar/scf_2026/sf47_budget_model/workspace/FORECAST.md). Its source snapshots, paid-obligation handling, selected dates, opening-cash basis, commercial quotes and conditional grant receipts are interpreted only by that original implementation. The client does not create an accounting ledger or a second capacity solver.

If another operator changes the case between preview and save, the original service returns OPERATIONS_CONFLICT or FORECAST_PREVIEW_CONFLICT. Read the current case, reconcile the input and preview again. An older saved forecast remains immutable and shows its original source comparison.

## Allocate resources and carry selected dates into cash

The six portfolio operations use the completed original [Portfolio allocation workflow](../../stellar/scf_2026/sf47_budget_model/workspace/PORTFOLIO.md). The original saved forecast supplies the full remaining task set, hours, prices and cash rules. The original allocation engine supplies resource availability, dependencies and working dates.

| Tool | Original operation |
| --- | --- |
| merchant_grant_portfolios | All saved allocation summaries for the selected case. |
| merchant_grant_portfolio | The complete immutable allocation, source forecast, alternatives, dated results and current source comparison. |
| merchant_grant_portfolio_seed | An editable input from the selected current saved forecast, retaining every remaining source task. |
| merchant_grant_portfolio_preview | The original entered allocation and alternative calculation against the current case version. |
| merchant_grant_portfolio_save | Native portfolio.save with the reviewed preview identity, exact case version and stable request ID. |
| merchant_grant_portfolio_selection | The selected ready alternative's original forecast input and retained date/source selection; it creates an editable cash forecast input. |

1. Inspect the current case version and the selected saved forecast's ID and SHA. Call portfolio_seed with that case version and forecast ID.
2. Read the seed's complete /inputs object. Enter explicit weekdays, daily availability, dated exceptions, resource effort, dependencies and alternatives. Every source task stays in that native input. An unentered capacity and an entered zero retain their different original meanings.
3. Call portfolio_preview with the complete input. Inspect every alternative's status, available and allocated hours, chosen dates, late or unfinished tasks, collection-timing findings and original cash result. Use snapshot/rows for large arrays and file_read for the complete response.
4. Call portfolio_save with the same input, current expectedVersion, expectedPreviewSha256, actor and original requestId. Reopen the returned portfolio ID with portfolio; the save's source and complete result stay immutable.
5. Read the case's current version. Call portfolio_selection with that version, portfolioId and the exact alternativeId (base selects the base allocation).
6. Feed the returned original /inputs object into forecast_preview, review the cash assumptions, then forecast_save with its original preview SHA, current version and a new deliberate request ID.
7. Export kind portfolio with caseId and portfolioId for the full source/calculation/CSV handoff. Export kind case for native import and reopening of the entire case, including every retained portfolio and original forecast.

Seed, preview and selection are read-only native operations. Save uses the original command journal. A stale case or changed forecast keeps the original validation response; an uncertain save retains the original request ID for exact replay. Saving an incomplete allocation preserves the native findings and entered work for later receiving. Only an original READY alternative is eligible for the date selection step.

### Pass the exact original object between operations

Forecast and portfolio preview/save accept one complete inline inputs object or one verified input reference. For a native response that wraps the input, set inputPointer explicitly. The SHA always identifies the entire retained file; projection happens after full-file verification.

For example, portfolio_selection returns a retained snapshot whose native response contains inputs. Use its real snapshot ID and whole-response SHA:

~~~json
{
  "workspace": "grant",
  "caseId": "operation-<original 32 hex characters>",
  "expectedVersion": 32,
  "input": {
    "snapshotId": "snapshot-<original UUID>"
  },
  "expectedInputSha256": "<complete selection-response SHA256>",
  "inputPointer": "/inputs"
}
~~~

Pass this selection to merchant_grant_forecast_preview. For forecast_save, retain those exact input-selection fields and add actor, requestId and the original forecast preview's expectedPreviewSha256. The same reference pattern can select /inputs from portfolio_seed or /inputs from portfolio_preview for portfolio_save. A declared host JSON file or completed transfer can use the same optional pointer.

Pointers use the shared original JSON-pointer rules: / for object paths, ~0 for a tilde, ~1 for a slash. The selected value must be the native input object. Inline inputs exclude input, expectedInputSha256 and inputPointer. Complete native response files retain their own receiving bounds; the projected input fits the existing 8 MiB input bound and the service's complete request remains within 32 MiB.

The selection changes the original work-date fields. Quoted collections and conditional grant receipts keep the original forecast engine's entered timing and completion-payment rule. Review its collection-timing findings before accepting the dated cash forecast.

## Planning, delivery and reviews

Planning changes use merchant_grant_plan_estimate, plan_save, plan_restore and plan_clone. The original expectedRevision, request ID, note, scenario patch and planning inputs pass to the corresponding native operation. Native request IDs contain up to 100 letters, numbers, dots, underscores or hyphens, beginning with a letter or number. Keep their exact original spelling on replay.

Create a delivery case with the reviewed planId, selectedRevision and expectedContentSha256. Select OPERATIONS for actual operating records or WALKTHROUGH for an explicitly named operating example.

merchant_grant_case_command accepts the original action and data object. Supported actions cover:

- Contributor save; work save, submit, accept, reopen and void.
- Invoice save, review, dispute, reopen and void.
- Cash record and void.
- Award, deployment and outcome save.
- Purchase record, later source observation and void.
- Business review, reviewed close and reopen.

The original service validates each record, source reference, lifecycle transition and native amount. Every command requires the exact current case version, original request ID and recorded actor. Reviews and reversals retain their original reason and before/after event.

Use merchant_grant_source_attach for exact source bytes. It calls the original source.add operation and retains filename, MIME, source URL, observation date and source hash. Individual sources have the native 8 MiB limit; the case retains its original aggregate source bound. merchant_grant_intake consumes the existing original source-intake packet through its maintained importer.

## Receive merchant support into the original delivery case

The two Support operations join the original [Merchant Support receiving workflow](../../stellar/scf_2026/sf47_budget_model/workspace/SUPPORT_DELIVERY.md). Export the intended saved case from Merchant Support with **Export portable handoff**. Use that complete original JSON file; the grant service invokes its installed SF74 reader and preserves the captured source, route and runtime identities.

| Tool | Original result |
| --- | --- |
| merchant_grant_support_preview | Read-only native review of the exact handoff and current case version, including source/reader identities, full report, rendered HTML, existing source matches, deployment choices and previewSha256. |
| merchant_grant_support_receive | Original support.receive transaction: retain the handoff and native rendered review, associate an existing or new deployment, and commit the case event and original request receipt together. |

1. Read merchant_grant_case for the current case version and retained deployments.
2. Inspect the declared original support input with merchant_grant_inputs, or finish its original receive_begin/chunk/commit transfer. Keep the exact whole-file SHA and original filename.
3. Call support_preview with caseId, expectedVersion, input, expectedInputSha256 and filename.
4. Read the complete original source, installed reader, captured comparison and follow-up work. Use snapshot/rows to inspect native objects and arrays; file_read returns the full preview JSON, including its original html string.
5. Select the original deploymentId from that case. To record a new deployment, use null or omit deploymentId and provide the native deployment fields instead.
6. Call support_receive with the same file selection, whole-file SHA, filename and case version, the reviewed expectedPreviewSha256, actor, note and one stable requestId.
7. Read its original recordId, sourceIds, sourceSha256, version and unchanged result. Reopen the case, export each original source through kind source, or export and import the complete case.

A declared host input is selected exactly like other native files:

~~~json
{
  "workspace": "grant",
  "caseId": "operation-<original 32 hex characters>",
  "expectedVersion": 32,
  "input": {"hostInput": "merchant-support"},
  "expectedInputSha256": "<exact original support file SHA256>",
  "filename": "merchant-support.json"
}
~~~

Pass those fields to merchant_grant_support_preview. For support_receive retain every selection field and add the original preview hash, deployment selection and request fields. The host declares merchant-support in its connection inputs with the actual file path. A completed transfer or a retained source export can also supply the exact same original bytes. Support tools consume the whole file; they do not accept inputPointer or reconstructed review JSON.

### Existing and newly recorded deployments

An existing deploymentId preserves its original accountable operator, business fields and source associations, then adds this original handoff/report relationship. Omit deployment, or pass null/an empty object. A nonempty competing replacement object is rejected.

A new deployment uses the original fields below. Read pinned work-package IDs from the original case plan; a HANDED_OVER state needs its named receiver and actual receiving date.

~~~json
{
  "name": "Merchant runtime",
  "operator": "Accountable operator",
  "operatorId": "retained-operator-identity",
  "role": "MERCHANT",
  "participantClass": "TEAM_OPERATED",
  "environment": "TESTNET",
  "state": "OPERATING",
  "costIds": [],
  "tranche": null,
  "endpoint": "https://merchant.example/data",
  "releaseRef": "Original installed source",
  "caseRef": "Original merchant case or work order",
  "acceptedBy": "",
  "acceptedAt": null,
  "sourceNote": ""
}
~~~

For a new record use deploymentId: null and put those fields in deployment. Native generated IDs, version, recordedBy and sourceIds belong to the original service. Role, environment, participant class, lifecycle state and pinned work references retain the original deployment rules.

### Exact source, recovery and complete handoff

The native preview binds the current case version, original filename and bytes, installed reader and factual review. The receive operation recalculates that review in the original case transaction and checks its preview hash. It retains the raw handoff, rendered report, source association, deployment change, event and request receipt atomically.

A repeated identical original request returns its accepted result. A file/report already associated with the selected deployment can return unchanged without incrementing the case version. Reused original bytes keep any existing source name and metadata; the support-to-report association remains part of the original case and history.

If the native version or preview has changed, read the current case and preview the same intended file again before submitting a deliberate updated request. If the receive response is interrupted, recover the identical original requestId and payload. The client issues no automatic write replay. SUPPORT_REVIEW_BUSY means another original review is running; retain the selection and retry when that review completes.

The original handoff and retained rendered report each fit 8 MiB. The case retains its original 24 MiB aggregate and 200-file limit. Preview can contain a complete native reader report up to its 16 MiB output bound; large snapshots remain available through byte paging. For an oversized handoff choose a shorter original capture period in Merchant Support and export that source.

The maintained grant launcher passes its running Node executable to the original Python support reader. Borrowed Applications and MCP-started instances use that same lifecycle. Download sourceIds through merchant_grant_export with kind source; the original handoff reopens in Merchant Support, and the saved HTML opens as the receiving-time report. Complete case export/import preserves both files, their deployment association and original event history.

## Receive buyer results, review a cohort and complete its tranche

The [Grant Operations guide](../../products/grant-operations/OPERATING.md) follows the installed application from planning through the complete customer handover. These operations continue the same case, service, immutable reviews and request journal used above.

### Original buyer observations

`merchant_grant_buyer_preview` reviews a complete original SF88 handoff against the current case version. Inspect its source identity, original jobs, outcome and output observations, existing purchase matches, deployment choices and preview SHA. Supply the handoff through an existing host input or completed transfer, retaining the whole-file SHA and original filename.

`merchant_grant_buyer_receive` takes that same file selection, case version and preview SHA, the original request fields and an explicit `selections` array. Each selected item identifies the original `jobId` and an existing `purchaseId`, or null for a new purchase record. Select an existing deployment or supply the original new-deployment fields. The [Buyer Operations contract](../../stellar/scf_2026/sf47_budget_model/workspace/BUYER_OPERATIONS.md) gives the complete data shape.

The native transaction retains the handoff, reader result, purchase/deployment associations and request receipt together. Replaying an older observation preserves its recorded time and any newer original observation. An order state independently entered in the case remains separate from what the Inbox export observes. Download retained source files with `kind:source`; the complete case export carries their original history and associations.

### Commission and receive a customer installation

| Tool | Original operation |
| --- | --- |
| `merchant_grant_installations` | Latest saved customer installation editions in the selected case. |
| `merchant_grant_installation` | One complete saved edition, input, original selections, report and changes. |
| `merchant_grant_installation_history` | Immutable edition pages with the original nextBefore cursor. |
| `merchant_grant_installation_seed` | Complete document seeded from the pinned plan's work packages and measurable criteria. |
| `merchant_grant_installation_preview` | Review the document, original case version, installation identity and expected revision. |
| `merchant_grant_installation_save` | Append the exact reviewed edition, case event and original request result in the existing transaction. |
| `merchant_grant_export` with `kind:installation` | Selected-edition readable handover plus the complete original operating case and all retained editions. |

The document captures the complete commissioning and terms, useful customer task, source population, exact payment and aggregate task budget, receiving application, maintenance, funded work and original acceptance records. Preview and save take it as inputs or a verified original input reference; inputPointer selects /document from a native seed or /preview/document from a saved edition. Verify the complete file before selecting its pointer.

A new installation uses installationId:null and expectedRevision:0. A revision uses the original installation ID and its current edition. Saving also requires the actual case version, original request ID, recording operator, save reason and expectedPreviewSha256. Read the updated case version after the save and recover an uncertain response with the same original request and payload.

The export requires the selected installation ID and saved revision. The original receiver preserves every edition and source, and returns selectedInstallation for reopening the selected edition. See the complete [Installation operator and API guide](../../stellar/scf_2026/sf47_budget_model/workspace/INSTALLATIONS.md).

### Review original implementation evidence

These three tools use the same case and the maintained [implementation evidence workflow](../../stellar/scf_2026/sf47_budget_model/workspace/IMPLEMENTATION_EVIDENCE.md). Attach the complete original commissioning JSON, Merchant workspace or Support handoff through the existing Sources intake. Preserve its native source ID, filename, byte length and SHA-256.

| Tool | Original operation |
| --- | --- |
| `merchant_grant_implementation_source` | Inspect the retained original source at the entered cutoff, including full tasks, receiving and measurements, comparisons, source-bundle originals and producer fingerprints. |
| `merchant_grant_implementation_preview` | Preview the explicit observation selection, existing case associations and exact saved Installation editions. |
| `merchant_grant_implementation_prepare` | Freeze the exact preview under the original case transaction, request ID and current version. |
| `merchant_grant_export` with `kind:implementation` | Download the complete frozen evidence ZIP for the selected case and review. |
| `merchant_grant_export` with `kind:implementation-original` | Download one exact original member selected by case, source ID and SHA-256. |

Supply `caseId`, `expectedVersion` and the original `sourceId` to source inspection. An explicit `asOfAt` uses canonical UTC with milliseconds. Retain the cutoff and initial inputs returned by the original source response; it applies to both observation and recording time. The selected source still carries its complete current task definitions and later history.

Inspect the full retained response with the existing snapshot/row/file tools. Select original tasks, technical or customer receiving records and measurements by their actual `kind` and `id`; choose `EVIDENCE` or `CONTEXT`, original deployment/work/purchase/outcome IDs, and a reason. Original source-bundle files retain their manifest paths. Each external original needs an exact retained attachment binding in `originalFileRefs:[{sha256,sourceId}]`. Selected Installation editions carry `id`, `revision` and `sha256`. The native bounds are 200 observations, 20 Installation editions and 5,000 original-file bindings.

Pass the complete entered object as `inputs`, or use the existing verified `input` selection with `expectedInputSha256` and optional `inputPointer`. Verification covers the whole original input before projection. Source inspection consumes the existing attachment directly. Preparation adds the exact `expectedPreviewSha256`, `requestId`, `actor` and optional `note`; it records `implementation.prepare` through the original command. Preserve the same source, inputs, case version and request on a lost response.

A frozen review can retain findings and negative observations. Technical acceptance, customer acceptance, work approval, settlement and an issuer decision remain distinct original facts. The review's explicit associations do not modify the underlying work, cash, purchase, deployment or outcome records. Completion applies its current evidence checks before using that review.

A new whole-case import, current Completion use and evidence export re-run the original inspector over the retained bytes and cutoff and compare its full projection and ten-file reader identity. Keep the exact published reader/producer source with historical evidence; an incompatible reader requires that original edition. An identical previously committed import returns its original saved request. The exact member download remains source-bound, and the full ZIP requires every original file frozen into that review.

Sources retain the native 8 MiB attachment limit, projections 16 MiB, and frozen reviews 8 MiB. Complete evidence ZIPs and expanded selected members retain the 32 MiB native bundle limit. Interrupted preparation and complete file receiving use the same existing request and chunk engines.

### Freeze the measured cohort

| Tool | Saved case workflow |
| --- | --- |
| `merchant_grant_cohort_seed` | Original tranche-2/3 proposal, purchase/deployment/source inventory and complete editable inputs. |
| `merchant_grant_cohort_preview` | Cutoff measurement, original numerator and denominator scopes, source coverage, target findings and preview digest. |
| `merchant_grant_cohort_prepare` | Immutable reviewed measurement, complete original inputs and observation/source history in the case journal. |
| `merchant_grant_review` | The saved review and its original source snapshot. |
| `merchant_grant_export` with `kind:cohort` | Full evidence ZIP, readable result, CSV tables, original files and manifest. |

Pass the complete seed inputs to preview. A retained seed snapshot can supply `/inputs` through the same verified input-reference interface as forecasts and portfolios. Read the complete observations, intended-purchase population, targets and source findings through the original row and file interfaces before freezing the review.

Preparation requires the unchanged inputs, current case version, original request ID, actor and reviewed `expectedPreviewSha256`. A frozen review can retain unmet targets with its complete findings. The original [cohort engine](../../stellar/scf_2026/sf47_budget_model/workspace/OPERATIONS-COHORT.md) determines window membership, distinct accountable operators, settlement/output proof, repeat use, facilitator independence and recovery observations from the entered source.

Cohort input references use the original 32 MiB request allowance. The provider verifies the complete retained file before applying `inputPointer`, and the complete HTTP request must still fit that allowance. Source attachments and ordinary model inputs keep their existing 8 MiB limits.

### Carry reviewed evidence through Completion

| Tool | Original operation |
| --- | --- |
| `merchant_grant_completion` | Payment-derived calendar, assignments, original/confirmed deadlines and recorded issuer outcomes. |
| `merchant_grant_completion_seed`, `merchant_grant_completion_save` | Seed and save the complete tranche assignments against the original work packages. |
| `merchant_grant_completion_preview`, `merchant_grant_completion_prepare` | Review the form against its original received payment, then freeze the exact prepared business source. |
| `merchant_grant_completion_extension` | Retain an issuer-confirmed later deadline with its original confirmation source. |
| `merchant_grant_completion_submit` | Record the actual form receipt against its frozen preparation. |
| `merchant_grant_completion_decision` | Record the issuer outcome while preserving the original form and earlier events. |
| `merchant_grant_export` with `kind:completion` | Complete prepared form, readable HTML, deliverables and included evidence files. |

Preview and preparation can select up to twenty distinct original `cohortReviewIds`. Preserve the same selection and order in both calls. Omission retains the earlier request shape; an explicit empty array is a deliberate selection with its own preview. The original service checks the tranche, cutoff, source currency and complete target findings.

The optional `implementationReviewIds` field composes with the cohort selection and accepts up to twenty distinct original review IDs in their intended order. Preserve it unchanged between preview and preparation. The service rechecks original producer fingerprints and projection, complete source files, current case associations, saved Installation editions and retained findings. Omission preserves earlier requests; an explicit empty selection retains its own input identity.

Preparation retains the exact `receiptId`, calendar date, summary, preview SHA and selected frozen evidence. Submission uses the preparation's business SHA and the actual issuer form reference, submission date and source records. Read the new case version after every committed action, and recover a lost result with the unchanged request. The [Completion contract](../../stellar/scf_2026/sf47_budget_model/workspace/COMPLETION.md) and [typed-client guide](../../stellar/scf_2026/sf47_budget_model/workspace/AGENT.md) provide the exact field names and calendar behavior.

## Read and export the grant delivery calendar

Use `merchant_grant_delivery_calendar` with the original `workspace`, `caseId`, and optional `asOfDate`. The calendar combines the native payment-derived completion deadlines, confirmed extensions, saved deliverable assignments, planned submissions, and recorded form submissions. Entries with one known date retain the other bound as null; undated work remains in the returned `undated` array.

Use `merchant_grant_export` with `kind: "delivery-calendar"` and `format: "ics"`, `"csv"`, or `"json"`. Include the calendar's `asOfDate` and `case.version` as `expectedVersion` to export the reviewed case version. ICS contains dated all-day events; CSV and JSON also retain undated work. The existing snapshot, row paging, file download and transfer tools carry these complete exports.

The typed client exposes `read('delivery-calendar', selection)` and `download('delivery-calendar', {...selection, format})`. See [Calendar operation and date meanings](../../stellar/scf_2026/sf47_budget_model/workspace/CALENDAR.md).

## Receive merchant settlements and continue their corrections

The settlement tools operate the existing merchant accounting and SF47 cash engines. Select the complete original plain TAR through the same declared input/whole-file SHA mechanism as other source receiving:

| Tool | Native operation |
| --- | --- |
| merchant_grant_settlement_preview | Inspect the complete original source; supply both name and selections for its exact pre-save cash and delivery preview. |
| merchant_grant_settlement_receive | Save the same source, name, selections, expectedPreviewSha256, case version and original request. |
| merchant_grant_settlements / merchant_grant_settlement | Read source review editions, complete original rows, current cash and correction history. |
| merchant_grant_settlement_correction_preview | Review the latest saved source row, expectedCashId and explicit correction. |
| merchant_grant_settlement_correct | Save the exact reviewed correction under its original request and preview SHA. |
| merchant_grant_export, kind settlement | Retain the complete selected review, original source and native inspection for existing download/byte paging. |

Saved review IDs use settlement- followed by 32 lowercase hexadecimal characters. Receiving choices are RECORD_CASH, LINK_CASH, OBSERVE and OMIT. Cash dates, native units, asset precision, USD valuation and deployment/work associations are explicit native inputs. LINK_CASH retains the original cash values. CORRECT_CASH, LINK_CASH, VOID_CASH and RELINK create successor reviews in the existing source/event history.

The complete case export retains every settlement source, correction and cash/event history. Use the original case importer to continue it in another declared workspace. [Merchant settlements](../../stellar/scf_2026/sf47_budget_model/workspace/SETTLEMENTS.md) contains all exact bodies, limits, browser operations, CLI commands, typed interfaces and recovery behavior.

## Export, transfer and receive the complete work

merchant_grant_export supports original plan ZIP, operating-case ZIP, forecast ZIP, portfolio ZIP, customer installation ZIP, implementation-evidence ZIP or exact original member, cohort ZIP, completion-preparation ZIP, source file, scenario JSON and original daily/cost CSVs. It preserves the complete native response. A case ZIP includes the original source attachments, buyer/support associations, reviews, forecasts, portfolios, all immutable customer installation editions, implementation reviews and cohort/completion history.

For exact bytes, call merchant_grant_file_read with the snapshot ID and expectedSha256. Repeat the returned readId, same SHA and nextOffset; keep each base64 chunk's decoded bytes in order. Each chunk is at most 65,536 bytes. The shared original reader keeps a verified snapshot, returns an exact total size and hash, and releases its temporary descriptor at EOF. merchant_grant_file_release closes a reader early; the retained original file stays available.

The shared reader has four simultaneous snapshot slots and a 120-second idle timeout. After timeout or process restart, open a new read against the same retained snapshot and SHA at the needed byte offset. An expired reader ID does not invalidate the retained file.

### Native import on the same host

A receiving workspace can import an exact export directly without encoding it into the conversation:

~~~json
{
  "workspace": "receiving",
  "input": {
    "sourceWorkspace": "grant",
    "snapshotId": "snapshot-<the complete original case export>"
  },
  "expectedInputSha256": "<that export's exact SHA256>",
  "name": "Received original grant delivery",
  "actor": "Receiving operator",
  "requestId": "receive-original-grant-case-01"
}
~~~

Pass this to merchant_grant_case_import. Both source and destination must be declared host aliases. The original case importer receives every ZIP byte and preserves its native source lineage. Use merchant_grant_plan_import with kind "plan" for a complete planning ZIP, or kind "scenario" for original scenario bytes.

### Receive bytes from another client

1. Call merchant_grant_receive_begin with a stable transfer request ID, exact filename, byte count and SHA256.
2. Send merchant_grant_receive_chunk with offsets 0, 65536, 131072, and so on. Each part is exactly 65,536 bytes except the last.
3. Read merchant_grant_receive_status after interruption. It identifies every missing original offset.
4. Call merchant_grant_receive_commit. It assembles the complete source, verifies length and whole-file SHA, and returns COMPLETE.
5. Use the transferId input reference and the same SHA in the explicit native import or source-attachment tool.

Identical repeated parts are accepted. A different part at the same offset, or a different declaration under the transfer request ID, is a conflict. Transfers survive MCP restart. A transfer has no effect on plans, cash records or operating cases until the original import is explicitly called.

The native bundle limit is 32 MiB. Scenario inputs, source attachments and source-intake packets use their original 8 MiB input bound. Larger task inputs must be divided according to the original product's import semantics, rather than silently truncated.

## Recover an interrupted mutation

The original planning database stores the request fingerprint and result in the same transaction as the mutation.

| Outcome | Continue through the original operation |
| --- | --- |
| Same request ID and identical original payload | Repeat the original tool. The native saved result is returned without another case mutation. |
| REQUEST_CONFLICT | The request ID belongs to a different payload. Recover that original operation; a deliberate new action needs a new request ID. |
| OPERATIONS_CONFLICT or plan revision conflict | Read current source and reconcile the concurrent operator's saved work. |
| FORECAST_PREVIEW_CONFLICT | Preview the exact revised inputs against current original records before saving. |
| SUPPORT_PREVIEW_CONFLICT | Re-preview the exact support file and filename against current case and installed reader before a deliberate receiving request. |
| SUPPORT_REVIEW_BUSY | Keep the same source selection and retry after the original active review completes. |
| IMPLEMENTATION_PREVIEW_CONFLICT | Reconcile the current case, original source and entered selection, then preview before a deliberate new freeze. |
| IMPLEMENTATION_READER_PROVENANCE_MISMATCH | Use the exact published reader and producer edition recorded by the original frozen review. Preserve its original bytes and history. |
| IMPLEMENTATION_ORIGINAL_FILE_UNAVAILABLE | Retain the incomplete review; a deliberate successor must include every required original-file binding before a complete evidence export. |
| GRANT_RESULT_UNCERTAIN | The HTTP response was lost or failed after dispatch. Read the original case/plan, then repeat the identical original request ID and payload to recover its retained result. |
| retention.state FAILED | The original response was received successfully, but its complete local snapshot was not retained. Restore storage and repeat the identical native operation or original read. |
| GRANT_SELECTION_CHANGED | Reconcile the selected workspace, scenario, Python and installed source edition in the host connection. |
| Original WORKSPACE_OPEN | Continue the existing original application owner; do not create a second database process. |
| GRANT_TRANSFER_INCOMPLETE | Resume the original missing part offsets, then commit the same transfer. |
| File reader expired | Reopen the same retained snapshot and exact SHA at the required byte offset. |

No failed write is automatically sent again. No response timeout is treated as evidence that a case mutation did not happen.

merchant_grant_close requires the inspected instance ID and drains this client's pending requests. For a borrowed Applications listener, it releases the connection only. For a service started by this MCP, it signals the original Node launcher, which closes the original Python service and SQLite lock. The next explicit open uses the same saved workspace and a fresh native launch.

## Direct agent client

The same typed transport is available to an application without an MCP wrapper:

~~~js
import { inspectGrantAgentBinding, GrantWorkspaceClient }
  from '../../stellar/scf_2026/sf47_budget_model/workspace/agent-client.mjs';

const binding = await inspectGrantAgentBinding({
  directory: '/srv/stellar/grant',
  pythonExecutable: '/usr/bin/python3',
  allowStart: true,
  label: 'Original grant delivery'
});
const client = new GrantWorkspaceClient(binding);
try {
  await client.open({expectedSelectionSha256: binding.selectionSha256});
  const original = await client.read('cases');
  console.log(original.value);
} finally {
  await client.close();
}
~~~

The client exposes original plan operations, case creation/commands, preview/save, complete downloads, bundle/scenario import, source attachment and intake. Its methods return complete native responses: value is the parsed native JSON; bytes, sha256 and source retain the exact response and launch. Local file destinations and application-specific decisions belong to the calling host; Merchant tools expose aliases and verified transfer IDs instead of filesystem paths.

## Amend the original operating-case baseline

The installed Grant Operations page and native CLI select an exact saved planner revision, retain a complete comparison and explicit operator review, and apply the same amendment to the existing case. Use `merchant_grant_amendments` to inspect saved revisions and amendment heads, `merchant_grant_amendment` to open an exact edition, and `merchant_grant_amendment_preview` with the selected case version and complete inputs or original verified input reference. The existing `merchant_grant_case_command` carries `amendment.save`, `amendment.review` and `amendment.apply` with the original request ID.

Recorded package, invoice and cash identities stay attached to their original work. The comparison displays remaining and exceeded planning amounts and hours. The original full case export includes every amendment edition, source, historical planning snapshot and decision. See [the complete amendment receiving guide](../../stellar/scf_2026/sf47_budget_model/workspace/AMENDMENTS.md) for UI, source-basis, concurrency, replay and cold-import behavior.

## Amendment delivery calendars

The original amendment preview and saved-edition read include a complete native `calendarImpact` companion. `merchant_grant_amendment_calendar_export` accepts the exact draft or saved-edition selection through `inputs` or a verified input reference and returns both ICS/CSV/JSON calendars, offline comparison, original preview and complete operating case through the existing snapshot/byte-download route. Full selections and operating steps are in [AMENDMENT_CALENDAR.md](../../stellar/scf_2026/sf47_budget_model/workspace/AMENDMENT_CALENDAR.md).
