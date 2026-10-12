# Customer adoption planning

Use **Delivery operations → Customer adoption plan** to turn a customer's useful operations, operating calendar, payment model and delivery effort into an operating plan. The same dependency-free engine runs in the browser and through the installed **starforge grant-cohort-plan** command.

The complete plan retains the original case identity, scenario content SHA-256 and deployment rule. Its report compares scheduled capacity with the original tranche targets, shows independent and returning operator coverage, and calculates service contribution and commissioning sensitivity. Every result is reproducible from the retained JSON.

## Start with the customer's useful work

Choose an operation the customer needs: a daily data refresh, recurring reconciliation, a paid API result, a complete deliverable or ongoing research. Give it an agreed scope and complete expected output. Enter its normal cadence and quantity.

| Quantity | Meaning |
| --- | --- |
| Useful task | One complete customer job, such as a daily report |
| Underlying request | One operation or part needed to complete the job |
| New paid purchase | One priced request, or one newly acquired prepaid pass |

For per-request pricing, every counted request represents its own intended purchased operation. Retries, reopened results, sessions and status checks stay with their original operation. A prepaid acquisition contributes one planned purchase; its allowance can fund several requests and tasks.

Start from original deployment and workorder identities. Sessions, wallets or deployments under one accountable operator share one operator ID. Use separate schedules when the customer has separate work, and explain the distinction in the operation scope and source period.

## Original windows and targets

The engine reads the complete rule supplied by the original case. The proposal currently pinned in **sf10_current_candidate.json** defines:

| Tranche | Purchase window | Scheduled outcomes |
| --- | --- | --- |
| 2 | Seven consecutive UTC calendar days | Two external buyers, ten complete testnet purchases, two independent facilitators serving the same operation |
| 3 | Fourteen consecutive UTC calendar days | Two external mainnet merchants, two external buyers, thirty complete mainnet purchases, two returning external buyers |

The proposal also contains recovery, restore/cutover and independent support requirements. Those rows remain visible with **OUTSIDE_SCHEDULE_SCOPE**. Complete that work in the original delivery case and evaluate its actual outcome through [Cohort acceptance](OPERATIONS-COHORT.md).

A fourteen-day window normally contains ten Monday–Friday operating dates. Two customers making one individually priced useful operation per working date provide twenty planned purchases. Three individually priced useful operations across the cohort per working date provide thirty before exclusions. A holiday removes that date's scheduled operations. Compare the target with the customer's full calendar, service model and delivery time.

Original tranche deadlines and award-relative timing remain in the retained rule. The planner derives the purchase window from its selected start and the original consecutive-day length. Award, recovery and acceptance clocks continue in the existing Operations lifecycle.

## Case workflow

1. Open the existing **Delivery operations** case and **Customer adoption plan**.
2. Select tranche 2 or 3 and load its current native cohort seed.
3. Choose the intended first UTC date and retain the explicit observation time.
4. Review the original buyer and merchant deployments and accountable operators.
5. Define useful operations, facilitator services, schedules, prices, allowances and costs.
6. Review daily quantities, original target gaps, returning buyer dates and same-operation facilitator coverage.
7. Save a complete planning edition in the original case.
8. Use the edition JSON for continued planning and the complete case export for receiving the original case.

An edition contains the caller's editable plan and evaluated report. The **report.input** object is the normalized evaluation input; the surrounding edition preserves the original caller plan. This keeps the editing choices and evaluation revision available together.

The integration stores the complete edition JSON as an original case source using **source.add**, kind **other**, MIME type **application/json**. Its edition identity, actor and creation time belong to that source. Complete case export/import carries those exact source bytes and relationships.

If a save response is interrupted, continue the exact retained command and request identity. An intentional new edition gets a new request identity. Reopen a saved edition from its original case source rather than reconstructing it from a displayed subtotal.

### Current source and older plans

When a current native seed is supplied, **sourceComparison** reports:

- Saved and current programId, version and planContentSha256, with a match for each field.
- Optional planId and planRevision comparisons when both sources supply them.
- A complete retained-rule/current-rule comparison.
- The current source and rule actually supplied to this comparison.

Its status is **MATCH**, **CHANGED** or **NOT_COMPARED**. Differences produce **COHORT_PLAN_SOURCE_CHANGED** and/or **COHORT_PLAN_RULE_CHANGED** findings. An older plan remains readable and evaluates with its own complete original rule. An intentional source revision creates a new edition while preserving the earlier one.

Adding a source or another case record can advance the case version while leaving the scenario hash and rule unchanged. The report displays those fields separately.

## Calendar behavior

Dates use the UTC calendar. Weekdays use ISO numbers: Monday 1 through Sunday 7.

