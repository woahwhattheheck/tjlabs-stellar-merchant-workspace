# Customer statements through merchant MCP

The merchant's original customer statement workspace has a complete remote operating path: maintain customer profiles, assign paid orders, select native service usage, review and retain a statement or correction, recover an interrupted reply, and deliver every original statement and service-period file. Browser, local CLI and MCP share customer IDs, statement IDs, revisions, the accounting lease and retained artifacts.

SDK export: @tokenjunkielabs/starforge-merchant/merchant/accounting-statements. Durable operation helpers: @tokenjunkielabs/starforge-merchant/merchant/accounting-statements/operations.

Run "starforge merchant-accounting-statements" or "starforge merchant-mcp statements". The source CLI is accounting-statement-cli.mjs.

## Connect the existing workspace

Add usage captures to the existing accounting alias. Preserve its other sources and settings.

~~~json
{
  "accounting": {
    "workspaces": {
      "merchant": {
        "label": "Merchant accounting",
        "directory": "/private/merchant/accounting",
        "outboxDir": "/private/merchant/outbox",
        "proofDir": "/private/merchant/proofs",
        "termsFile": "/private/merchant/terms.json",
        "statementUsageInputs": {
          "api_usage": "/private/merchant/exports/api-pass-export.json"
        }
      }
    }
  }
}
~~~

The host reads a usage capture through its configured alias and returns the exact byte length and SHA256. Original service-usage exports and complete API-pass exports use the native parser and statement projection. Import presents that inspected source SHA. A byte-identical repeated capture retains its original import identity.

Open the selected accounting alias before operating. The accounting browser or another owner releases the existing native lease before MCP opens that directory. Ordinary client disconnect releases its file reads. Explicit workspace close drains the owning accounting operation and releases the original lease.

Reuse an initialized MCP connection:

~~~js
import {createAccountingStatementClient} from
  '@tokenjunkielabs/starforge-merchant/merchant/accounting-statements';

const client = createAccountingStatementClient({
  workspace: 'merchant',
  call: existingStructuredMcpCall
});
await client.open();
const customers = await client.allCustomers();
const statements = await client.allStatements();
~~~

Or use the existing authenticated HTTP endpoint:

~~~js
import {connectAccountingStatementClient} from
  '@tokenjunkielabs/starforge-merchant/merchant/accounting-statements';

const client = await connectAccountingStatementClient({
  workspace: 'merchant',
  url: 'http://127.0.0.1:3211/mcp',
  tokenEnv: 'MCP_ACCESS_TOKEN'
});
await client.open();
~~~

The token stays in the named process environment variable. Operation files retain the endpoint, alias and variable name so later execution binds to that connection.

## Operating sequence

1. Read status for the current revision. Page customers, completed runs and usage imports. The allCustomers, allUsage, allBindings and allStatements helpers consume complete inventories and require a consistent original revision across pages.
2. Save the customer profile with its stable reference. An edit selects the original customer ID and current expectedVersion. Every change uses the accounting workspace's current revision and a named actor.
3. Assign original paid order references to that customer. A cross-customer reassignment includes reassign:true and its correction reason. Read order for the exact binding and retained history.
4. Inspect and import configured usage captures by exact SHA256, or select retained imports. Use usageId for a cumulative closing capture, add usageOpeningId to compare two complete native API-pass captures, or use usageId:null for a statement without service usage.
5. Prepare a complete native preview using customerId, runId and the selected usageId and optional usageOpeningId. A correction includes the previous statement ID as replacesId. Optional from/until bounds select original purchases; the service period uses its actual opening and closing capture times.
6. Review the complete preview, retain it with one stable request ID, then export the original files. Read current status when delivering a correction or withdrawal.

A preview summary contains counts, paged details and a previewFile descriptor for the entire native preview. The SDK preview() reads this descriptor through the existing retained-file reader, verifies every chunk and the complete SHA, and checks the native draft digest. It returns the complete preview required for retention.

If the workspace changes before the preview's first file read, the pinned SHA rejects that changed preview. Prepare a fresh preview from current records and review its content.

## Inspect a native service period

The opening and closing captures retain the same original purchased pass, entitlement,
payment, immutable plan and allowance. The native statement engine compares complete
durable calls from those captures. Its source identities, capture times and exact
integer unit amounts carry through MCP unchanged.

~~~js
const pair = {
  usageOpeningId: openingImport.id,
  usageId: closingImport.id
};

