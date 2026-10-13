# Plan customer service close

The **Plan service close** page is part of the existing Customer closing application. It reads each customer's assigned purchased passes, the complete original service-capture catalogue and all retained statement statuses. Select exact opening and closing captures across many customers and passes, inspect gaps or corrections, and prepare one original saved closing cycle.

The same application continues through full customer review, issuing, recovery of partial work and grouped customer handover. Its existing launch command, merchant connection, private work directory and operator identity apply. See [Customer closing workbench](ACCOUNTING_STATEMENT_WORKBENCH.md).

## Prepare a customer close

1. Open **Plan service close** and choose **Refresh service history**. The page reads every native inventory page at one workspace revision. A concurrent original workspace change asks for a refresh while retaining selected browser choices.
2. Choose a completed accounting run. Find customer names, references, purchased plans or order references. The table shows 25 passes per page, their current period position and statement history.
3. Add available periods on the displayed page, or add individual passes. The selected default accounting run is copied into each new selection. Change it on an individual selection when that customer's purchases belong to a different run.
4. Inspect each selected opening and closing. Source label, original capture time and capture identifier distinguish the retained files. Displayed balances come directly from those captures. A statement can also include an explicit purchase-date interval; enter both purchase bounds together.
5. Use **Inspect history** to read current, superseded and withdrawn periods, previous-customer periods, cumulative snapshots and unmatched source references. Each original statement remains downloadable. Choose a gap's retained boundaries, use a prior closing as the next opening, or prepare a correction of a current statement.
6. Name the cycle and choose **Review selected plan**. The plan lists every chosen customer/pass/period, its new-statement or correction relationship, and history notes. Download complete JSON, a CSV register or readable HTML.
7. Choose **Prepare complete customer reviews**. The application saves the original cycle request before opening the native merchant connection, then reads each complete original statement preview and checks it against the plan's exact pass and opening/closing identities.
8. The application opens **Saved cycles**. Review the complete customer statements and use the existing issue/resume action. The original cycle reconciles each request before retaining a statement and continues any partial file delivery. Open **Customer handover** to retrieve all periods for a customer together.

Several periods for one pass can share a cycle. **Add next period** uses the preceding selected closing as the new opening. Choose a closing explicitly when several original captures have the same final timestamp.

## How continuation is chosen

A pass is the native compiler's immutable identity: original order and entitlement event, route and method, network and atomic purchase amount, asset and recipient digests, entitlement time, purchased plan ID and revision, plan hash, manifest hash and purchased units. The new native capture catalogue shares that exact field list with the original service-period compiler.

For a pass with current retained periods, the proposal starts at the unique original closing capture of its latest current period. Superseded and withdrawn periods stay in history and do not advance the proposal. For a newly closed pass with no earlier customer-period history, the first unique complete native capture can be the opening. The proposed closing is the latest unique later capture. Tied captures and previous-customer assignments leave the relevant boundary for explicit selection.

The capture timestamp defines the service boundary. A purchase timestamp does not imply a zero balance. A cumulative statement records its original captured balance and does not establish a period opening or close.

History notes identify:

- Uncovered intervals between current periods.
- Overlapping current periods.
- Adjacent periods using different original capture identities at a shared timestamp.
- A selected interval already retained or overlapping a current statement.
- A gap before the selected interval.
- Original period references that do not match the capture catalogue.
- Period statements for a previous customer assignment.
- A correction that changes the original capture pair.

Notes accompany the portable plan. Explicit chosen intervals remain available for corrections and historical work. The original native compiler determines whether the complete snapshots form a valid period, including immutable pass consistency, chronological ordering, original call transitions and service-unit conservation. The original statement writer decides customer, purchase, correction, revision and request eligibility.

The planner does not add unrelated purchased-plan units together. Purchase totals and actual period activity appear in the complete native customer reviews.

## Recovery and saved plans

The planner uses the existing cycle request, child request identities, saved reviews, manifest, per-row state and delivered files.

The browser saves selections, cycle label and one preparation request ID under the existing merchant-specific draft scope. The scope includes merchant URL, workspace and private work directory. Changing selections creates a new request identity. Retrying the same uncertain preparation keeps the original identity and first looks for the original saved cycle.

After interruption, open that entry in **Saved cycles** and continue preparation from its saved original selections. If issuing or file delivery is interrupted, use the existing issue/resume action. Refreshing planner history serves the next close; it does not rewrite a previously saved cycle.

**Download plan JSON** preserves selected metadata, original capture identities, history notes and selections. **Open saved plan** validates the file and original merchant connection. Preparing an imported plan creates a new original cycle request; resume an earlier preparation through its existing saved cycle.

The plan hash identifies its complete content and references. It is not a credential. The native connection rereads original records before review, and the writer reconciles original revision and request rules before retention. The original cycle retains full native reviews. The portable plan carries the planning notes.

## Command-line operation

