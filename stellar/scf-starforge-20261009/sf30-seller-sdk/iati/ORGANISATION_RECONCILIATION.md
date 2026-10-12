# Organisation and activity financial reconciliation

This workspace links assessed organisation budget or expenditure records to explicitly selected financial records from saved activity portfolios. It keeps each saved organisation revision, activity portfolio revision, source identity, financial context, comparison decision and named review together.

The browser entry is **Financial reconciliation** in the existing IATI console. The Python command is **reconciliation** under the existing IATI CLI. The JavaScript client is **client.organisationReconciliation**. Merchant MCP tools use the prefix **merchant_source_iati_reconciliation_**.

## Complete operator workflow

1. Open **Financial reconciliation → Sources**. Name the reconciliation and choose the saved organisation plan, its exact revision and the organisation within that plan. Select each activity portfolio and its saved revision. **Add saved revision** creates another selectable edition row for the same portfolio; enter its exact saved revision and select that row. Distinct revisions remain separate, while the same ID and revision can be selected only once.
2. Choose **Load financial records**. Both complete registers are read through their native pages. The browser keeps the returned snapshot identity and detects a changed register while loading.
3. In **Record comparisons**, select one organisation financial record and the exact activity rows to compare. Search and filter the complete loaded activity register by activity, recipient, record family or currency. **Select filtered rows** records an explicit selection of all rows matching the current filters; selections remain visible through **Show selected rows**. To retain an organisation record without selecting activity coverage, explicitly choose **Record no selected activity coverage**. This writes the native empty activity-row selection and retains its `no-activity-selection` review finding. Selecting activity rows clears that choice. Clearing selected rows alone does not assert the empty-coverage choice.
4. Describe the scope. Choose **Selected activity coverage** for a selected cohort or **Complete organisation coverage** only when that is the intended coverage of the comparison. Set the value-date policy for this comparison.
5. Add the comparison. Repeat for the other organisation records and activity scopes. Each comparison keeps its own coverage statement and date policy. Existing comparisons can be edited or removed before saving.
6. Preview the financial findings, or save the complete selection directly. The saved result contains the native calculation and every included or excluded financial row. Review detail exposes exclusion reasons and original financial context.
7. Record named issue decisions where useful, save the edited reconciliation, and record an **Approve** or **Request changes** review against the saved revision. The review creates the next retained revision.
8. Use **History and delivery** to compare revisions, download the report HTML, comparison CSV or full JSON, or export the complete nested-source ZIP. Receiving that ZIP in another existing workspace reopens its retained reconciliation and source work.

The browser performs display and row selection. The native financial engine performs the calculations. Reported monetary amounts remain decimal strings throughout the browser and JavaScript client.

Routine workspace refresh preserves unfinished source controls, including the selected organisation plan, raw revision inputs, distinct editions of one portfolio and an explicitly empty portfolio selection. It does not substitute the last loaded selection for an unfinished edit. Financial records must still be loaded from 1–32 selected saved portfolio editions before comparisons can be saved.

### Financial interpretation

An organisation budget comparison uses activity budget records. An organisation total-expenditure comparison uses activity expenditure transactions. Every comparison retains its currency, organisation period, selected records, budget type and status, reporting identity, hierarchy and value dates.

The native report distinguishes selected financial coverage from a statement about the entire organisation. A difference between an organisation-wide budget and a selected activity cohort describes that selected coverage. The operator supplies the scope statement that explains it.

Budget versions and overlapping periods are examined in their original contexts. Where selections would double-count original and revised budgets, overlap financial periods or combine incompatible hierarchy contexts, the report retains the exclusion and its reasons. An issue decision records the operator's response to a finding; it does not change an excluded amount.

Choose one value-date policy per comparison:

| Policy | Meaning |
| --- | --- |
| **Keep value dates separate** | The default native policy keeps incompatible value-date contexts separate. |
| **Compare reported nominal amounts** | Compare eligible amounts reported in the same currency while retaining their original value dates and the resulting qualification in the report. |

