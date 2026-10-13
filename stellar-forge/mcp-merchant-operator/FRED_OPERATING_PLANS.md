# FRED Operating Plans through the installed merchant tools

The existing configured FRED provider exposes six pure procedure tools. They use the same economic model and generic OperatingPlan history as the installed command and browser editor. Native capture and complete source receiving use `starforge fred-operating-plan`.

| Tool | Exact arguments | Returned value |
| --- | --- | --- |
| merchant_fred_operating_inspect | {source} | Validated compact economic source descriptor |
| merchant_fred_operating_create | {input:{source,catalog,id,title?,customer?,owner?,period?,savedAt,registrations?,argvByPhase?}} | Complete OperatingPlan |
| merchant_fred_operating_record | {plan,input:{source,stepId,status,result:{summary,evidenceIds},owner?,savedAt}} | Complete continued plan |
| merchant_fred_operating_compare | {plan,catalog,revision?} | Original full catalog comparison |
| merchant_fred_operating_receive | {incoming,existing?} | {plan,reused,addedRevisions} |
| merchant_fred_operating_render | {plan,format,revision?} | {format:'json',plan} or {format,text} |

Use complete supplied JSON values, a stable plan ID and explicit savedAt for creation and results. All input and returned procedure values allow 32 MiB. The existing FRED workspace request limit remains 128 KiB, and its original paged-result/file-transfer behavior is unchanged. Large native project bundles and publication archives stay in the source package.

## Original source to handover

Capture the existing project and selected complete publications through the native CLI. Keep the full captured package and its exact source.json descriptor. Inspect that package before selecting its compact source in a procedure.

Create the ten-phase economic plan using the actual installed Command Finder catalog: sources, acquisition, review, recurring, releases, migration, historical, publications, customer and handover. Select an original registration before retaining executable argument arrays. The actual economic workspace remains the execution surface.

After the original operation returns, record its reviewed result with exact evidence IDs from the matching retained source. The economic model checks the original project continuation and the selected phase. Preserve customer edits and full earlier revisions.

Receive full plan history with the generic receiver. An identical older prefix preserves a later local head; an identical longer history extends it. Divergent shared revisions preserve both original documents for explicit reconciliation. Render JSON for editable handover and HTML or Markdown for readable procedures. Selecting a historical revision never strips newer JSON history.

## Typed local client

```js
import { FredOperatingClient }
  from '@tokenjunkielabs/starforge-merchant/operator/fred/operating-client';

const client = new FredOperatingClient();
const source = client.inspectSource(retainedSource);
const plan = client.createPlan(completeCreationInput);
const continued = client.recordResult(plan, completeReturnedResultInput);
const current = client.receivePlan(continued, existingPlan);
const readable = client.renderPlan(current.plan, {format:'html'});
```

The variables represent the caller's complete actual source, catalog, original plan and returned result. The client calls the same pure handler as MCP. It performs no HTTP, source acquisition, case write or filesystem read.

Use the native `receive-source` command when moving the complete source/project package. Its request retains sourceDirectory, destination, expectedSource and optional complete plan. The original source receiver restores the project and selected complete publication editions and returns deterministic source/publication receipt bindings.

The configured FRED provider retains its original host lifecycle, shutdown behavior, source/client ownership and every existing economic route. Procedure calls respect the same closing state and return pure values through the existing provider.