**windowStart** is inclusive. The original rule supplies the consecutive-day length, and the engine derives the inclusive end. Weekend and holiday exclusions reduce scheduled work while preserving the original window.

The global calendar has open weekdays and named excluded dates. Schedules can add their own named exclusions. Each cadence intersects the global calendar:

| Cadence kind | Required fields | Behavior |
| --- | --- | --- |
| WEEKDAYS | weekdays | Selected ISO weekdays within the original window |
| EVERY_N_DAYS | intervalDays, anchorDate | On or after the anchor whenever elapsed calendar days are divisible by the interval |
| EXPLICIT_DATES | dates | Listed dates falling inside the original window |

An explicitly selected Sunday requires Sunday to be open globally. Open all seven weekdays for continuous operations; retain the actual office weekdays for office work.

Every calendar day appears in **report.days**, including zero-work dates. **report.excluded** identifies matching schedule dates removed by global or schedule exclusions. Explicit dates outside the selected window generate no occurrence within that window; the full cadence remains in the retained plan.

Each occurrence starts at **timeUtc**, default 12:00. **deliveryDelayMinutes** is elapsed time until its complete useful output. A schedule remains in workload and economic totals when completion lands after the final date, while in-window completion quantities exclude it.

The explicit **asOfAt** retains the original timezone and up to thirty fractional-second digits, including the native seed's microsecond timestamp. UTC date classification uses the corresponding millisecond instant while preserving the original text. It labels dates **PAST**, **AS_OF_DAY** or **FUTURE**. Advancing the time preserves the plan and its assumptions. Actual observed purchases continue through the existing native Cohort acceptance records.

## Accountable operators and coverage

Buyer and merchant entries retain a plan row ID, accountable operator ID, participation class, environment and optional original deployment ID. Facilitators retain their operator and service URL.

Classes are **INDEPENDENT_OPERATOR**, **CUSTOMER**, **TEAM_OPERATED** and **UNKNOWN**. Deployment environments retain the original **LOCAL**, **TESTNET**, **MAINNET** and **OTHER** classifications; **UNKNOWN** is available for an unassigned draft. Independent planned purchase capacity requires an independent/customer buyer and merchant, nonempty operator IDs, the tranche's TESTNET or MAINNET environment, defined useful scope/output and completion inside the window.

One operator ID counts once across multiple rows. Leading and trailing operator-ID whitespace is normalized. Remaining identifiers are explicit and case sensitive; use the original accountable identity consistently.

The report groups work by buyer operator, merchant operator, useful operation and facilitator operator. A returning buyer has at least two independent planned purchases across at least two UTC completion dates. Completion dates determine returning coverage.

Same-operation facilitator coverage is the largest count of independent facilitator operators serving one operation ID through qualifying planned purchases. Different merchant operations remain different operation groups. Several URLs under one facilitator operator count once.

**BUYER_MERCHANT_SHARED_OPERATOR** identifies shared buyer/merchant identities for relationship review. **OVERLAPPING_TASK_SLOT** identifies schedules placing the same buyer and operation at the same time. Entered quantities remain visible so the operator can explain or correct the separate intended task.

Blank operator IDs and empty operation scope/output are valid draft values. Findings identify missing definitions, and the rows retain their scheduled work without independent purchase capacity.

## Prices and allowances

### Per-request work

~~~json
{
  "kind": "PER_REQUEST",
  "atomicUnitPrice": "1000000",
  "network": "selected-network",
  "asset": "selected-asset"
}
~~~

Replace network, asset and price with the selected customer's intended terms. Requests equal tasksPerDate multiplied by requestsPerTask. Each request generates one payment request; a positive atomic price generates one paid purchase opportunity.

Zero price retains request counts and yields zero paid purchases. **UNPAID** requires atomicUnitPrice "0" and generates tasks with zero payment requests.

Atomic amounts remain separate for each network/asset pair and use integer text throughout. A currency-denominated valuation stays an explicit separate assumption.

### Prepaid work

~~~json
{
  "kind": "PREPAID",
  "atomicUnitPrice": "5000000",
  "network": "selected-network",
  "asset": "selected-asset",
  "passCapacity": 100,
  "openingUnits": 20,
  "allowanceUnitsPerRequest": 2,
  "passGroupId": "customer-data-pass"
}
~~~

The price is the acquisition price of a complete pass. **passCapacity** is the allowance on one new pass. **openingUnits** is the available balance on the currently selected pass at window start. Each underlying request consumes **allowanceUnitsPerRequest**.

The planner consumes the current pass before acquiring the additional whole passes needed for the requests. A new pass contributes one planned purchase on its acquisition occurrence. Subsequent allowance use contributes requests and useful work.