There is no browser-side currency conversion, prorating or inferred recipient weighting. Missing or ineligible calculated amounts stay unresolved in the native result and display as an empty value or an em dash in the relevant view.

### Saved work and recovery

Each save and review carries a stable request ID. The browser records the exact action before sending it and retains that same payload after an interrupted response.

Recovery storage records which copy owns each request key. A fallback write remains authoritative when IndexedDB later becomes readable; a successful primary write retires its fallback copy. Deletion records an explicit marker until the primary delete completes, so an older request cannot reappear after a storage failure.

- **Read saved result** resolves the existing request and opens its saved historical revision.
- **Continue same action** resends the retained request ID and complete original payload.
- **Edit rejected selection** first confirms that the original request is unrecorded and retains its complete rejected payload. It restores a save's name, notes, organisation selector, every portfolio edition, comparisons and named issue decisions; an update reopens its original case and expected revision. For a rejected review, it reopens that exact revision and restores the reviewer, note, decision and acknowledged issue IDs. Only after restoring the editable form does it release the pending action. The correction receives a new request ID when the operator explicitly saves it.
- The restored-action notice offers **Download original rejected action**. The original payload also remains in local recovery history. A source-read failure leaves the full definition visible and requires the operator to correct or reload its exact sources before saving. Retained issue decisions stay visible and editable even while a corrected report cannot yet be previewed.
- **Recover a saved action** also accepts an original request ID directly.
- **Download action record** preserves the active request as JSON.

Updating a case uses its ID and expected revision. Historical revisions remain readable and exportable. Restoring a rejected action preserves that original expected revision; it does not silently rebase the request onto newer work. Open the latest saved revision before updating that case, or create a new reconciliation with the desired source selections. A restored empty activity-row comparison remains explicit when opened for editing, previewed, reviewed and exported; its coverage finding does not assert zero organisation activity spending.

## Native HTTP interface

All routes use the original private IATI console, original authentication and original workspace. The prefix is /api/iati/reconciliation/.

| Method | Route | Input and result |
| --- | --- | --- |
| GET | status | Cases, organisation plans and activity portfolios. |
| GET | plan | id and optional revision; complete case. |
| GET | history | id; complete saved revision history. |
| GET | request | requestId; RECORDED with its saved case, or NOT_RECORDED. |
| POST | catalog | Exact organisation/portfolio selector, section organisation or activity, offset and limit; assessed rows and snapshot. |
| POST | preview | Complete definition; financial comparisons, rows, issues, summary and snapshot. |
| POST | save | Definition plus requestId; updates also include id and expectedRevision. |
| GET | rows | id, explicit revision, section comparisons/activity/issues/decisions, offset, limit and optional expectedSnapshot. |
| POST | review | requestId, id, expectedRevision, decision, actor, note and acknowledgedIssueIds. |
| POST | compare | Exact before and after case IDs and revisions. |
| GET | file | id, explicit revision and kind report/csv/json; complete file. |
| GET | export | id and explicit revision; complete nested-source ZIP. |
| POST | receive | Raw application/zip body; COMPLETE with received case, currentCase and reused. |

Individual register pages accept limits from 1 through 250. Continue a rows register with its expectedSnapshot. The client catalog method accepts the same expectation and compares it to the returned snapshot while sending the native selector unchanged. The catalogPages and rowPages helpers traverse all pages and preserve the selected snapshot.

JSON selections and responses use the original 64 MiB IATI metadata ceiling. Complete packet receiving and retained-file delivery use the existing 4 GiB IATI packet ceiling.

### Definition shape