// Complete source-bound report, including every route and period activity row.
const report = await client.usagePeriod(pair);

// The same original report with one bounded call page for agent inspection.
const activity = await client.usagePeriodSummary({
  ...pair, view: 'calls', offset: 0, limit: 100
});

const preview = await client.preview({customerId, runId, ...pair});
~~~

Choose the retained IDs from allUsage() or the original import responses. The
usagePeriod() result is the original {period, revision} report. Its period contains
opening/closing source identities and balances, totals, routes and calls. The client
reads its entire usage-period.json through the existing SHA-pinned file reader and
matches the original period digest, both selected import IDs and workspace revision.
A changed observation requires a current read of that same intended selection.

usagePeriodSummary() accepts summary, routes or calls. Follow page.nextOffset until
null for a complete paged view. Totals distinguish new admitted reservations,
consumption completed during the period, released units, carried reservations and
recovered responses for already-consumed calls. An unchanged completed call remains
in the statement's complete closing usage history. Result recovery contributes no
additional consumed units.

The statement preview and retained detail include a servicePeriod summary with
source identities, actual times, balances, totals and route/activity counts. Select
view:'period-routes' or view:'period-calls' to page those rows; neither needs an
orderRef. Existing view:'calls' still reads the complete closing call history for
its selected original orderRef.

The CLI uses the same connection:

~~~sh
starforge merchant-accounting-statements usage-period-summary \
  --url "$MERCHANT_MCP_URL" --workspace merchant --request /private/period-query.json

starforge merchant-accounting-statements usage-period \
  --url "$MERCHANT_MCP_URL" --workspace merchant --request /private/period-selection.json \
  --out /private/reviews/service-period.json
~~~

period-selection.json contains the actual usageOpeningId and usageId. The query
also accepts view, offset and limit. Use private input files and a new output file.
Add those two IDs to the ordinary preview selection, then use the retained
operation below to prepare, execute and recover that exact review. Cumulative
selections omit usageOpeningId and retain their existing normalized request identity.

## Close several customer statements together

The existing operations entry also provides complete [customer closing cycles](./ACCOUNTING_STATEMENT_CYCLES.md).
Prepare a set of original customer/run/capture selections, preserve every full
preview, then execute with one stable native retention request per customer row.
The cycle recovers partial completion and delivers complete customer folders,
current native status snapshots and a readable operator register. Installed
commands are cycle-prepare, cycle-execute, cycle-reconcile and cycle-status.

## Durable review and recovery

~~~js
import {prepareAccountingStatementOperation, runAccountingStatementOperation} from
  '@tokenjunkielabs/starforge-merchant/merchant/accounting-statements/operations';

const preview = await client.preview({
  customerId,
  runId,
  usageId,
  usageOpeningId,
  replacesId: previousStatementId
});

await prepareAccountingStatementOperation({
  directory: '/private/statement-operations/customer-period-02',
  url: 'http://127.0.0.1:3211/mcp',
  workspace: 'merchant',
  tokenEnv: 'MCP_ACCESS_TOKEN',
  kind: 'retain',
  preview,
  actor: 'Merchant accounts',
  requestId: 'customer-period-02'
});

const observed = await runAccountingStatementOperation({
  directory: '/private/statement-operations/customer-period-02',
  execute: true,
  client
});
~~~

The parent directory is private and the operation directory is new. Preparation writes the complete normalized request and review into request.json plus durable state.json. The request is compactly serialized and checked against the same byte limit used when reopening it.

Execution first reads original records. Before sending a change, it retains the sending state. If the reply is lost, it reads the original records again. Statement lookup uses the original request ID and checks the native intent digest, reviewed draft and actor. Exact retry after process restart keeps that request ID, including when the statement has since been withdrawn or superseded.

runAccountingStatementOperation with execute:false performs reconciliation. CLI reconcile --dir has the same behavior; execute --dir permits the retained operation to be sent after reconciliation.

| Action | Retained inputs | Recovery observation |
| --- | --- | --- |
| save | Current revision, profile, actor; original ID/version for edits | Original customer matches the complete requested current profile |
| assign | Current revision, customer ID, original order references/labels; reassignment choice/reason | Every requested original order has that customer and label |
| usage_import | Current revision, actor, source alias and inspected byte SHA | Original import has that exact source SHA |
| retain | Complete reviewed preview, actor, one stable request ID | Original request lookup matches native intent and draft |
| withdraw | Current revision, statement ID, actor and reason | Original current withdrawal history matches that actor and reason |