Schedules sharing **passGroupId** use one balance, ordered by scheduled UTC time and then schedule ID. They must retain the same buyer row, merchant row, network, asset, capacity, opening balance, atomic acquisition price, unitRevenue, feePerPayment and currency. Per-request supplier costs and per-task effort can differ. Without passGroupId, the schedule owns its own balance across dates.

For example, opening allowance of four units, requests needing two units, and new passes containing eight units fund eighteen requests with the opening balance and four new passes. The request count is eighteen; new paid purchases are four.

A request consumes an indivisible number of units. When the current balance cannot cover a request, a new pass is selected and the old remainder is retained under **retainedUnusedPreviousUnits**. Later requests continue with the selected current pass. Record any intended switching among earlier passes in the customer's operating assumptions.

**report.passGroups** shows opening, consumed, current remaining, retained previous and new acquisition quantities. Report IDs use **shared:** for explicit groups and **schedule:** for schedule-local balances.

## Service economics

Amounts and hours are ordinary decimal strings with up to 24 fractional digits. Unknown values can be null; "0" is a known zero.

Each schedule's economics uses one explicit uppercase currency code:

| Field | Multiplier | Interpretation |
| --- | --- | --- |
| unitRevenue | New payment requests/pass acquisitions | Value per newly charged operation or complete pass |
| unitCost | Underlying requests | Supplier cost per served request |
| feePerPayment | New payment requests/pass acquisitions | Variable payment cost |
| activeHoursPerTask | Useful tasks | Active effort per complete customer job |
| hourlyCost | Active hours | Selected labor or opportunity-cost rate |

Revenue equals payment requests times unit revenue. Supplier cost equals requests times unit cost. Fees equal payment requests times fee. Labor equals tasks times active hours per task times hourly cost. Contribution equals revenue less supplier cost, fees and labor.

Economics cover all selected operating work, including late-completing tasks. Completion capacity stays separate. A late task's required effort therefore remains visible.

An opening prepaid balance can support work without new acquisition revenue during the selected window. Retain earlier cash and any deferred-revenue accounting in the customer's original commercial records.

Currency totals cover schedules assigned economics in that currency. Unspecified schedule economics generate **ECONOMICS_UNSPECIFIED**. Add the complete cost assumptions before using that currency subtotal as the whole cohort's economics.

Unknown components stay null in complete totals. Known subtotals and counts of unknown records remain available. Zero activity contributes known zero for its relevant multiplier. Currencies are calculated separately.

Calculations use integer-backed decimal arithmetic. Addition and multiplication remain exact, including generated values beyond 24 fractional places. Margin percentages round half up to six places; break-even hours round half up to twelve. Whole-purchase sensitivity uses explicit integer floor/ceiling.

### Commissioning workshares

~~~json
{
  "id": "commissioning-option",
  "label": "Customer commissioning scope",
  "currency": "USD",
  "fee": "4200",
  "hours": "36",
  "hourlyCost": "95",
  "otherCosts": "0",
  "sourceIds": [],
  "sourceNote": "Retain the original scoped proposal and cost basis."
}
~~~

These entered assumptions give $3,420 base labor and $780 contribution. At 20% additional effort, labor is $4,104 and contribution is $96. At 25% additional effort, labor is $4,275 and contribution is -$75. Break-even effort is approximately 44.210526315789 hours.

Enter the complete commissioning scope: preparation, source/terms integration, installation, mainnet operation, recovery and receiving handover as applicable. The rate may be the selected $95/hour planning allocation or another explicit cost assumption; retain its economic interpretation in the workshare source.

Each option remains separate from recurring service economics. Its complete original fee/cost/hour inputs, effort cases and break-even hours remain in the report.

### Sensitivity

**effortIncreasesPct** defaults to "0", "20" and "25". It scales active hours and labor while retaining the entered revenue, supplier cost and payment fee assumptions. The report provides adjusted labor, total cost and contribution by currency and workshare.

**completionSharesPct** defaults to "100", "90" and "75". It multiplies independent purchase opportunities by the selected completion share and floors whole completed purchases. Required opportunities use the ceiling of target divided by share.

Thirty complete purchases at 90% require thirty-four opportunities; at 75% they require forty. These are explicit capacity assumptions. Operator, facilitator, recovery and support coverage retain their own target rows.

## Public ESM contract

Installed export:

~~~js
import {
  COHORT_PLAN_SCHEMA,
  COHORT_PLAN_REPORT_SCHEMA,
  CohortPlanningError,
  selectCohortPlanningRule,
  normalizeCohortPlan,
  seedCohortPlan,
  evaluateCohortPlan,
  exportCohortPlanCsv
} from "@tokenjunkielabs/starforge-merchant/grant/cohort-planning";

