# Customer closing workbench

Prepare, review, issue, and retrieve customer statements in the existing merchant accounting workspace. The workbench uses the original statement client and closing-cycle engine. It preserves each prepared review, original request, retained statement, and complete customer delivery folder.

## Start the workbench

Use the Node runtime and source tree already installed for the merchant operator. Start the original merchant MCP service with its accounting workspace and service source aliases configured.

Create a private directory owned by the operator:

~~~sh
install -d -m 700 /absolute/customer-closes
~~~

From the repository root, run:

~~~sh
node stellar-forge/mcp-merchant-operator/accounting-statement-cycle-server.mjs \
  --directory /absolute/customer-closes \
  --url http://127.0.0.1:8787/mcp \
  --workspace accounting \
  --actor operator \
  --port 4419
~~~

Open the local address printed by the command, normally http://127.0.0.1:4419.

The merchant token stays in the server environment. The default variable is MCP_ACCESS_TOKEN; use --token-env with the existing configured variable name when different. The workbench binds to loopback. A local browser connects to the workbench, and the workbench connects to the original merchant service.

The directory is for saved closing cycles. Use the same directory after restarting the server. A prepared CLI cycle can also be copied as an intact child directory here and opened from Saved cycles. Preserve its private ownership and permissions. Open it with its original merchant URL and workspace.

## Prepare the customer work

The workspace inventory lists original customer profiles, assigned orders, completed accounting runs, service captures, and retained statements. Refresh workspace reads the complete inventories, including every run page. If the workspace changes during a paged read, refresh once the active operation finishes.

1. Name the cycle.
2. Choose a completed accounting run and, when applicable, closing and opening service captures.
3. Find and select customers, then choose Add selected customers.
4. Adjust the source choices for individual customer rows. Add another period creates another row for that customer.
5. Use Review this statement to inspect a complete current preview.
6. Choose Prepare all reviews to save every customer review before issuing any statement.

The preparation request remains the same when the browser retries. Editing the selections creates a new preparation identity. The original engine resumes an interrupted preparation from the customer reviews already saved.

### Choose the right source period

| Selection | Result |
| --- | --- |
| Completed run without a service capture | Purchase statement from the original accounting run |
| Closing capture without an opening capture | Cumulative service position at that original capture |
| Opening and closing service captures | Original service-period comparison, including carried reservations, recovered results, and unit movements |
| Settlement from/until bounds | Purchase-row filter within the accounting run; enter both bounds in UTC |
| A retained statement under Correct a retained statement | A correction tied to that original statement |

The capture choices show source creation time. That is the time of the original service capture, rather than its later import time. A customer-period row must use the customer's own original source records. The merchant compiler checks customer assignments, source identities, and period compatibility.

## Review the complete statement

The review shows the customer and reference, purchase and service order counts, reconciliation needs, quoted merchant totals, and the original service-period balances when present.

For service periods it includes:

- Opening and closing purchased, consumed, reserved, and available units.
- Period admission, consumption, release, reserved changes, recovered results, and carried reservations.
- Every original route and service call, with table pagination.
- Purchase orders, excluded rows, asset totals, and complete original row detail.

Source identifiers, exact timestamps, and hashes remain available under the source details. Download review JSON retains the complete original preview document.

Prepared cycle reviews are read from the saved review files. The engine checks the complete review and its original selection before statement retention.

## Issue or resume the cycle

Open Saved cycles and select a prepared cycle.

| Action | Behavior |
| --- | --- |
| Issue reviewed statements | Reconciles original requests, retains unchanged reviewed statements, and completes their customer packets |
| Resume closing cycle | Continues the original requests and completes the remaining retention or file delivery |
| Continue preparing reviews | Resumes the saved preparation until every review is available |
| Refresh delivered statements | Reconciles the same retained statements and updates their current status snapshots and delivery indexes |
| Prepare changed rows | Starts a new review for rows whose sources changed after the earlier review |

Each customer's progress remains visible while the cycle runs. The progress reader observes saved atomic customer states without competing for the cycle writer lease. Statement issuance jobs against the same workspace execute in sequence. Review preparation starts immediately and saves the original request before opening its merchant connection. Closing the browser leaves the server operation running.

If the server is stopped, restart it with the same directory and workspace and open the saved cycle. Resume uses the original stable request IDs and retained statement identities. A source change that invalidates a review remains visible on that customer row; select the appropriate current records and prepare the changed row again.

The workbench does not close the merchant accounting workspace when it stops. It disconnects its own connection and retains the saved closing-cycle files.

## Retrieve and hand over the files

Each completed customer row provides Open packet and Download. The customer download is a gzip-compressed tar archive with its index at the archive root. Extract it and open index.html. It contains the complete original statement files, original service-period captures when selected, and the current statement-status snapshot.

Download complete cycle preserves the full operator folder: frozen request and manifest, every saved review, customer state, register, and available complete or partial delivery files. Extract it as a private child directory under the workbench's saved-cycle directory to continue the same work. Open register.html for the customer delivery register.

All saved files also provides individual downloads. Archives and files are read while holding the original cycle lease; customer files with recorded identities are checked during streaming. If a customer file needs recovery, resume its original cycle and retrieve the completed packet again.

Use the individual customer packet for that customer's delivery. The complete-cycle download is the operator's collection across all selected customers.

## Original engine and client

See [Customer statement cycles](ACCOUNTING_STATEMENT_CYCLES.md) for CLI preparation, execution, inspection, and read-only observation.

The workbench imports:

- prepareAccountingStatementCycle
- runAccountingStatementCycle
- observeAccountingStatementCycle
- connectAccountingStatementClient
- accountingStatementSelection
- accountingStatementPreview

The server exports startAccountingStatementCycleWorkbench for installed local applications. It accepts the existing client when the application already owns one and leaves that supplied connection under its caller's control.