Resolve a stale revision by inspecting current records and preparing the intended operation from those records. The retained request remains immutable: normalized content and digest agree when reopened.

For a period correction, the complete preview retains both original selected usage IDs together with replacesId. Native correction preserves the previous statement and marks it superseded. Withdrawal retains the actor and reason. Every retained statement continues to expose its own original artifacts.

## Deliver the original files

~~~js
import {exportAccountingStatement, downloadAccountingStatementStatus} from
  '@tokenjunkielabs/starforge-merchant/merchant/accounting-statements/operations';

const delivery = await exportAccountingStatement({
  client,
  statementId,
  directory: '/private/customer-deliveries/statement-02'
});

const status = await downloadAccountingStatementStatus({
  client,
  statementId,
  output: '/private/customer-deliveries/statement-02/current-status.json'
});

await client.disconnect();
~~~

Use a private delivery directory. Export delivers these exact native files:

| File | Contents |
| --- | --- |
| statement.json | Full original customer statement and source selection |
| statement.csv | Original statement rows |
| usage.csv | Original linked service/API usage rows |
| statement.html | Original printable statement |
| manifest.json | Original artifact manifest |
| period.csv | Every new, changed or carried activity row for a service-period statement |
| period-summary.csv | Opening/closing balances and route movements for that period |
| usage-opening.json | Customer-safe normalized opening capture and original source identity |
| usage-closing.json | Customer-safe normalized closing capture and original source identity |

The last four files are present for service-period statements. Cumulative statements retain the original five-file set. Every download uses the native SHA256, expected length and existing resumable file consumer. On restart, export verifies completed files and reuses them. If an earlier client delivered only the original five files of a retained period, the current exporter verifies those same files, receives the four remaining period files and atomically completes delivery.json. The retained delivery identity binds the directory to its accounting alias, statement ID and original file identities.

status.json is a current observation with the workspace revision, observation time and original statement record. Its reader pins the full snapshot when opened. Withdrawal during a multi-chunk read leaves that reader's bytes consistent; a fresh read observes the new status. The separate status download helper discovers and verifies that snapshot's hash while reading it.

For one artifact, downloadAccountingStatementFile uses the original maintenance download implementation with an expected SHA256 and new private output path. A custom consumer can use client.fileChunks(selection, {expectedSha256, signal}); it yields verified chunks and releases an unfinished read when its iterator closes.

## MCP tools and source selections

These tool names begin with merchant_accounting_customer_.

| Suffix | Purpose |
| --- | --- |
| status | Summary or paged customers, runs, usage imports and original recent workspace history |
| save | Save the original customer profile |
| bindings | Page original order assignments |
| order | Read one exact assignment and its history |
| assign | Assign or explicitly reassign original orders |
| usage_source | Inspect an exact host-declared native usage capture |
| usage_import | Import its reviewed byte SHA |
| usage_period | Inspect a pair of original native captures, page route/activity rows, or retrieve the complete period report |
| statement_preview | Review a complete original statement or correction |
| statement_retain | Retain that exact review with a stable request ID |
| statements | Page retained, superseded or withdrawn statements |
| statement_lookup | Recover the original statement by request ID |
| statement | Summary or paged items, closing calls, period routes/activity, adjustments, exclusions, assets and lifecycle history |
| statement_withdraw | Record original withdrawal and reason |

The existing merchant_accounting_file accepts:

| Kind | Selectors |
| --- | --- |
| customer-statement | statementId and one original filename or status.json |
| customer-statement-preview | customerId, runId, usageId, replacesId, optional from/until and usageOpeningId, file:"preview.json" |
| customer-usage-period-preview | usageOpeningId, usageId, file:"usage-period.json" |

Keep every source selector, readId and expected SHA unchanged across chunks. The native nullable usageId and replacesId remain explicitly null; an unused usageOpeningId is omitted. Close and maintenance transitions drain these reads through the existing accounting lifecycle.

Pages contain at most 200 rows. Calls and adjustments select an original orderRef. Customer-status workspace history has the native latest-80 scope; full statement lifecycle history is paged from the selected statement. An assignment accepts at most 2,000 distinct original orders. Native usage input is limited to 24 MB; the complete preview and service-period readers each support up to 128,000,000 bytes.

CLI help lists the commands and JSON selections. Exit 0 means preparation, observation or delivery completed; exit 3 means the prepared effect was not observed; exit 2 reports an error and retained operation location where applicable.