const plan = seedCohortPlan(nativeSeed, {
  draftId: "cohortplan-original-draft",
  planId: "original-plan-id",
  planRevision: 1,
  asOfAt: "2026-10-12T12:00:00Z",
  windowStart: "2026-10-12"
});
const report = evaluateCohortPlan(plan, { nativeSeed });
const csv = exportCohortPlanCsv(report);
~~~

Use the actual native seed, original plan identity/revision and chosen interval. Source checkouts can import the same exports from **./cohort_planning.mjs**. The adjacent **cohort_planning.d.mts** describes the complete public contract.

Optional **name** sets the title. An omitted draftId derives deterministically from source hash, tranche and explicit seed time. Pass a new explicit ID for a deliberately separate draft with the same source/time.

**selectCohortPlanningRule(originalDeploymentAcceptancePlan, tranche)** selects the native-shaped rule from the original scenario. For an existing case, prefer its current **cohort-seed** response.

### Plan schema

The schema is **stellar-forge.sf47-cohort-plan.v1**.

| Field | Content |
| --- | --- |
| draftId, name | Stable draft identity and title |
| source | programId, positive integer version, 64-character lowercase planContentSha256; optional planId and planRevision |
| rule | Complete original native deployment rule with selected target |
| asOfAt, windowStart | Explicit ISO timestamp and first UTC date |
| calendar | timezone UTC, weekday array, and date/label exclusions |
| buyers, merchants | Original or planned participant rows |
| facilitators | Service/operator rows |
| operations | Useful operation rows |
| schedules | Cadence, workload, payment and economics rows |
| workshares | Scoped fee/cost/hour options |
| sensitivity | Decimal-text effortIncreasesPct and completionSharesPct arrays |
| note | Full planning explanation |

Buyer/merchant fields: **id, label, operatorId, participantClass, environment, deploymentId, sourceIds, sourceNote**. A planned installation can use deploymentId null. Facilitators replace environment and deploymentId with **serviceUrl**.

Operation fields: **id, label, merchantId, scope, expectedOutput, sourcePeriod, sourceIds, sourceNote**.

Schedule fields: **id, label, operationId, buyerId, facilitatorId, cadence, tasksPerDate, requestsPerTask, timeUtc, deliveryDelayMinutes, excludedDates, payment, economics, note**. facilitatorId and economics can be null. References select existing plan row IDs. Tasks, requests, delays and allowance quantities use safe integers.

Stable row/source IDs use up to 200 ASCII letters, digits, period, underscore, colon or hyphen, beginning with a letter or digit. Accountable operator IDs are separate explicit text. IDs and references are case sensitive.

**normalizeCohortPlan** returns canonical decimals, sorted/deduplicated weekdays, defaults and validated references. It retains the complete original rule. Unsupported fields in typed plan objects return **UNKNOWN_PLAN_FIELD**, preserving the original import for an explicit migration. Cadence and payment objects accept only fields belonging to their selected kind.

### Report schema

The schema is **stellar-forge.sf47-cohort-plan-report.v1**, with **kind: PLAN**.

| Section | Content |
| --- | --- |
| source, rule, input | Source binding, retained rule and normalized evaluation input |
| sourceComparison | Saved/current fields, rule match and supplied current source/rule |
| window | Inclusive start/end, original length, tranche/environment, as-of time |
| summary | Work/payment quantities and operator coverage |
| days, occurrences, excluded | Complete day grid, schedule dates and removed matching dates |
| buyers, merchants, operations, facilitators | Accountable-operator and operation groupings |
| targets | All original targets with expected, planned, gap and status |
| currencies, assets | Service economics and separate native quantities |
| passGroups | Allowance conservation and new pass quantities |
| workshares | Complete scoped options and effort cases |
| sensitivity | Completion/effort assumptions and calculated effects |
| findings | Code, severity, scope, ID and actionable explanation |

Summary keys are **scheduledTasks, scheduledRequests, plannedPaymentRequests, plannedPaidPurchases, plannedCompleteTasks, plannedCompletePurchases, independentPurchaseOpportunities, allowanceUnits, independentBuyerOperators, independentMerchantOperators, returningBuyerOperators, sameOperationFacilitatorOperators, excludedScheduleDates, completionOutsideWindow, elapsedScheduledDates**.

completionOutsideWindow counts paid purchases completing after the window. elapsedScheduledDates counts unique task dates before the explicit as-of date. Occurrences retain schedule/completion timestamps, qualification gaps, atomic amounts and economic components.

Target statuses are **PLANNED_CAPACITY**, **SHORTFALL** and **OUTSIDE_SCHEDULE_SCOPE**. The last has planned null and gap null, retaining the requirement for the corresponding native delivery workflow.

