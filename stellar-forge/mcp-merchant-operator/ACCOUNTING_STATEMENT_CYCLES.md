# Customer statement closing cycles

A closing cycle reviews and delivers several original customer statements through
the existing merchant accounting connection. It preserves every native preview,
retention request and customer packet independently, so a partial close can resume
without issuing completed statements again.

Use the installed `starforge merchant-accounting-statements` command. The same
helpers are exported from
`@tokenjunkielabs/starforge-merchant/merchant/accounting-statements/operations`.
The existing customer statement workspace owns customer profiles, paid-order
assignments, service captures, statement retention and corrections.

## Operate the customer workbench

The [customer closing workbench](ACCOUNTING_STATEMENT_WORKBENCH.md) joins the
original customer, completed-run and service-capture inventories to these same
review, execution, recovery and customer-packet operations.

~~~sh
node stellar-forge/mcp-merchant-operator/accounting-statement-cycle-server.mjs \
  --directory /absolute/customer-closes \
  --url http://127.0.0.1:8787/mcp --workspace merchant \
  --actor "Merchant accounts" --port 4419
~~~

The workbench opens on the local loopback interface. Its server uses the existing
merchant connection and private closing-cycle directory.

## Select the original customer periods

Read the current customer, completed-run and usage inventories through the existing
statement client. Each cycle entry is an ordinary normalized statement selection:

| Field | Source |
| --- | --- |
| customerId | The saved original customer |
| runId | The completed original reconciliation containing that customer's purchases |
| usageId | The retained closing service capture, or null for no service usage |
| usageOpeningId | The retained opening capture for a native service period |
| replacesId | The current retained statement being corrected, when applicable |
| from / until | Optional original purchase bounds |

Opening and closing captures must describe the same original purchased API pass.
The service period uses their actual capture times. Purchase bounds continue to
select original purchases separately. Cumulative selections remain supported.

Save the selections as one private JSON array. Each complete normalized selection
appears once in a cycle. Customer names, source identities, periods and exact unit
amounts come from the original previews.

## Prepare the complete review

~~~sh
starforge merchant-accounting-statements cycle-prepare \
  --dir /private/customer-closes/service-close \
  --url "$MERCHANT_MCP_URL" --workspace merchant \
  --actor "Merchant accounts" --label "Customer service close" \
  --request /private/current-statement-selections.json
~~~

Preparation opens the recorded original connection, reads each complete native
preview through its existing file reader and saves the exact review. A completed
manifest and readable register are published only after every selected preview is
present. This operation prepares the reviews; the execute command applies them.

If preparation is interrupted, repeat the same command and input. The same
directory accepts the same endpoint, workspace, actor, label and normalized
selections. Complete saved previews are retained and the remaining previews are
received. A different selection belongs in a new cycle directory.

The command reports the cycle ID, preparation outcome and the complete
`register.html` and `register.json` paths. The HTML register shows each customer,
actual capture period, period consumption and original retained status. Open the
complete saved reviews when assessing a correction or source selection.

The equivalent client operation is:

~~~js
import {
  prepareAccountingStatementCycle,
  runAccountingStatementCycle
} from '@tokenjunkielabs/starforge-merchant/merchant/accounting-statements/operations';

const review = await prepareAccountingStatementCycle({
  directory: '/private/customer-closes/service-close',
  url: merchantMcpUrl,
  workspace: 'merchant',
  actor: 'Merchant accounts',
  label: 'Customer service close',
  selections: originalCustomerSelections,
  client: existingStatementClient
});
~~~

The provided client must use that recorded workspace and, when it declares an
endpoint, the same endpoint. A helper-created connection reads its token from the
recorded environment variable, `MCP_ACCESS_TOKEN` by default. The private cycle
records the variable name and original connection.

## Execute and finish delivery

~~~sh
starforge merchant-accounting-statements cycle-execute \
  --dir /private/customer-closes/service-close
~~~

For each customer, execution first looks up the original retention request. An
already-retained statement must match the frozen preview, original normalized
intent and actor. Once the cycle has observed a retained statement UUID, later
recovery must return that same UUID.

For an unretained row, the client reads a current native preview. Its complete
draft digest and normalized selection must equal the saved review. Only then is
the current workspace revision retained as the sending revision for that same
request. This allows earlier customers in the cycle to advance the workspace
while keeping every later reviewed statement unchanged.