The selector names exactly one organisation inside one saved organisation-plan revision and one or more saved activity-portfolio revisions. Comparison row IDs come from those selected native registers.

    {
      "name": "The operator's reconciliation name",
      "notes": "The scope and working context",
      "organisation": {
        "id": "FULL_SAVED_ORGANISATION_PLAN_SHA256",
        "revision": 1,
        "organisationKey": "FULL_SAVED_ORGANISATION_KEY_SHA256"
      },
      "portfolios": [
        {"id": "FULL_SAVED_ACTIVITY_PORTFOLIO_SHA256", "revision": 1}
      ],
      "comparisons": [
        {
          "organisationRowId": "FULL_NATIVE_ORGANISATION_ROW_SHA256",
          "activityRowIds": ["FULL_NATIVE_ACTIVITY_FINANCE_ROW_SHA256"],
          "coverage": "selected",
          "scopeStatement": "The actual selected activity coverage",
          "valueDatePolicy": "separate"
        }
      ],
      "decisions": []
    }

These capitalised identifiers are placeholders to replace with the actual retained IDs. The financial amounts are supplied by the retained sources.

## Python CLI

Use the existing Python executable and original workspace:

    python iati/cli.py --workspace /absolute/private/workspace reconciliation status
    python iati/cli.py --workspace /absolute/private/workspace reconciliation catalog --input selector-page.json
    python iati/cli.py --workspace /absolute/private/workspace reconciliation preview --input definition.json
    python iati/cli.py --workspace /absolute/private/workspace reconciliation save --input save-request.json

For catalog, selector-page.json contains organisation, portfolios, section, offset and limit. A save request contains the complete definition and stable requestId, plus id and expectedRevision when updating an existing case. The input-consuming JSON commands also accept --input - for standard input.

Read the saved work and its registers:

    python iati/cli.py --workspace /absolute/private/workspace reconciliation plan --id CASE_SHA256 --revision 2
    python iati/cli.py --workspace /absolute/private/workspace reconciliation history --id CASE_SHA256
    python iati/cli.py --workspace /absolute/private/workspace reconciliation rows --id CASE_SHA256 --revision 2 --section comparisons --offset 0 --limit 250
    python iati/cli.py --workspace /absolute/private/workspace reconciliation request --request-id ORIGINAL_REQUEST_ID

Record review or compare exact revisions:

    python iati/cli.py --workspace /absolute/private/workspace reconciliation review --input review-request.json
    python iati/cli.py --workspace /absolute/private/workspace reconciliation compare --input revision-pair.json

Deliver or receive the complete work:

    python iati/cli.py --workspace /absolute/private/workspace reconciliation file --id CASE_SHA256 --revision 2 --kind report --output /absolute/delivery/reconciliation.html
    python iati/cli.py --workspace /absolute/private/workspace reconciliation file --id CASE_SHA256 --revision 2 --kind csv --output /absolute/delivery/reconciliation.csv
    python iati/cli.py --workspace /absolute/private/workspace reconciliation file --id CASE_SHA256 --revision 2 --kind json --output /absolute/delivery/reconciliation.json
    python iati/cli.py --workspace /absolute/private/workspace reconciliation export --id CASE_SHA256 --revision 2 --output /absolute/delivery/reconciliation.zip
    python iati/cli.py --workspace /absolute/private/workspace reconciliation receive --input /absolute/delivery/reconciliation.zip

## Typed JavaScript client

Connect through the existing client and its original private connection file. The reconciliation extension borrows the same request function, authentication, cancellation, timeout and process ownership.

    import { connectIatiWorkspace } from './client.mjs';
    import { readFile, open } from 'node:fs/promises';

    const client = await connectIatiWorkspace({
      consoleUrlFile: process.argv[2]
    });
    try {
      const work = client.organisationReconciliation;
      const definition = JSON.parse(await readFile(process.argv[3], 'utf8'));
      const preview = await work.preview(definition);

      // Display or retain the calculated report before selecting the next action.
      const output = await open(process.argv[4], 'wx', 0o600);
      try {
        await output.writeFile(JSON.stringify(preview, null, 2) + '\n');
        await output.sync();
      } finally {
        await output.close();
      }
    } finally {
      await client.dispose();
    }

The existing console process continues after dispose. The extension does not open another workspace or manage the borrowed process.