The installed product exposes typed exports at `./merchant/customer-closing/service-planner`, `./merchant/customer-closing/client`, `./merchant/customer-closing/cycles` and `./merchant/customer-closing/operations`.

Use an existing private output directory. New inventory, plan and report files use mode 0600 and exclusive creation. The original cycle directory resumes its saved operation.

Read the complete current catalogue:

~~~sh
node stellar-forge/mcp-merchant-operator/accounting-statement-cli.mjs service-planner \
  --url http://127.0.0.1:8787/mcp --workspace merchant-accounting \
  --out /absolute/private/service-inventory.json
~~~

The inventory contains assigned immutable passes, exact captures, all statement statuses, coverage notes and continuation suggestions. It also contains unassigned native captures and classifications for cumulative-workflow sources.

Create a private choices JSON array using exact row and capture IDs from that inventory:

~~~json
[
  {
    "rowId": "ORIGINAL_BINDING_ID:ORIGINAL_PASS_IDENTITY_SHA256",
    "runId": "COMPLETED_ACCOUNTING_RUN_UUID",
    "usageOpeningId": "OPENING_CAPTURE_UUID",
    "usageId": "CLOSING_CAPTURE_UUID",
    "replacesId": null
  }
]
~~~

Optional `from` and `until` are a complete purchase-record interval. They do not change the service capture times. For a correction, `replacesId` selects a current period statement for the same customer and pass.

Read current records and compile explicit choices:

~~~sh
node stellar-forge/mcp-merchant-operator/accounting-statement-cli.mjs service-plan \
  --url http://127.0.0.1:8787/mcp --workspace merchant-accounting \
  --request /absolute/private/service-choices.json \
  --out /absolute/private/service-plan.json
~~~

Export a readable register:

~~~sh
node stellar-forge/mcp-merchant-operator/accounting-statement-cli.mjs service-plan-export \
  --plan /absolute/private/service-plan.json --format html \
  --out /absolute/private/service-plan.html
~~~

Use `--format csv` for the CSV register. Prepare the original saved cycle:

~~~sh
node stellar-forge/mcp-merchant-operator/accounting-statement-cli.mjs service-cycle-prepare \
  --plan /absolute/private/service-plan.json \
  --dir /absolute/private/october-service-close \
  --url http://127.0.0.1:8787/mcp --workspace merchant-accounting \
  --actor operator --label "October service close"
~~~

Continue through the original cycle and customer export commands:

~~~sh
node stellar-forge/mcp-merchant-operator/accounting-statement-cli.mjs cycle-observe \
  --dir /absolute/private/october-service-close

node stellar-forge/mcp-merchant-operator/accounting-statement-cli.mjs cycle-execute \
  --dir /absolute/private/october-service-close

node stellar-forge/mcp-merchant-operator/accounting-statement-cli.mjs cycle-customers \
  --dir /absolute/private/october-service-close
~~~

See [Closing cycles](ACCOUNTING_STATEMENT_CYCLES.md) for customer dossier export and full recovery options.

## Library and MCP contracts

`readAccountingStatementServicePlanner({client, signal})` reads complete paged native inventories. It returns `workspace`, `endpoint`, `revision`, `inventorySha256`, compact original source arrays, customer/pass `rows`, `unassigned` captures and counts.

`compileAccountingStatementServicePlan({inventory, choices})` checks the complete inventory source hash and derives its groups again from those source arrays. It consumes explicit choices. Each selected row preserves customer, binding, immutable pass, original captures, completed run, normalized original selection, correction relationship and notes.

`validateAccountingStatementServicePlan(plan)` validates a portable complete plan. `renderAccountingStatementServicePlanCsv(plan)` and `renderAccountingStatementServicePlanHtml(plan)` create complete selection registers.

`prepareAccountingStatementServiceCycle({plan, ...originalCycleOptions})` delegates to the existing cycle engine with a lazy client. Every actual native period preview must match the selected source hashes and pass identity. The original request is saved before connection. A provided client retains its caller ownership; the helper closes only its own connection.

The typed client provides `usageCaptures({offset, limit}, options)` and `allUsageCaptures(options)` over the read-only `merchant_accounting_customer_usage_captures` tool. Each record preserves original import metadata and either the immutable native identity and captured balance or its source classification. Complete original call data remains in the snapshots and full preview/file consumers.

Customer profile, assignment, import, retention, correction and withdrawal operations retain their original writers. The original service-period compiler owns actual comparison and arithmetic. Invoice, collection, pricing, receivables and grant packaging retain their existing interfaces.

## Recurring customer service calendars

The same workbench now includes **Service calendars**: saved weekly/monthly customer periods, full settings history, complete date-window exports and explicit actual-capture selection. Its reviewed plan prepares this same original closing cycle and retains each calendar-to-cycle link. See [Recurring customer service close](ACCOUNTING_STATEMENT_SERVICE_CALENDARS.md) for operation, recovery, full export/receiving and the installed command.