Errors are **CohortPlanningError** with code, message and field path. Structural errors identify the input to correct. Incomplete task definitions, unassigned operators, source changes and target gaps remain complete, readable reports with findings.

## Local CLI

The CLI uses Node's built-in file, path and crypto modules plus the shared engine. It reads complete original JSON and creates local planning artifacts. The maintained merchant contribution registers **starforge grant-cohort-plan**.

First obtain the original case's native seed. Close the browser's workspace owner before the headless command opens that same workspace.

~~~sh
starforge grant-workspace operations --workspace /absolute/private/scf-planning cohort-seed --case operation-EXACT_ID --expected-version CURRENT_VERSION --tranche 3 --output /absolute/private/cohort-seed.json
~~~

Replace the case, version and paths with the retained original values.

~~~sh
starforge grant-cohort-plan seed --native-seed /absolute/private/cohort-seed.json --as-of 2026-10-12T12:00:00Z --window-start 2026-10-12 --draft-id cohortplan-original-draft --plan-id ORIGINAL_PLAN_ID --plan-revision 1 --output /absolute/private/customer-plan.json
starforge grant-cohort-plan evaluate --input /absolute/private/customer-plan.json --native-seed /absolute/private/cohort-seed.json --output /absolute/private/customer-plan-report.json
starforge grant-cohort-plan csv --input /absolute/private/customer-plan-report.json --output /absolute/private/customer-plan-report.csv
~~~

Edit the complete customer plan between seed and evaluate. Replace example dates and IDs with the selected original case and interval.

Source checkouts use the same arguments through:

~~~sh
node cohort_planning_cli.mjs seed --native-seed /absolute/private/cohort-seed.json --output /absolute/private/customer-plan.json
node cohort_planning_cli.mjs evaluate --input /absolute/private/customer-plan.json --output /absolute/private/customer-plan-report.json
node cohort_planning_cli.mjs csv --input /absolute/private/customer-plan-report.json --output /absolute/private/customer-plan-report.csv
~~~

**seed** accepts --native-seed, --name, --as-of, --window-start, --draft-id, --plan-id, --plan-revision and --output. Its time defaults to the native seed's time; start defaults to the seed's selected start or that UTC date.

**evaluate** accepts a plan, complete report or saved **stellar-forge.sf47-cohort-plan-edition.v1** edition. It evaluates a report's input or an edition's caller plan. Optional --native-seed supplies the current comparison.

**csv** accepts a complete report or edition containing its report. It exports that retained report; run evaluate first to deliberately calculate a new revision.

Omit --output or use --output - for the complete result on stdout. Use --input - for JSON from stdin; the native seed must be a separate file. Complete input is limited to 64 MiB with an explicit size error above that bound.

Output parents must exist. The CLI writes a temporary file in the destination directory, flushes it, and atomically links it to a new output name. Existing destinations remain intact; use a new edition filename. A successful file write prints JSON with saved absolute path and byte count. Errors use JSON on stderr with error.code, message and path, and a nonzero process exit.

The engine accepts up to 5,000 entries in ordinary lists, 1,000 schedules and 100,000 expanded schedule-date rows. Counts must remain safe integers. An exceeded limit returns an explicit error with the full caller input retained.

## Exports and receiving

**exportCohortPlanCsv(report)** returns one UTF-8 CSV string with CRLF lines:

~~~text
rowType,id,date,metric,value,currency,network,asset,detail
~~~

Rows cover plan/source comparison, summary, targets, days, occurrences, schedule economics, accountable participant groups, exclusions, assets, currencies, workshares, prepaid balances, sensitivity and findings. Detail fields carry explanatory text or structured JSON.

Text cells with spreadsheet formula prefixes are escaped. Canonical negative numeric values remain numeric text. Import large atomic quantities as text in spreadsheet software to preserve every digit. Complete JSON retains exact types and amount strings.

The complete edition JSON is the editable receiving artifact. HTML and CSV provide readable views; complete case export preserves original source bytes and case relationships. The original source.add channel supports up to 8 MiB per source and 24 MiB across all case sources. Choose a realistic cohort and retain large material in the established case receiving workflow when needed.

## Source relationships

This planner builds on [sf10_current_candidate.json](../sf10_current_candidate.json), the native [Cohort acceptance](OPERATIONS-COHORT.md) seed/rule contract and the original Grant Operations source/export workflow.

The pinned proposal spans the existing six packages: merchant integration, authority/handover, provider/ledger deployment, deployed threat response, mainnet rollout, and recovery/handover. Those packages total 400 hours and $38,000 in the application model. Customer workload and commissioning economics can now be compared with that scope in the same original case.