For a complete register:

    const selector = {
      organisation: { id: organisationPlanId, revision: organisationRevision, organisationKey },
      portfolios: [{ id: portfolioId, revision: portfolioRevision }]
    };
    for await (const page of client.organisationReconciliation.catalogPages({
      ...selector, section: 'activity'
    })) {
      consumeOriginalRows(page.rows);
    }

The selected records become the comparison definition. The client does not create automatic row mappings. Monetary values remain strings.

For a new saved action, create requestId once and retain the complete object:

    const request = { ...definition, requestId: crypto.randomUUID() };
    const saved = await client.organisationReconciliation.save(request);

For an interrupted response, resolve that ID or replay that same object:

    const original = await client.organisationReconciliation.request(request.requestId);
    if (original.state === 'NOT_RECORDED') {
      const saved = await client.organisationReconciliation.save(request);
    }

Review inputs use the returned saved case ID and revision:

    const reviewRequest = {
      requestId: crypto.randomUUID(),
      id: saved.id,
      expectedRevision: saved.revision,
      decision: 'approve',
      actor: reviewerName,
      note: reviewerNote,
      acknowledgedIssueIds: explicitlyAcknowledgedIssueIds
    };
    const reviewed = await client.organisationReconciliation.review(reviewRequest);

Downloads return the original Response and can stream to a private file through the caller's existing file writer. The original server supplies the complete file and its descriptor; the Merchant MCP retained carrier additionally verifies its byte length and SHA-256 before exposing a retained export.

Types are declared in organisation_reconciliation_client.d.mts. Public entry types include OrganisationReconciliationClient, ReconciliationDefinition, ReconciliationSelector, ReconciliationPreview, ReconciliationCase, SaveReconciliation and ReviewReconciliation. FinancialRow retains original metadata and native nullable fields.

## Merchant MCP

The additive descriptor and execution module is:

    stellar-forge/mcp-merchant-operator/organisation_reconciliation_mcp.mjs

It supplies the following native tools:

- merchant_source_iati_reconciliation_status
- merchant_source_iati_reconciliation_inventory
- merchant_source_iati_reconciliation_plan
- merchant_source_iati_reconciliation_history
- merchant_source_iati_reconciliation_request
- merchant_source_iati_reconciliation_catalog
- merchant_source_iati_reconciliation_preview
- merchant_source_iati_reconciliation_save
- merchant_source_iati_reconciliation_rows
- merchant_source_iati_reconciliation_review
- merchant_source_iati_reconciliation_compare
- merchant_source_iati_reconciliation_file
- merchant_source_iati_reconciliation_export
- merchant_source_iati_reconciliation_receive

All calls select the configured original workspace alias. The definition argument carries the exact native selector or complete action. The catalog tool accepts section and page fields separately. File and export tools return the existing retained export metadata, which remains readable with merchant_source_file_read.

Receiving accepts exactly one configured packet file or retained exportId. An export can select its existing fromWorkspace. The original receiving helper enforces the configured file kind, retained export kind, workspace format and full-file identity.

A reconciliation ZIP uses retained kind reconciliation. An individual HTML/CSV/JSON file uses reconciliation-file. Both use the existing native descriptor verification. This preserves complete source delivery through the same carrier used by the other IATI workflows.

## Historical interpretation

Historical comparison retains changes in the financial records together with definition changes, named review changes, and added, removed or changed issues. A review-only revision is visible even when its numerical comparison records are unchanged. Case `createdAt` and `updatedAt` are native Unix timestamp numbers; source monetary values remain decimal strings.

## Integration with the maintained workspace

These additions compose with the current organisation, publishing, result and refresh implementations. Retain the current shared files when applying the hooks.

The executable `organisation_reconciliation_mcp.mjs` lives beside the native IATI runtime files. The maintained merchant operator location is a re-export wrapper:

    export { organisationReconciliationTools, isOrganisationReconciliationTool, executeOrganisationReconciliation }
      from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/iati/organisation_reconciliation_mcp.mjs';

This carries the complete tool implementation in standalone customer source packets while retaining the original merchant import path. Both installed-source manifests and the reconciliation packet source list include the native implementation.