The native retention request ID is stable for that cycle entry. If the reply is
lost, the client looks up that same request before continuing. Each customer's
progress is saved separately; completed statements and exports survive an
interruption affecting another customer.

After retention, the original exporter receives every retained file and verifies
its native SHA and byte length. Existing completed files are checked and reused.
The cycle then receives the original current `status.json` through the pinned
reader and creates that customer's printable `index.html`. Completion means the
whole customer packet has been received.

~~~js
const delivery = await runAccountingStatementCycle({
  directory: review.directory,
  execute: true,
  client: existingStatementClient
});

for (const row of delivery.rows) {
  // These are the original producer fields for the pricing or customer case.
  const source = {
    customerId: row.customer.id,
    usageOpeningId: row.intent.usageOpeningId,
    usageId: row.intent.usageId,
    previewSha256: row.previewSha256,
    statementId: row.statement?.id,
    requestId: row.requestId
  };
}
~~~

The same source pair and retained statement can be attached to the existing
tariff-performance review, customer quotation or collection case. The cycle
register preserves each plan's own unit basis and original customer outcome.

## Recover a partial cycle

Repeat `cycle-execute` with the same directory to continue intended retention and
delivery. Use `cycle-reconcile` to recover and deliver statements already present
in the original workspace:

~~~sh
starforge merchant-accounting-statements cycle-reconcile \
  --dir /private/customer-closes/service-close
~~~

The complete frozen review remains unchanged throughout recovery. If a customer
profile, purchase source or other draft input changes after review, the register
identifies that row with its actual error. Prepare the changed intended statement
in a new reviewed cycle, using the native `replacesId` when correcting a statement
already retained. Other customer rows continue independently.

The ordinary export checks existing files before reusing them. A changed local
delivery file is reported with its original identity. Preserve the edited copy
separately, use the existing `exportAccountingStatement` helper to receive the
original statement into a fresh private directory, then restore the exact original
file bytes in the cycle's customer packet before repeating the cycle command.

`cycle-status` refreshes the local HTML/JSON register from saved customer progress
without an MCP request:

~~~sh
starforge merchant-accounting-statements cycle-status \
  --dir /private/customer-closes/service-close
~~~

| Row phase | Meaning |
| --- | --- |
| REVIEWED | The complete original preview is saved |
| NOT_RETAINED | Reconciliation found no original retention for this request |
| SENDING | The original retention was being sent; recovery begins with lookup |
| RETAINED | The exact original statement is known; its packet is being received |
| DELIVERED | Every retained file, current status snapshot and customer index was received |
| EXPORT_PENDING | The original statement is known and its delivery needs continuation |
| RECONCILE_PENDING | The same original request needs another observation |
| REVIEW_REQUIRED | The current original draft differs from the saved complete review |

Cycle execute/reconcile exits 0 for a complete cycle and 3 for an incomplete
cycle. Preparation and local status exit 0 when their requested operation
completes. An operation error exits 2 and reports the original cycle directory.
The complete register carries every row; command output keeps the outcome and
rows with errors concise.

## Receive the complete customer packets

The whole cycle is an operator handover directory:

- `request.json` retains the original connection, actor and normalized selections.
- `manifest.json` retains each complete review identity and original customer/source summary.
- `items/000001/review.json` contains that customer's entire original preview.
- `items/000001/state.json` retains that customer's request and current progress.
- `items/000001/delivery/` contains the complete customer packet.
- `register.html` and `register.json` join the current customer outcomes.

Every numbered item follows the same layout. Relative links let an independent
operator open a copied complete cycle, or a customer open their own copied
`delivery` directory, without the original absolute filesystem path.

A service-period customer packet contains the nine native artifacts:
`statement.json`, `statement.csv`, `usage.csv`, `statement.html`,
`manifest.json`, `period.csv`, `period-summary.csv`, `usage-opening.json`
and `usage-closing.json`. Cumulative statements keep their five original
artifacts. The exporter also retains its `delivery.json` identity.

Each packet additionally has the native `status.json` observation and a clean
`index.html`. The index presents the customer's original statement status,
actual service interval, opening/closing balances and complete file links.
Withdrawal reasons and replacement statement references come from the native
status record. A later cycle reconciliation refreshes these current views while
keeping the retained statement files unchanged.

Give a customer their own delivery directory. The whole cycle includes multiple
customers' reviews and belongs with the merchant's receiving operator. The full
cycle can resume through its recorded original connection; the exported customer
files remain independently readable.
