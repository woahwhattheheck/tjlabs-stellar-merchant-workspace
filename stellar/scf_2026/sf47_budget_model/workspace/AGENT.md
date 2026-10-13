# SF47 agent client

agent-client.mjs gives applications typed access to the original planning and delivery service. It uses the same managed launch validation as **Grant planning and delivery** in Applications, and the same authenticated HTTP routes as the browser.

The original Workspace, Operations, forecast and portfolio implementations remain the authorities for saved revisions, source attachments, record states, allocations and calculations. This client opens no SQLite database and stores no alternative business records.

The complete Merchant setup, tools, input references, source-bound pages, downloads, same-ID recovery and receiving workflow are in [Grant workspaces through Merchant MCP](../../../../stellar-forge/mcp-merchant-operator/GRANT_WORKSPACES.md).

## Installation delivery queue

Read `client.read('delivery-queue', {caseId, asOfDate})` and download the complete handover with `client.download('delivery-queue', {caseId, asOfDate})`. The package now includes adjacent TypeScript declarations for the public client, complete queue, installation document and saved-edition workflow. [Installation delivery queue](DELIVERY_QUEUE.md) covers assignment editing, typed consumption, MCP paging, date semantics and complete receiving.

## Complete customer adoption operations

The original Merchant owner now carries native case or Calendar source through whole-plan authoring, pricing, shared capacity scheduling, full comparison, durable source saving and reopening. Use the eleven adoption tools or the typed `grant/cohort-agent` module described in [Complete adoption work through Merchant MCP](COHORT-PLANNING.md#complete-adoption-work-through-merchant-mcp). Full inputs, original funding groups and the native save request remain attached throughout the operation.

## Original merchant settlements

The browser, CLI and typed client now receive original merchant accounting, period-close and accountant sources into the same case. Use settlementPreview for source inspection and a full selected cash preview, settlementReceive for the original atomic save, and settlementCorrectionPreview/settlementCorrect for reviewed corrections. Read saved editions with read('settlements') and read('settlement'); download('settlement') returns their complete source handover. Adjacent TypeScript declarations retain exact decimal strings, settlement IDs, original cash records and both preview shapes.

[Merchant settlements](SETTLEMENTS.md) covers the complete row decisions, original asset units, separate USD valuation, existing-cash links, correction lifecycle, native routes, CLI, MCP and full-case receiving.

## Direct API

First call inspectGrantAgentBinding with directory and optional scenarioFile, pythonExecutable, allowStart and label. It reads the original host selection without launching a process. Construct a GrantWorkspaceClient from that result.

| Method | Original operation |
| --- | --- |
| open({expectedSelectionSha256?}) | Borrow the verified current managed service, or explicitly start its original launcher when allowStart is true. |
| inspect() | Inspect current original launch and connection ownership. |
| browser() | Obtain the same private original browser access link. |
| read(view, selection) | Original plans, plan revision/history, cases, case/report/history, forecasts, portfolios or review. |
| plan(action, planId, body) | Original estimate, save, restore or clone with current revision. |
| createCase(body) | Original case from the reviewed immutable plan/content hash. |
| command(caseId, body) | Original record/review lifecycle command with current version, actor and request ID. |
| forecastPreview(caseId, expectedVersion, inputs) | Pure original remaining-work and dated cash preview. |
| forecastSave(caseId, body) | Original save against the same input and reviewed preview SHA. |
| portfolioSeed(caseId, expectedVersion, forecastId, options?) | Original editable allocation from a saved forecast, with optional exact Installation editions and a complete existing draft. |
| portfolioPreview(caseId, expectedVersion, inputs) | Original complete resource/day alternatives and cash preview. |
| portfolioSave(caseId, body) | Native portfolio.save with the reviewed input, preview SHA, case version, actor and request ID. |
| portfolioSelection(caseId, expectedVersion, portfolioId, alternativeId) | Native selected dates returned as an original forecast input. |
| supportPreview(caseId, expectedVersion, bytes, filename) | Original SF74 support reader and complete source/deployment preview, without saving. |
| supportReceive(caseId, bytes, body) | Native support.receive, retaining the original file and rendered review with an existing or new deployment in the original case transaction. |
| buyerPreview(caseId, expectedVersion, bytes, filename) | Original SF88 source reader, full job/purchase/deployment review and preview SHA, without saving. |
| buyerReceive(caseId, bytes, body) | Native buyer.receive: explicitly selected original jobs remain associated with their original purchase and accountable buyer deployment. |
| download(kind, selection) | Complete original plan, case, forecast or portfolio ZIP, source, scenario or CSV. |
| importBundle(kind, bytes, body) | Original complete plan or case ZIP receiver. |
| importScenario(bytes, body) | Original source JSON with native byte identity. |
| attach(caseId, bytes, body) | Native source attachment. |
| intake(bytes, body) | Existing original source-intake importer. |
| detach(expectedInstanceId) | Drain the client and close only its own original server, or release a borrowed connection. |
| close() | Final process shutdown; drains requests and closes owned original service. |

Native data responses contain value, bytes, mediaType, status, sha256, source and filename. The value is present for JSON; bytes is always the complete exact HTTP body. The source identifies the actual managed instance and source selection. Native financial strings are passed unchanged.

The service accepts complete bundles up to 32 MiB and original source inputs up to 8 MiB. The client receives complete responses up to 64 MiB. The Merchant layer retains large responses and serves exact arrays and byte chunks, so those responses do not have to fit in a model message.

Mutations retain their original requestId and current version/revision. After an interrupted response, recover the original request with the identical payload. The original database rejects a changed payload under that same ID. The client performs no automatic write retry.

A borrowed Applications instance keeps its existing lifetime. A client-started service uses the same original managed startup and workspace lock; the client drains and closes that owned server on shutdown. Keep the access-fragment URL and private launch record with the original operator.

## Original-currency forecasts and portfolio selection

`forecastPreview` and `forecastSave`, and Merchant's corresponding original tools, accept `fxRates` plus per-project `nativePricing` and native receipt amounts within the same complete input object. Source references, inline inputs and `inputPointer` retain their existing routes. See [Original currencies in operating forecasts](CURRENCY.md) for exact decimals, rate direction, dated sources, original payment and cost credits, rounding and coverage. Portfolio selection preserves these complete inputs; assess both selected-scope and dated-cash coverage before using financial deltas or a frontier.

## Portfolio allocation and original cash handoff

The client uses the same saved Forecast, Portfolio, Installation editions and original case requests as the browser. Read `portfolios` or `portfolio` with the original `caseId`; the saved read also requires `portfolioId`. Download a saved calculation with `download('portfolio', {caseId, portfolioId})`. The complete case ZIP carries the receiving workspace, sources, Installation history, saved Forecasts and saved Portfolios.

### Select the original phase source

The original three-argument `portfolioSeed(caseId, expectedVersion, forecastId)` call remains supported. An optional fourth argument selects exact Installation editions and can retain a complete current draft:

```ts
import type {
  GrantPortfolioInputs,
  GrantPortfolioInstallationSelection
} from './agent-client.mjs';

const current = await client.read('case', { caseId });
const originalSeed = await client.portfolioSeed(
  caseId, current.value.program.version, forecastId
);
// Review the complete candidates and original commercial task IDs.
const installationSelections: GrantPortfolioInstallationSelection[] =
  reviewedEditionSelections;
const draft: GrantPortfolioInputs = existingDraft ?? originalSeed.value.inputs;
const phased = await client.portfolioSeed(
  caseId, current.value.program.version, forecastId,
  { installationSelections, inputs: draft }
);
```

`reviewedEditionSelections` contains the caller's actual `taskId`, `installationId`, `installationRevision` and `installationSha256` selections. `existingDraft` is the complete editable input if work is already in progress. The returned `value.inputs` retains the original task set, resources and alternatives while joining the selected phase source into the base plans. Seed preserves every explicit alternative override, including `installationPlans: []`. Retain the full returned JSON; candidate metadata includes the original owners, quoted hours, dependencies and delivery/support terms.

Enter each phase's explicit remaining hours and resource effort, retain all original phases and dependencies, and select `deliveryPhaseIds` with a `deliveryBoundaryNote`. Phase remainders must equal the original parent remainder; each effort map must equal its phase remainder. The parent's original aggregate effort stays retained while phase effort drives the shared schedule. Set the bound parent's minimum working duration to zero. A phase priority of `null` inherits the aggregate task priority; every integer is explicit, including `100`. Newly seeded phases use `null`. Support after the delivery boundary continues to consume capacity.

The seed copies original quoted phase effort and stated durations when the parent remainder equals the full original quote. Otherwise, remaining effort starts unentered. A current observation/coordination successor keeps the entered base phase draft when its original plan and effort are unchanged. Review a newly revised plan's complete preparation before saving. An explicitly overridden alternative retains its own source edition until it is deliberately refreshed.

An alternative's `installationPlans` is a complete field override. Omission inherits the base array. Each included phase plan retains all its original phases; an explicit `[]` uses the original aggregate tasks and their entered resource effort. Original acceptance observations remain source information; explicit remaining hours are separate inputs.

### Prepare one explicit phase alternative

Source selection updates the base phase plans. To prepare or refresh a named alternative, compose its complete inherited fields as a temporary base, then use the returned phase plans as only that alternative's explicit override. Start with `editedPortfolioInputs`, the full current input after source selection and editing. The empty array is preserved when it is the authored starting point.

```ts
const alternativeDraft: GrantPortfolioInputs = editedPortfolioInputs;
const alternative = alternativeDraft.alternatives.find(item => item.id === alternativeId);
if (!alternative) throw new Error('Select an existing named Portfolio alternative.');
const effective: GrantPortfolioInputs = {
  ...structuredClone(alternativeDraft),
  calendar: structuredClone(alternative.calendar ?? alternativeDraft.calendar),
  resources: structuredClone(alternative.resources ?? alternativeDraft.resources),
  tasks: structuredClone(alternative.tasks ?? alternativeDraft.tasks),
  installationPlans: structuredClone(
    alternative.installationPlans ?? alternativeDraft.installationPlans ?? []
  ),
  alternatives: []
};
const forAlternative = await client.read('case', { caseId });
const preparedAlternative = await client.portfolioSeed(
  caseId, forAlternative.value.program.version, forecastId,
  { installationSelections: reviewedAlternativeSelections, inputs: effective }
);
const refreshedDraft: GrantPortfolioInputs = {
  ...structuredClone(alternativeDraft),
  alternatives: alternativeDraft.alternatives.map(item =>
    item.id === alternativeId
      ? {
          ...structuredClone(item),
          installationPlans: structuredClone(
            preparedAlternative.value.inputs.installationPlans ?? []
          )
        }
      : structuredClone(item)
  )
};
```

`reviewedAlternativeSelections` is the complete set of exact edition selections the caller is applying to that alternative. Review its returned source metadata, phase effort and delivery boundary, then preview `refreshedDraft` as the whole comparison. Every other field and alternative stays in that complete draft.

### Preview, retain the request and reopen the saved result

The following sequence starts after `reviewedInputs` contains the complete authored allocation and the complete preview has been reviewed. The path and request ID are the caller's actual private selections. Save the request before dispatch so an interrupted response can be recovered exactly.

```ts
import { writeFile } from 'node:fs/promises';
import type { GrantModelSaveInput } from './agent-client.mjs';

const beforeSave = await client.read('case', { caseId });
const preview = await client.portfolioPreview(
  caseId, beforeSave.value.program.version, reviewedInputs
);
// Present preview.value, including phase results, findings and original cash.
const request: GrantModelSaveInput = {
  expectedVersion: beforeSave.value.program.version,
  inputs: preview.value.inputs,
  expectedPreviewSha256: preview.value.previewSha256,
  actor,
  note: reviewNote,
  requestId: portfolioRequestId
};
await writeFile(portfolioRequestFile, JSON.stringify({ caseId, request }) + '\n', {
  flag: 'wx', mode: 0o600
});
const saved = await client.portfolioSave(caseId, request);
const portfolioId = saved.value.recordId;
const retained = await client.read('portfolio', { caseId, portfolioId });
await writeFile(portfolioRecordFile, retained.bytes, {
  flag: 'wx', mode: 0o600
});
```

A Portfolio save receipt contains the case `id`, new `version`, `action: 'portfolio.save'`, `kind: 'portfolio'` and saved `recordId`. Reopen `recordId` for the native record's `sha256` and `previewSha256`. The response's outer `sha256` identifies HTTP bytes. Keep these identities with their respective objects.

After an interrupted save, read the retained request file and call `portfolioSave` with the identical case ID and payload. Retain the original request ID, version, input and preview digest even if the case now has a later version. The existing transaction resolves an accepted replay. A definite original stale-source or version conflict requires reopening and reviewing current state before authoring a new request.

### Select dates and save the original Forecast

A saved `READY` alternative can be opened in the original Forecast. The selected delivery boundary governs the commercial work dates; later support remains part of the Portfolio's shared-resource schedule. Read the current case version, select the original saved alternative, then preview the complete returned Forecast input:

```ts
const forSelection = await client.read('case', { caseId });
const selected = await client.portfolioSelection(
  caseId, forSelection.value.program.version, portfolioId, alternativeId
);
const cashPreview = await client.forecastPreview(
  caseId, forSelection.value.program.version, selected.value.inputs
);
// Review the complete original Forecast, including cash and collection timing.
const forecastRequest: GrantModelSaveInput = {
  expectedVersion: forSelection.value.program.version,
  inputs: selected.value.inputs,
  expectedPreviewSha256: cashPreview.value.previewSha256,
  actor,
  note: forecastReviewNote,
  requestId: forecastRequestId
};
await writeFile(forecastRequestFile,
  JSON.stringify({ caseId, request: forecastRequest }) + '\n',
  { flag: 'wx', mode: 0o600 });
const forecastSaved = await client.forecastSave(caseId, forecastRequest);
const forecastRecord = await client.read('forecast', {
  caseId, forecastId: forecastSaved.value.recordId
});
```

Selection is a calculation; `forecastSave` performs the existing original save. Its receipt has the same five fields, with `action: 'forecast.save'` and `kind: 'forecast'`. Native prices, costs, rates, credits, receipt dates and event-dependent terms remain in the complete selected input. Review financial coverage separately from operational readiness. A concurrent case change returns the original service's version/source result.

### Deliver and receive the complete work

Download both the calculation and the whole case as exact native bytes:

```ts
const allocation = await client.download('portfolio', { caseId, portfolioId });
await writeFile(portfolioZipFile, allocation.bytes, { flag: 'wx', mode: 0o600 });
const completeCase = await client.download('case', { caseId });
await writeFile(caseZipFile, completeCase.bytes, { flag: 'wx', mode: 0o600 });
```

Use the existing client binding and managed launch on the receiving host. Retain the full case ZIP and the receiving request before `receiver.importBundle('case', completeCase.bytes, {name, actor, requestId})`. On success, reopen the returned `value.id`, list its saved Portfolios and select the retained saved ID. Read the received case's version for any new operation. Continue from a new editable draft when changing a saved allocation.

The full case receiver restores saved Installation editions, exact attachments, Forecasts, Portfolios and event history. The Portfolio ZIP supplies the complete calculation and source handoff. Preserve the full case bytes and original import request ID for exact receiving replay. Always close an owned client in `finally`; a borrowed application keeps its existing process lifetime.

### Merchant MCP

Use the existing `merchant_grant_portfolio_seed` with `workspace`, `caseId`, `expectedVersion`, `forecastId` and optional `installationSelections`. An existing complete draft may be supplied inline as `inputs`, or by `input` plus `expectedInputSha256` and optional `inputPointer`. The provider uses the original verified model-input reader for both routes.

For a retained complete seed or preview file, `inputPointer: '/inputs'` selects the actual editable input after the full file's SHA is verified. Read large source candidate, phase or result arrays through the existing retained snapshot/page tools while preserving the same snapshot ID and digest. A compact tool response is an index into that full retained response.

Preview and save use `merchant_grant_portfolio_preview` and `merchant_grant_portfolio_save`. Saved date selection uses `merchant_grant_portfolio_selection`, and its returned `/inputs` goes through the original Forecast preview/save tools. Export and import continue through the original complete-case tools. [Portfolio delivery allocation](PORTFOLIO.md) explains the operator decisions and source terms.

## Receive the original merchant support handoff

Use the unchanged JSON file exported by Merchant Support. The client accepts its complete nonempty bytes up to the native 8 MiB attachment bound. Its original filename is part of the preview identity; retain that exact filename and byte sequence through receiving and retries.

~~~js
const preview = await client.supportPreview(caseId, version, handoffBytes, filename);
// Review preview.value.report, .reader, .source and .deployments.
const received = await client.supportReceive(caseId, handoffBytes, {
  expectedVersion: version,
  filename,
  expectedPreviewSha256: preview.value.previewSha256,
  deploymentId,
  actor,
  requestId,
  note: 'Receive the original support file with its existing deployment.'
});
~~~

For a new deployment, use deploymentId: null (or omit it) and deployment containing the original editable fields. Existing deployment selection permits no nonempty competing deployment object. The client excludes generated IDs, sourceIds, versions and recordedBy from new-deployment input; the original service validates the chosen operator, role, environment, work packages and receiving date.

The native support.receive command re-previews the file and compares expectedPreviewSha256 inside its existing request transaction. It retains the exact handoff, native rendered report, deployment/source association, event and request receipt together. Same-file/report association can return unchanged with the original version. Read the actual receipt and current case instead of assuming a version increment.

Preview is read-only: native reader availability, size and busy errors retain their definite original outcome. Receiving uses the same after-dispatch uncertainty and original-ID recovery as the other case writes. Source/case/reader changes require a fresh preview; an interrupted accepted write requires the identical original payload and request ID.

Source downloads and complete case export/import preserve the original file, retained report and deployment associations. The original operator, CLI, environment fields and native reader lifecycle are documented in [Merchant support in delivery operations](SUPPORT_DELIVERY.md).


## Receive original buyer observations

Use the complete original JSON exported by [Native buyer work in delivery Operations](BUYER_OPERATIONS.md). The file contains selected original SF88 Inbox sources and their native outcome/retained-output observations. Keep it private with the operating case. The client passes its nonempty original bytes, up to 8 MiB, to the installed native reader.

```js
const preview = await client.buyerPreview(caseId, version, handoffBytes, filename);
// Present every preview.value.rows entry and its original source, issues,
// receiving classification, matches and suggestedPurchaseId for review.
// selections contains only the operator's explicit original job choices.
const received = await client.buyerReceive(caseId, handoffBytes, {
  expectedVersion: version,
  filename,
  expectedPreviewSha256: preview.value.previewSha256,
  deploymentId,
  selections,
  actor,
  requestId,
  note: 'Receive the selected original buyer observations.'
});
```

Each selection is exactly `{jobId, purchaseId}`. The jobId is the original 64-character SHA-256 identifier, and purchaseId is the explicit original `purchase-...` ID or null for a new original purchase. Select one through 100 distinct original jobs; the native preview determines whether each is receivable and which existing intent or transaction it matches. The same existing purchase cannot be selected for two different source jobs.

Select an existing buyer or combined deployment by deploymentId, with no nonempty competing deployment object. A later observation retains its original purchase's deployment. For a new deployment use deploymentId:null or omit it, and provide deployment with its original name, operator and explicit role BUYER or BOTH. Other editable fields follow the existing deployment contract: participantClass, environment, state, original work-package costIds, tranche, source/reference details and actual handover fields. Generated identity, source associations, version and recordedBy remain native-owned.

buyerPreview is read-only. buyerReceive preserves the exact filename, bytes, reviewed preview SHA, current case version and stable requestId. It invokes the original command transaction directly; it does not reconstruct or edit payment fields. The native source reader determines the original intent, attempt, amount, asset/network, settlement and output observations. A later recovery remains linked to the existing purchase.

The returned value contains version, recordId (the deployment), sourceIds, sourceSha256, selectedJobIds, purchaseIds, totalSourceJobs, unselectedJobIds and unchanged. The whole source remains retained even for jobs left unselected; only selected native purchase records contribute to case metrics. An identical source association can return unchanged. Read the actual returned version and the current case.

A definite version/preview/source-identity conflict requires a fresh review. After an interrupted receive response, preserve and resubmit the identical original requestId, filename, byte sequence and payload; the original transaction returns its committed result before applying a later case-version check. The client makes no automatic write retry.

Download each sourceId through `download('source', ...)` and export the complete case with `download('case', ...)`. The normal case import retains exact buyer JSON and native HTML, job-to-purchase links, source metadata and original history alongside Completion, Support, forecasts and portfolios. Reopen the returned received case ID; do not assume an import replaces another operating case.

## Completion assignments, payment clocks and prepared forms

The completion client uses the same operating case and original work packages as the browser’s Completion tab. The award’s day 30/90/150 delivery schedule remains alongside the form deadline: each received T0, T1 or T2 grant payment starts the next tranche’s 90-calendar-day completion clock. A T3 payment remains the final receipt. The original service handles calendar arithmetic, payment corrections, recorded confirmations and the case’s OPERATIONS or WALKTHROUGH mode.

| Method | Original operation |
| --- | --- |
| read('completion', {caseId, asOfDate?}) | Complete payment clocks, original and confirmed deadlines, assignments and currently recorded issuer outcomes. |
| completionSeed(caseId, expectedVersion, tranche) | All original tranche packages and their saved or seeded assignment input. |
| completionSave(caseId, body) | Save the complete input in the native completion plan. |
| completionPreview(caseId, expectedVersion, {receiptId, asOfDate?, summary}) | Preview the completed deliverables and their original payment-based form. |
| completionPrepare(caseId, body) | Freeze the reviewed preparation and its entire original business snapshot. |
| completionExtension(caseId, body) | Retain an issuer-confirmed later deadline on the original payment. |
| completionSubmit(caseId, body) | Record the actual original form receipt against a frozen preparation. |
| completionDecision(caseId, body) | Record ACCEPTED, CHANGES_REQUESTED or WITHDRAWN on that original receipt. |
| download('completion', {caseId, reviewId}) | Complete prepared ZIP: form JSON, readable HTML, deliverables CSV, selected original source bytes and file manifest. |

Every write body includes expectedVersion, requestId and actor; note is an optional case-operation note. The specialized methods pass that envelope through the original command transport and native request journal. They never automatically retry an uncertain write.

completionSave also takes inputs. The seed’s value.inputs includes every original cost ID, accountable contributors, assignment dates, completed result, and linked work, deployment and source IDs. Save the complete object. For a later change in a linked work record’s contributor/cost or a deployment’s tranche/packages, preview identifies the association that needs an updated assignment. The older saved plan and its event remain in the case’s history and complete export.

completionPrepare takes receiptId, asOfDate, summary and expectedPreviewSha256. Keep the exact calendar date and summary used in the preview. Read the current case after the preparation to obtain its new version.

~~~js
const current = await client.read('case', {caseId});
const proposed = await client.completionPreview(caseId, current.value.program.version, {
  receiptId, asOfDate, summary
});
if (!proposed.value.ready) {
  // Present the native deliverable issues to the operating user.
  return proposed.value.issues;
}
const prepared = await client.completionPrepare(caseId, {
  expectedVersion: current.value.program.version,
  requestId: preparationRequestId, actor,
  receiptId, asOfDate, summary,
  expectedPreviewSha256: proposed.value.previewSha256
});
const review = await client.read('review', {
  caseId, reviewId: prepared.value.recordId
});
const files = await client.download('completion', {
  caseId, reviewId: prepared.value.recordId
});
~~~

The prepared review’s businessSha256 is the source identity expected by completionSubmit; it is distinct from the downloadable ZIP’s file SHA. The actual SCF form receipt supplies submittedOn and formReference. Record it using reviewId, expectedReviewSha256, optional sourceIds and sourceNote. If the operating case advanced after the form was prepared, the receipt retains that original frozen preparation and reports whether its source is still current.

completionExtension takes receiptId, confirmedOn, deadlineOn, reference, optional sourceIds and confirmationNote. confirmationNote becomes the original extension record’s note; the outer note remains the case-operation note. The service keeps the original 90-day deadline and uses the retained confirmation only on or after confirmedOn. Forecast assumptions and an extension request do not establish an issuer confirmation.

completionDecision takes outcomeId, state, date, sourceNote and optional sourceIds. It updates the recorded issuer outcome while preserving the form identity, prepared source and earlier events. Use a newly prepared form and the actual new form reference for a resubmission.

asOfDate selects which payment, confirmation and submission dates participate in the calendar view. Issuer outcomes display their current recorded state. Complete case export/import retains all completion plans, confirmations, form receipts, source files and complete frozen reviews.

## Cohort acceptance through the existing native case

The maintained typed client and original MCP provider delegate the complete workflow to this same Operations service. See [OPERATIONS-COHORT.md](OPERATIONS-COHORT.md) for the original rule and explicit review inputs.

| Typed client | Original MCP tool | Native result |
| --- | --- | --- |
| `cohortSeed(caseId, expectedVersion, tranche)` | `merchant_grant_cohort_seed` | Pinned proposed tranche-2/3 rule, original purchase/deployment/source inventory and complete input seed. |
| `cohortPreview(caseId, expectedVersion, inputs)` | `merchant_grant_cohort_preview` | Exact cutoff measurement, numerator/denominator scopes, source findings and reviewed preview digest. |
| `cohortPrepare(caseId, body)` | `merchant_grant_cohort_prepare` | Original `cohort.prepare` request receipt and immutable review identity, including unmet findings. |
| `read('review', {caseId,reviewId})` | `merchant_grant_review` | Complete original frozen review, source snapshot and observation history. |
| `download('cohort', {caseId,reviewId})` | `merchant_grant_export` with `kind:'cohort'` | Complete private evidence ZIP with readable result, CSV tables and original files. |

The preparation body is `{expectedVersion,requestId,actor,note?,inputs,expectedPreviewSha256}`. Preserve the exact body and request ID after an uncertain result. It replays the first committed case result before the case-version check. The provider can take the complete `inputs` inline or through its existing verified original input/snapshot/transfer selection, with `inputPointer` selecting the original seed's `/inputs`. It does not create a second input journal or a second business case.

Cohort input references use the original 32 MiB request allowance. The provider verifies the complete selected file's SHA and bytes before applying an explicit `inputPointer`, then sends the selected native JSON object; the full HTTP envelope must still fit 32 MiB. Use the existing chunked input transfer for a full file and retain its completion digest. The ordinary 8 MiB source-upload and other model-input limits remain those of their original operations.

Read the whole cohort preview before freezing it: its `/observations`, `/intents`, `/targets` and source findings are available through the original snapshot and row interfaces. Preserve the exact reviewed input, current case version and preview SHA. A freeze can retain unmet targets as a complete review; when a real preceding tranche payment exists, select the intended saved reviews in Completion and read its full combined findings before preparation. An empty `cohortReviewIds:[]` is an explicit selection and has its own native preview; omission retains the earlier request shape. Keep the same choice and order from preview through preparation.

Both `completionPreview` and `completionPrepare` accept optional `cohortReviewIds`, at most twenty distinct original review IDs. The corresponding `merchant_grant_completion_preview` and `merchant_grant_completion_prepare` retain that same optional array. Omit it when no cohort is selected to preserve the previous request shape. Currentness, the correct tranche, the observation cutoff and unmet target/source findings are checked by the original service. The prepared form and complete export embed the selected immutable evidence.

A `COHORT_EVALUATION` may truthfully retain unmet targets. There is no additional submission endpoint, payment action, award date or generated independent participant. The original payment-based completion clock, deliverables, form receipt and issuer outcome keep their existing owners and identities.

MCP responses use the same retained complete-file and array-page interfaces as other Operations results. Page the original `/observations`, `/intents`, `/targets` and other arrays from the returned immutable snapshot; preserve its ID and SHA. An oversized row remains available from the complete original file. Reopening the review or export does not recapture an Inbox or repeat a provider/payment operation.

## Customer installation editions and complete receiving

The original client and MCP provider operate the same Customer installations desk:

| Native client | MCP operation | Original selection |
| --- | --- | --- |
| `read('installations', {caseId})` | `merchant_grant_installations` | Current installation heads in the selected case. |
| `read('installation', {caseId, installationId, revision})` | `merchant_grant_installation` | A complete immutable edition; omit revision to select its current head. |
| `read('installation-history', {caseId, installationId, before, limit})` | `merchant_grant_installation_history` | Follow the returned `nextBefore` on this same installation. |
| `installationSeed(caseId, expectedVersion)` | `merchant_grant_installation_seed` | Complete editable document at `/document` plus original case/plan identity. |
| `installationPreview(caseId, body)` | `merchant_grant_installation_preview` | Exact document, case version, installation ID and current edition. |
| `installationSave(caseId, body)` | `merchant_grant_installation_save` | Original reviewed document, preview SHA, operator, save reason and request ID. |
| `download('installation', {caseId, installationId, revision})` | `merchant_grant_export`, kind `installation` | Complete case and selected-edition handover ZIP. |

A preview body is `{expectedVersion, installationId, expectedRevision, document}`. New installations select `installationId:null, expectedRevision:0`; a next edition selects the original stable ID and its current revision. Save adds `requestId, actor, note, expectedPreviewSha256`. The typed client maps this to the original `installation.save` case command and preserves the original request on recovery.

The MCP tools accept the complete document as `inputs` or the existing verified `input` reference plus its exact SHA. Use `inputPointer:'/document'` to select the seed document from a complete retained response. Read the full preview findings and original selected records before saving. The source desk remains the authority for workorders, commercial terms and existing purchase observations.

Import the selected handover through the original case receiver. Its response includes `selectedInstallation`; read that exact ID/revision in the returned receiving case. The ZIP retains its original readable rendition and every prior edition. The matching managed Python/Node launch source lists include the complete installed operating modules and mounted UI. Adopt both readers with the native/client/provider joins before reopening a changed release. [INSTALLATIONS.md](INSTALLATIONS.md) contains the full input, API, CLI and receiving contract.

## Original implementation evidence

The current complete catalogue adds `merchant_grant_implementation_source`, `merchant_grant_implementation_preview` and `merchant_grant_implementation_prepare`. These methods use the original case version and command journal. Preview/prepare accept the existing whole-file hash-verified input and optional JSON-pointer transport. `merchant_grant_export` supports `implementation` (case/review) and `implementation-original` (case/source/SHA-256). Completion preview/prepare accept optional ordered `implementationReviewIds` (up to 20 distinct original reviews). See [the complete operator, typed-client and source-provenance contract](IMPLEMENTATION_EVIDENCE.md). The selected complete catalogue has 67 tools; previous receipt records retain their original catalogue identities.

## Contributor Engagements

The complete typed client, eight Merchant tools and original Forecast/Portfolio receiving course are documented in [Contributor Engagements](ENGAGEMENTS.md#typed-client-and-merchant-mcp). They retain the original source attachments, immutable agreement reviews, decimal amounts, command identities and complete case exports. Both `engagement.prepare` and `engagement.receiving` require a nonempty recorded note; current Work/Invoice and Installation operations remain on their original implementations.


### Client and provider shutdown

`detach(expectedInstanceId?)` stops new client requests before it waits for already accepted operations. It coalesces concurrent detach/close calls, reads the final retained connection after those operations drain, and stops only its own original launcher. Borrowed application processes remain owned by their original host. After successful detach, an explicit `open()` can reconnect the same client. A failed detach keeps admission stopped and preserves the same child/connection for another detach attempt. Permanent `close()` keeps admission stopped and can be called again after a failed close; it does not create a replacement launcher.

The original launch process remains owned through its `close` event and complete stdout/stderr closure, including late output errors. Its result retains the first output/launcher error and a bounded diagnostic tail. Startup failures remain primary if stopping that same child also reports an error. The Merchant provider drains all accepted calls, then attempts every retained file reader and client close even when another independent owner fails. Retry `close()` on that same provider after resolving the reported owner failure; its original objects and immutable results remain retained.

## Saved customer-use calendar

The optional `document.useCalendar` records complete useful tasks, dated uses, separate DIRECT/PREPAID funding groups and original buyer receipt associations in the same immutable Installation history. The **Customer use** tab reads exact saved reports alongside current receipt/source changes, expands explicit working dates into an editable draft, exports JSON/CSV/ICS, and stages the original Cohort inputs while preserving an existing edited draft. See [Customer-use calendar](CUSTOMER_USE_CALENDAR.md) for the full document, CLI, typed client, MCP and independent receiving workflow.


## Named staff and complete installation receiving

Open **Team workspace** at `/team` from the original private owner link. Enroll lead, finance, reviewer and contributor profiles against the existing case and contributor identities. Named HTTP sessions use individual cookies and a CSRF value; the original case commands record the enrolled actor. The contributor desk records original work and invoices and shows their paid, open and credit balances.

[STAFF_ACCESS.md](STAFF_ACCESS.md) contains the operating workflow and role matrix. [STAFF_INSTALLATION.md](STAFF_INSTALLATION.md) covers whole-database backup, source and attachment transfer, individual SSH access and independent recovery. Both Applications launchers include the same named-staff source inventory.

The full operating receiving entrypoint is `python3 STAFF_WORKFLOW_RECEIVING.py --output /absolute/private/receiving --node /absolute/path/to/node`. It operates the original local server through named staff HTTP and browser sessions, then opens the same complete installation in a separate recovered destination. Existing trusted integrations retain the original owner bearer API.


## Recorded cohort delivery agent

The nine `merchant_grant_cohort_delivery_*` tools take the original saved adoption source and frozen review through explicit identity/intent editing, complete comparison, source refresh, reviewed preparation, native save/recovery and JSON/CSV/HTML receiving. They share the existing source request owner with the adoption tools. Source refresh retains invalidated choices in complete editable input with the exact finding, so the same edit operation repairs the association. The public typed module is `@tokenjunkielabs/starforge-merchant/grant/cohort-delivery-agent`. See [the complete source selection, tool, native request and receiving workflow](COHORT-DELIVERY.md#merchant-agent-workflow).