### Client bridge

In client.mjs, import the factory:

    import { createOrganisationReconciliationClient } from './organisation_reconciliation_client.mjs';

In the existing IatiWorkspaceClient constructor, after the original private request state is initialized:

    this.organisationReconciliation = createOrganisationReconciliationClient(
      (path, options) => this.#request(path, options)
    );

In client.d.mts, import the named interface and add the property to the existing class:

    import type { OrganisationReconciliationClient } from './organisation_reconciliation_client.mjs';

    readonly organisationReconciliation: OrganisationReconciliationClient;

Import additional feature types directly from organisation_reconciliation_client.mjs to avoid collisions with the base client's generic Review, Sha256 or RequestOptions names.

### Browser hooks

Load the new assets before the existing deferred app.js:

    <link rel="stylesheet" href="/organisation_reconciliation.css">
    <script src="/organisation_reconciliation_ui.mjs" defer></script>

The .mjs asset is valid as a deferred classic script and assigns window.IatiOrganisationReconciliationUi. Serve it with text/javascript; charset=utf-8. It mounts its own navigation entry and panel when initialized.

Add one module variable alongside the existing workflow modules:

    let reconciliationUi;

Initialize it with the original helpers:

    reconciliationUi = window.IatiOrganisationReconciliationUi({
      get, post, request, action, status, download, metrics, table, properties, details,
      refreshWorkspace: refresh, show, isBusy: () => busy
    });

Call reconciliationUi?.refresh() in the existing workspace refresh and reconciliationUi?.buttons() in the existing busy-state update. Preserve the existing organisation, publishing, result and refresh hooks.

The new module can also open a selected organisation through:

    reconciliationUi.newFromOrganisation(planId, revision, organisationKey);

### HTTP, native workspace and installed-source closure

The native reconciliation workspace, HTTP module and Python CLI provide the route contract above. Compose them into the existing IATI workspace and original server routing.

Include the new browser paths in the existing static asset allowlist. Treat .mjs as JavaScript. Include all added native modules, this guide, the client module/types and both browser assets in the maintained source closure in both:

- iati/managed.py
- distribution/runtime-workspace/application-iati.mjs

Keep the current organisation, refresh, results and publishing entries in those lists.

### Original MCP dispatcher and complete-file carrier

Append organisationReconciliationTools(tool) to the current source-workspace catalogue.

Keep the generic original SHA preflight for every existing tool. For `merchant_source_iati_reconciliation_compare` only, leave `before` and `after` objects for its dispatcher to validate their nested IDs and revisions. This preserves the native pinned comparison contract.

Before the original source-workspace switch, dispatch the reconciliation prefix using the existing callbacks:

    return executeOrganisationReconciliation(name, input, {
      workspace,
      page: paged,
      json: (route, body) => this.#json(definition, route, body),
      retain: (route, kind, selected, fileInfo) =>
        this.#retain(workspace, definition, route, kind, selected, undefined, fileInfo),
      receive: (selected, route, kinds) =>
        this.#receivePackage(workspace, definition, selected, route, kinds)
    });

The module wraps normal results as {workspace, native}. File and export results remain the original top-level retained export descriptor.

Add /api/iati/reconciliation/ to the existing extended IATI metadata-route predicate so complete selections and responses use the same 64 MiB ceiling. Add reconciliation and reconciliation-file to the original IATI export limit and metadata allowlists. Add reconciliation ZIP routing to the existing packetRoute/import receiving composition.

The module supplies exact fileInfo names, content types and verifyNativeDescriptor: true. Keep the current #retain verification of X-Content-SHA256 and Content-Length. Reuse #receivePackage; a second importer is unnecessary.

## Source custody

The product retains the selected organisation and activity revisions, original source packages, assessed records, explicit comparisons, issue decisions and named reviews. Historical saves and request results remain addressable after later revisions. Complete receiving returns both the requested imported case and the current case so callers can preserve the original result while continuing current work.