Carry actual purchases, transfers, complete output and deployed support outcomes into their maintained records as operations proceed. Revisit the same plan with the customer's observed cadence, effort and terms, then retain the next complete edition in the original case.

## Shared delivery capacity and service prices

Use **Capacity & pricing** after defining the customer's recurring schedules.
Name each shared delivery pool once, retain its source and availability basis,
and assign schedules to that pool. A pool is a set of active staff hours available
for the work; the same person's hours must not be entered again in another pool.

Enter the total available hours for Monday through Sunday. Date overrides
replace the selected weekday amount. A closure uses `"0"`; a blank value is
unknown. Overrides can add capacity on a normally closed day or record reduced
availability without changing the customer's original task calendar.

~~~json
{
  "id": "customer-delivery-team",
  "label": "Selected customer delivery team",
  "hoursByWeekday": {
    "1": "2", "2": "2", "3": "2", "4": "2", "5": "2",
    "6": "0", "7": "0"
  },
  "dateOverrides": [
    {
      "date": "2026-10-26",
      "availableHours": "1",
      "label": "Explicit reduced-availability planning assumption"
    }
  ],
  "sourceIds": [],
  "sourceNote": "Replace this illustration with the selected team's sourced availability."
}
~~~

Place the row in **capacityPools**. Set each selected schedule's
**capacityPoolId** to its ID and enter **economics.activeHoursPerTask**.
Effort is measured per complete useful task, independently of the number of
paid routes, pages or allowance calls needed to produce it.

### Daily allocation and the actual window

The engine combines every assigned schedule's active hours on the same UTC
date. Two simultaneous schedules drawing on one pool therefore share its
available hours. A date with three required hours and two available hours has
one additional hour needed.

All dates in the original seven- or fourteen-day window remain visible.
Weekly rows include only dates inside that window and state their exact
start/end and number of included days. They never extrapolate a partial week.
The report provides both net headroom and the sum of individual daily deficits.
Spare hours on Tuesday cannot cancel a Monday shortage.

For an illustrative fourteen-day Monday–Sunday window with ten business days,
two customers each doing two daily tasks provide forty tasks. At 0.25 and
0.75 active hours per task, their combined requirement is two hours per business
day, or twenty hours. The pool above supplies nineteen hours because one Monday
has only one hour available; the report identifies that date and its one-hour
shortfall. With a 25% effort increase, demand rises to twenty-five hours, and
the sum of daily shortfalls is six hours.

The global task calendar determines which customer occurrences exist. Pool
weekday hours and overrides define staff availability separately. Active work
is assigned to the scheduled task date. The original explicit completion delay
continues to describe when the useful output completes. Operators can change
a cadence, quantity, effort estimate, pool assignment or date availability and
recalculate the complete plan.

### Unknown and unassigned effort

A missing task-effort estimate remains unknown even when the price is entered.
A pool with missing availability or assigned unknown effort reports
**INCOMPLETE**. Its known effort and known minimum shortage remain visible.
Positive known demand above available hours reports **OVERALLOCATED** even
when additional effort is still unknown.

Positive or unknown effort without a pool appears under **Unassigned delivery
effort**. Explicit zero-effort tasks can remain unassigned. Once capacity is
configured, unassigned positive/unknown work keeps the overall assessment
incomplete. A plan with no pools reports **NOT_CONFIGURED**.

The complete report retains **capacity.pools**, every daily and weekly row,
unassigned work, and each selected effort-increase sensitivity. Original
customer tasks, payment quantities, source rule and recorded acceptance remain
in their existing records. Staffing deficits are displayed with the original
target report so an operator can plan the work needed to support those targets.

### Price the full recurring service

The **Service price floors** report totals the selected-window supplier cost,
payment fees and active labor cost for each schedule. Schedules sharing a
prepaid pass group are valued together, so the costs of later allowance usage
remain with the group's newly acquired passes.

**breakEvenUnitRevenue** is the group's total cost divided by its count of
newly charged requests or acquired passes. **targetUnitRevenue** applies the
optional **sensitivity.minimumMarginPct**:

~~~text
target unit revenue = total cost / (new charge units × (1 − target margin / 100))
~~~

The selected margin must be below 100%. All arithmetic uses the original
integer-backed decimals; price floors round upward to twelve fractional places.
The estimate currency remains separate from the native atomic payment terms.
Changing a displayed price floor changes no merchant price or payment record.

For example, a group's four new charges, USD 12 supplier cost, USD 2 fees and
USD 6 active labor have USD 20 total cost. Break-even is USD 5 per new charge.
At a selected 20% margin, the required value is USD 6.25. An entered USD 4 unit
revenue produces USD 16 revenue, USD 4 uncovered cost, and a USD 2.25 increase
per charge to reach the selected margin.

A prepaid group supported entirely by its opening allowance can have service
cost and zero new charge units. The report returns **NO_NEW_CHARGES**, retains
the cost, and leaves a unit price undetermined. Its earlier acquisition and
deferred revenue belong in the original commercial accounting period.
Missing cost inputs retain **INCOMPLETE**, while complete costs with an
unknown revenue estimate still provide the cost-based price floor.

### Edit, export and continue

The same fields travel through the original plan JSON, complete saved edition,
case source attachment and complete case ZIP. Earlier plans open with an empty
capacity selection and no chosen margin; earlier report editions remain
readable.

Editable rows CSV adds **capacityPools** rows with complete JSON
**hoursByWeekday** and **dateOverrides** cells, and schedules add
**capacityPoolId**. Existing row IDs and source bindings remain the import
keys. Full plan JSON carries the selected minimum margin.

The installed **starforge grant-cohort-plan evaluate** command calculates the
same capacity and service prices from the same plan. Its report CSV includes
**CAPACITY_DAY**, **CAPACITY_WEEK**, **CAPACITY_UNASSIGNED**,
**CAPACITY_SENSITIVITY** and **SERVICE_PRICING** rows. The readable HTML export
includes the complete capacity, effort and price reports with the retained
original plan.


## Compare complete alternatives

Use **Compare plans** to answer a practical delivery question: how does a
different customer mix, normal operating schedule, delivery delay, prepaid
allowance, quoted workshare or effort assumption change the same programme?

The comparison works alongside the existing plan editor. Capturing a baseline or
candidate leaves the working plan and its unfinished row edits in place. Each side
retains the complete selected plan, planning report or saved edition. The engine
recalculates both alternatives with their own full original rules; it does not
rewrite either rule or select a preferred commercial option.

### Saved edition → comparison → selected plan

1. In **Saved editions**, choose **Use as baseline** beside an original plan, or
   open **Compare plans** and select a saved edition, the current working draft,
   or a retained earlier draft.
2. Capture the candidate in the other column. **Import source JSON** accepts a
   complete plan, report or saved edition when the source is outside the current
   case. Sources from the native case still use the existing full byte-count and
   SHA-256 readback before selection.
3. Review **Summary & targets**, **Calendar & completions**, **Revenue & costs**,
   **Input changes**, and **Operators & prepaid**. The two named source cards and
   comparison-basis table remain explicit. Add a comparison title and review
   notes for the proposed delivery choice.
4. Use **Open baseline for editing** or **Open candidate for editing** to continue
   the selected source through the original editor. The current working plan is
   retained in the existing prior-draft history. A source still present in this
   case reopens through its original source record; an imported document keeps
   its complete source identity and uses the same existing plan-import flow.
5. **Save comparison in this case** attaches one immutable full JSON comparison
   using the existing `source.add` command, current case version, recording
   operator and stable original request ID. The native comparison save leaves
   the working plan's saved-edition and parent-source bindings in place.
6. Download the complete comparison JSON, comparative CSV and readable HTML.
   **Import complete comparison** reopens both full sources, restores the title
   and notes, and recalculates every comparison value. The complete native case
   ZIP carries saved comparisons with the original sources and case history.

A current-draft capture is a snapshot. If the working draft changes afterward,
its comparison card says so; capture it again to include the new input. Replacing
a side, swapping sides, importing a comparison or restoring an earlier one retains
the previous local comparison. A source/file read that completes after a newer
selection or a disposed view stays under **Received sources awaiting adoption**.
It does not replace newer edits.

The original pending-request recovery also covers comparison saves. Access or
route failures during a retry preserve the same request because they do not settle
the outcome of an earlier native attempt. An accepted source remains recoverable
if retaining the final browser checkpoint fails. The browser uses the original
request and full source readback when continuing that save.

### Reading the differences

All deltas are **candidate minus baseline**. Higher counts, additional dates or
larger amounts are described as changes, not automatically as improvements.

- The basis includes programme, plan, native source version and plan-content
  identity, tranche, environment, complete calendar window, observation time and
  full original rule. Different cases, rules and durations remain visible;
  absolute values are not silently rescaled or treated as interchangeable.
- Target rows preserve each side's original required count, planned count,
  shortfall and status. A target outside the schedule model remains unvalued.
- Calendar rows use actual UTC dates. A date outside one selected window is
  absent in that plan, so its delta is unvalued. The complete schedule-date
  changes include original schedule and buyer identities, actual planned
  completion timestamps, payment groups, qualification gaps and economic inputs.
- Currency rows use exact decimal text. Different currencies are separate
  groups. An absent group or an unknown amount produces an unvalued delta.
  Margin changes use percentage points; effort continues to use hours.
- **Recurring schedule economics** covers the selected schedule window.
  **One-time commissioning workshares** totals the original fee, effort, other
  cost, labor cost, total cost and contribution once, using the unadjusted
  commissioning effort. These two scopes are never silently added together.
- Coverage reports how many schedule-date rows contain economic assumptions and
  how many omit them. Currency totals cover the entered rows; missing economic
  assumptions remain visible. Each currency/workshare group also retains known
  subtotals and unknown-record counts.
- Authored rows are matched by their original stable IDs. Added, removed,
  changed and moved rows show full before/after values and original positions.
  Operator, prepaid and sensitivity changes retain the existing evaluator's
  original grouping and completion semantics. Changed findings remain separate
  from the two complete original reports.

The screen pages long changed-row and calendar tables. CSV and JSON export every
row. Readable HTML includes the complete comparative tables and both original
input documents, with neutral print styles. CSV text remains formula-safe while
negative numeric deltas retain their numeric meaning.

### Installed command

The existing installed command forwards these operations to the same ESM engine:

```sh
starforge grant-cohort-plan compare \
  --baseline original-edition.json \
  --candidate revised-plan.json \
  --name "Customer schedule alternatives" \
  --note "Review the entered delivery calendar and commissioning effort." \
  --output customer-comparison.json

starforge grant-cohort-plan csv \
  --input customer-comparison.json \
  --output customer-comparison.csv
```

The direct source command is equivalent:

```sh
node cohort_planning_cli.mjs compare \
  --baseline original-edition.json \
  --candidate revised-plan.json \
  --output customer-comparison.json
```

Either comparison source can use `-` for stdin; the other must be a file.
The existing 64 MiB JSON input bound and atomic new-output publication remain.
No file is overwritten. The comparison browser importer accepts a complete JSON
file up to 64 MiB. Saving through the native case retains its existing 8 MiB
attachment limit; a larger full comparison can still be downloaded and reopened
as JSON.

### Public comparison contract

```js
import {
  compareCohortPlans,
  reopenCohortPlanComparison,
  exportCohortPlanComparisonCsv
} from "./cohort_planning.mjs";

const comparison = compareCohortPlans(baselineDocument, candidateDocument, {
  title: "Customer schedule alternatives",
  note: "Review the original named workshares and complete UTC calendars."
});
const reopened = reopenCohortPlanComparison(comparison);
const csv = exportCohortPlanComparisonCsv(reopened);
```

The output schema is
`stellar-forge.sf47-cohort-plan-comparison.v1`, kind
`PLAN_COMPARISON`. `documents.before` and `documents.after` contain both
complete caller documents, including original edition metadata and reports when
supplied. `before` and `after` are freshly calculated full planning reports.
`review` retains the title, note and optional original source references.

The remaining sections are `basis`, `summary`, `targets`, `currencies`,
`workshareTotals`, `economicsCoverage`, `assets`, `days`, `inputChanges`,
`occurrences`, `participants`, `passGroups`, `workshares`, `sensitivity`
and `findings`. Number and decimal changes contain `before`, `after` and
`delta`; absent/unvalued values use JSON null. Changed rows carry complete
before/after records, source positions and explicit changed fields. Unchanged
records remain present in the complete retained inputs/reports.

Reopening validates the supported schema, both complete input documents, review
fields and original source-reference shapes before recalculation. Derived values
in an edited incoming comparison are recalculated from its carried source
documents. Unknown top-level fields are reported so they can be preserved and
reviewed explicitly. The installed `./grant/cohort-planning` typed export
includes the full comparison document and public functions.


### Compare the complete capacity and service-price result

The comparison composes the maintained **Capacity & pricing** planner. It
retains both complete delivery-pool definitions, schedule assignments, weekday
hours and exact date overrides. Pool totals compare available hours, required
effort, known subtotals, headroom and the sum of daily staffing shortages.
Unknown inputs stay unvalued. Daily and partial-week changes retain their
original dates, boundaries, schedule identities and source assumptions.

The service-price comparison retains each schedule or shared-prepaid group,
charge units, costs, revenue, uncovered costs, break-even and chosen-margin
prices. Monetary differences are calculated only when both groups use the same
known currency. A changed currency is shown on each side without converting or
subtracting the monetary values. Charge counts and margin percentages retain
their own units.

Full JSON and comparative CSV carry daily, weekly, unassigned-effort,
capacity-sensitivity and service-price results. The readable HTML contains all
eight calendar measures, independent of the currently selected browser measure,
alongside the complete comparative capacity and price sections.
