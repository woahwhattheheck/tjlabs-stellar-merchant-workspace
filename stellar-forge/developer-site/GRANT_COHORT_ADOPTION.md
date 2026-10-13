# Customer adoption, service economics and delivery operations

This guide connects the completed customer-use, planning, allocation and recorded-delivery capabilities into one operating workflow for a selected SCF installation. The original case, saved Installation editions, funding groups, native purchase history and complete customer outputs continue through the existing Grant Operations workspace.

The companion chapter is [Customer adoption economics, delivery scheduling and recorded outcomes](GRANT_COHORT_ADOPTION_CHAPTER.md). Its independent source declaration is [grant-products/cohort-adoption.json](grant-products/cohort-adoption.json), received by the original grant composer. The original planning and allocation source remains b923b22687b0726b86000e685c60a07cfbad5b72. Commercial reconciliation uses the complete product source 80e82c047a5ba69955d96fa5e7bd9ad9a6bb45e3, preserving the earlier delivery-only editions. Recorded-cost feedback into the next complete service plan uses product source bb47c6e3f2e8b86aba2e352522d6c29b6ea9cb2d.

## Start with the agreed customer service

Use the customer's actual source and recurring decision: a new observation period, a complete reconciled ledger, a refreshed dataset population or a distinct approved query. Record the merchant, commissioning payer, accountable buyer, receiving engineer, useful output, source period and the priced unit. If one useful task needs multiple paid pages or files, the agreement carries the complete task and its aggregate payment requirement.

The saved Customer-use Calendar owns the original dated uses and their funding. The adoption plan owns the editable commercial and staffing assumptions. Cohort acceptance owns the original recorded participants, purchases, completion and classification. Cohort delivery joins the selected saved plan to that recorded review. These same source objects travel through the browser, installed command, typed client and Merchant MCP.

| Stage | Select from the existing case | Complete operating result |
| --- | --- | --- |
| Customer calendar | Exact Installation IDs, revisions, hashes and saved window | Original useful tasks, dated uses, funding groups and source references |
| Adoption plan | Complete Calendar selection and matching native cohort seed | Editable service terms, effort, shared capacity and original tranche comparison |
| Delivery allocation | Full adoption document and explicit service constraints | Complete dated successor, each occurrence's decision and before/after report |
| Original source save | Current case version, reviewed full document and retained request | One saved edition containing the plan, report, allocation and comparison |
| Recorded delivery | Saved plan source plus full frozen COHORT_EVALUATION review | Intent placement, due work, original amounts and actual output dates |
| Commercial reconciliation | Same complete comparison and explicit asset values, costs and refunds | Original atomic quantities, complete cost coverage and same-currency contribution variance |
| Receiving | Full original case and saved sources | Independently editable case with the complete earlier history |

The case's saved rule supplies its actual tranche, window and outcome requirements. A changed rule or source requires the existing source comparison and explicit rebase; the older edition stays readable.

## Receive the full Calendar and enter the service terms

Open the original case, select **Customer use**, choose the saved Installation editions and window, then choose **Plan staffing and pricing**. The complete Calendar and matching native seed are retained in `calendarSource`. Each dated use has its own schedule. Its `origin` and the original source editions remain attached when fields are edited.

The receiver keeps these operating relationships:

| Original Calendar record | Meaning in the adoption plan |
| --- | --- |
| PURCHASE or ALLOWANCE_USE | FUNDED schedule linked to every original funding group |
| DIRECT group | One original paid-operation funding identity |
| PREPAID group | One original acquisition identity supporting its selected uses |
| One result linked to multiple groups | All those groups remain linked to that complete result |
| REOPEN or FREE_USE | UNPAID work with its actual useful task and delivery effort |
| CANCELLED use | Original dated schedule with zero useful-task quantity |
| Missing numeric price | Null commercial term to be entered explicitly |
| Funding before the window | Existing funding supporting work, with zero new settlement for that group inside the window |

The native Calendar selects UTC civil dates. The imported draft uses an editable noon-UTC placement within those dates and records that choice in its notes. The original native purchase and completion timestamps remain in the retained source.

In **Funding groups**, enter the actual network, asset, atomic price, facilitator, currency revenue and payment fee. Blank atomic price stays UNPRICED; an entered zero stays a known zero. In **Schedules**, enter supplier cost, active hours per whole useful task, hourly labor cost and the named delivery pool. FUNDED schedules obtain revenue and payment fees from their original funding groups.

Use recurring PER_REQUEST or quantified PREPAID schedules when authoring a separate service whose actual per-request prices, pass capacity, opening allowance and consumption rate are known. A named Calendar funding group retains its explicit original grouping; the receiver does not turn it into a guessed numerical allowance.

The complete source and field contract are in the [Calendar operating guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b923b22687b0726b86000e685c60a07cfbad5b72/stellar/scf_2026/sf47_budget_model/workspace/CUSTOMER_USE_CALENDAR.md) and [adoption planning guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b923b22687b0726b86000e685c60a07cfbad5b72/stellar/scf_2026/sf47_budget_model/workspace/COHORT-PLANNING.md).

## Review service cost, contribution and available delivery hours

The calculation uses the complete selected window. It combines supplier cost, active labor and payment fees with the entered revenue valuation. Network/asset atomic strings stay separate from that currency estimate.

A useful result shared by multiple funding groups connects those groups into one cost component. The result's cost enters that component once; each newly charged group's revenue and fee enter once. Service price floors therefore cover the whole delivery scope, including later allowance uses supported by the selected acquisitions.

For a complete cost component with newly charged units, the original engine uses:

```text
break-even revenue per new charge = total selected-window cost / new charge units
target revenue per new charge = total cost / (new charge units × (1 − selected margin / 100))
```

For example, USD 20 of complete service cost over four new charges gives a USD 5 break-even value; a selected 20% margin requires USD 6.25 per charge. This is a cost-planning example. The actual customer enters its own complete terms and costs. For explicit funding groups, the floor is the required average value across the component's new groups; each original group's price remains independently editable.

Opening prepaid funding can incur current service cost with no new charges. The report retains that cost and reports NO_NEW_CHARGES; the earlier acquisition and revenue period remain in the original commercial records. Unknown costs, revenue valuation or mixed unspecified currencies remain visible for completion.

Under **Capacity & pricing**, enter each named pool's weekday hours and dated overrides. A pool is shared by every schedule assigned to it. Enter the hours actually available after the grant portfolio and other customer commitments have been assigned. The separate portfolio retains its grant/customer packages, cash assumptions and actual assignments; do not treat an unallocated maximum as available twice.

Review daily and weekly demand, unknown effort, unassigned work, service price floors and effort sensitivity. A complete price comparison retains every original amount and assumption. Changing a planning valuation does not publish a merchant price. Agreed recurring terms continue through the original merchant pricing and customer workorder.

## Allocate the entire workload to the agreed service dates

In **Schedule delivery**, edit each service rule from the complete current plan. Fixed dates are the default. A customer permission or explicit planning assumption supplies the basis for movement.

| Constraint | What it controls |
| --- | --- |
| Flexible and permitted days earlier/later | Movement relative to the occurrence's original cadence date |
| Release date | Earliest permitted start, also constrained by every named funding date |
| Complete-output deadline | Latest allowed complete result, including delivery delay |
| Permitted weekdays and exclusions | Actual open service days inside the source window |
| Minimum spacing | Required separation between whole occurrences |
| Priority and date preference | Order and preference used to allocate the shared capacity |
| Observation cutoff | Work at or before the cutoff keeps its existing date |

Choose **Calculate delivery dates**. Every occurrence retains its original ID, source date, useful-task quantity, funding group IDs and full result. Two occurrences may share a later delivery date while keeping their two identities. The candidate recalculates workload, economics, original target opportunities and completion dates through the existing planner.

Use **Resolve competing dates** when flexible services compete for capacity. A complete group can move together so a narrow permitted date remains available for another service. Only a whole valid placement replaces that group's earlier allocation. Fixed, past and unresolved work retain their capacity reservation. The result names any unknown effort, unavailable date, deadline, funding-date or spacing constraint preventing allocation.

The standard search admits up to 100,000 candidate placements; the extended setting admits up to 1,000,000. Its actual method, selected effort and visited decisions stay in the saved result. The original service-order method remains available. An incomplete search keeps the previous complete allocation available for review.

**Complete dates and constraints** exposes each allowed date and rejected-date reason. **Edit service rule**, **Edit effort and pool**, and **Edit capacity and pricing** reopen the actual input. After adjustment, calculate the whole alternative again. **Open full comparison** retains all unchanged and changed rows, complete documents, prices, capacity and participant coverage.

Choose **Save successor and comparison** to save the selected full result in the original case. The operating Calendar continues through its own Installation editor and current revision; the adoption successor retains that original Calendar and the reviewed delivery alternative.

The complete [allocation engine](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b923b22687b0726b86000e685c60a07cfbad5b72/stellar/scf_2026/sf47_budget_model/workspace/cohort_planning_scheduling.mjs) and [source operating guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b923b22687b0726b86000e685c60a07cfbad5b72/stellar/scf_2026/sf47_budget_model/workspace/COHORT-PLANNING.md#schedule-the-complete-delivery-workload) define this calculation.

## Follow actual purchases and complete received output

Once actual customer operations are recorded, save the selected adoption edition, freeze the corresponding original Cohort acceptance review and open **Cohort delivery**. Select those two complete original sources and choose **Compare selected sources**.

Automatic placement uses the original buyer, merchant, useful operation, network, asset, selected facilitator and first-attempt UTC date. Proposed identities and genuinely different source IDs can be linked with an explicit source note. A same-day ambiguity remains visible until the operator chooses the correct original funding opportunity.

The operator places each original intent group once. Repeated observations and retries remain together. Additional intents remain visible beyond the planned count. An identity annotation retains the original IDs and basis; the frozen native review continues to supply participant independence, team-operated classification, current completion, refunds and cancellations.

| Measure | Its source and meaning |
| --- | --- |
| Planned purchases | New charged requests/acquisitions from the selected adoption plan |
| Original intents | Original customer intent groups, retaining all their observations |
| Recorded completions | Current complete purchases classified by the frozen native review |
| Due remaining | Planned complete purchases due by the review cutoff less placed current complete purchases, floored at zero |
| First attempts | UTC date of the original intent's first attempt |
| Delivered on date | Actual UTC date when complete output arrived, including later delivery |
| Useful tasks | Whole customer jobs, separate from payments, pages and allowance usage |

Review unmatched intents before interpreting a due remainder. Use the same comparison's **Identity associations** and **Original intent placement** controls to repair a match. A changed source can invalidate an earlier choice; the full editable input and exact finding stay available for correction.

Save **comparison edition** in the original case. The resulting JSON contains the full saved plan, frozen review, choices, source metadata and complete report. Readable HTML includes all original documents; CSV retains all opportunities, intents, dates, amounts, operators, outcomes and findings. Use [Cohort delivery](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b923b22687b0726b86000e685c60a07cfbad5b72/stellar/scf_2026/sf47_budget_model/workspace/COHORT-DELIVERY.md) and [Cohort acceptance](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b923b22687b0726b86000e685c60a07cfbad5b72/stellar/scf_2026/sf47_budget_model/workspace/OPERATIONS-COHORT.md) for the exact installed and native contracts.

## Operate the same source through the CLI or Merchant MCP

For a file-based operation, export the full native Calendar and matching seed from the same selected case version. Use the actual group ID in the original seed:

```sh
starforge grant-cohort-plan calendar \
  --native-seed customer-use-cohort-seed.json \
  --calendar customer-use-calendar.json \
  --group "$GROUP_ID" \
  --output original-adoption-plan.json

starforge grant-cohort-plan schedule-seed \
  --input original-adoption-plan.json \
  --output delivery-choices.json
```

Enter the selected commercial, effort and capacity fields in the complete plan. Edit the returned complete scheduling choices with the actual permitted service dates. Then retain the whole allocation and successor:

```sh
starforge grant-cohort-plan schedule \
  --input original-adoption-plan.json \
  --constraints delivery-choices.json \
  --method resolve-conflicts \
  --max-search-steps 100000 \
  --output delivery-allocation.json

starforge grant-cohort-plan schedule-plan \
  --input delivery-allocation.json \
  --output delivery-successor.json

starforge grant-cohort-plan schedule-compare \
  --input delivery-allocation.json \
  --output delivery-comparison.json
```

The installed command preserves existing destination files. Use the same complete allocation or its saved edition when selecting the later comparison; it retains the full candidate source.

From the existing configured Merchant workspace, the eleven `merchant_grant_adoption_*` tools carry source selection, edit, review, rebase, schedule, compare, prepare, save, request, open and export. The schedule call accepts `method: "RESOLVE_CONFLICTS"` and `maxSearchSteps: 100000` alongside the complete constraints. `FIRST_FIT` selects original service order.

The nine `merchant_grant_cohort_delivery_*` tools continue the selected saved plan and frozen review through seed, edit, review, refresh, prepare, save, request, open and export. Inputs can be complete inline objects or verified whole-file host/snapshot/transfer references. The original file reader supplies every retained output byte.

A saved adoption predecessor is selected by its original source ID and SHA256. The original source writer retains the request ID, creation time, current case version and complete prepared bytes. An interrupted return continues that same request and accepted response. Reopening uses the actual returned source ID and recorded hash. A deliberate new edition uses the current case version and a new original request.

The [complete installed agent guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b923b22687b0726b86000e685c60a07cfbad5b72/stellar/scf_2026/sf47_budget_model/workspace/AGENT.md) provides the configured client, full field shapes and original save/recovery sequence. The typed entry points are `@tokenjunkielabs/starforge-merchant/grant/cohort-agent`, `grant/cohort-scheduling` and `grant/cohort-delivery-agent`.

For the recorded comparison command:

```sh
starforge grant-cohort-delivery seed \
  --plan saved-adoption-edition.json \
  --review original-cohort-review.json \
  --output cohort-delivery-input.json

starforge grant-cohort-delivery compare \
  --input cohort-delivery-input.json \
  --output cohort-delivery.json

starforge grant-cohort-delivery html \
  --input cohort-delivery.json \
  --output cohort-delivery.html
```

Use the existing complete case export/import for another operator's editable handover. Its complete original sources and earlier editions travel with the native case; individual CSV, HTML and calendar downloads support review and customer use.

## Current operated source and the original receiving join

The original Calendar operation `customer-use-calendar-26b1-20261012` used the received case at actual version 37. It retained eight recorded testnet purchases, associated two records with their selected buyers, saved a twenty-entry Calendar and its revised nineteen-active-entry edition, and prepared thirty-request/two-prepaid-group comparisons. Native CLI and authenticated HTTP export completed. Independent full-case receiving preserved those editions and saved and reopened edition three. The original Calendar procedure is retained in the [native run's selected c912e6ec source](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/c912e6ecb56a1f049901401d71f98be6cfd5dbb1/stellar/scf_2026/sf47_budget_model/workspace/CUSTOMER_USE_CALENDAR.md). Its eight retained records and the application's separate eighteen-purchase team testnet baseline keep their original scope.

The later full planner/allocator/agent exercise used production JavaScript modules in V8 with an in-memory filesystem and native-contract transport. Its nine retained schedules, five explicit funding groups and eight useful tasks preserved the original source and commercial totals. Conflict resolution changed two outstanding placements to a complete allocation, preserving USD 45 revenue and USD 35 cost. Complete comparison, original-request recovery and JSON/CSV/HTML exports ran through those production modules. That transport operation supplies engineering validation; actual native case saves continue through the selected provider and its returned original result.

The existing native continuation is case `operation-ce7a44c92e754424bbe9e7547a0d98c9`, plan `plan-884f92ceac834ec588b3271011f1e0e1`. Select its actual current case version, Calendar editions, saved adoption source and frozen review. The existing 26B1 Calendar and 140B/22B7/A66A receiving operators retain those original sources. Their returned complete case supplies the next actual operating state for this same application chapter.

## Customer installation within the existing funded programme

The reusable source described above is the selected starting component. Customer-specific work is assigned once within the canonical programme or a separately commissioned workshare.

| Existing package | Original allocation | Complete customer adaptation and receiving |
| --- | --- | --- |
| T1-resource — Merchant-resource integration | 80 hours / USD 7,600, days 1–30 | Bind actual source and useful task, typed output, billable unit and aggregate buyer approval; install the service and complete receiving in both selected merchant/buyer applications. |
| T1-handover — Authority and handover | 40 hours / USD 3,800, days 1–30 | Name accountable operators, connect source/terms changes and withdrawals, deliver the complete editable case and reopen it on the receiving installation. |
| T2-provider — Provider and ledger deployment | 70 hours / USD 6,650, days 31–90 | Operate the same approved service across two independent facilitators; join actual intent, transfer and complete output in the original record and review. |
| T2-threat — Deployed threat response | 50 hours / USD 4,750, days 31–90 | Complete the selected installed response cases and interrupted-delivery recovery while retaining earlier purchases, full outputs and original funding. |
| T3-mainnet — Mainnet merchant rollout | 90 hours / USD 8,550, days 91–150 | Operate the actual customer's agreed recurring calendar with production source/payment terms and useful returning buyer use; compare full planned and delivered work. |
| T3-recovery — Production recovery and handover | 70 hours / USD 6,650, days 91–150 | Restore original service state, source choices and customer files on the receiving host, reconcile later operations and complete maintainer support handover. |

The same six packages total USD 38,000 and 400 prospective hours across 150 days. Their existing original outcomes include ten useful testnet purchases across the two independent buyers in seven consecutive days, and thirty useful mainnet purchases across them in fourteen consecutive days with both returning on another day. The original native rule and review continue to control classification and acceptance. The calendar is filled with the customer's independently useful work and actual operating dates; retries, several file formats and repeated observations preserve their original task and intent.

## Receive this contribution through the original grant composer

The accepted whole H2 belongs inside the existing `# 9A. Current demonstration and operator journey`. The normal manuscript receiver carries it into the same companion. The additive `grant-products/cohort-adoption.json` declares six original source IDs, exact paths and complete measured editions under the maintained `stellar-forge.grant-product-registration.v1` schema.

The existing publisher receives the newest whole manuscript and current declaration through `grant-compose`. The original front writer retains the complete nine-answer narrative. The same four reader outputs, source package, saved submission, review, Page and Site continue through their existing publication operation. The guide and chapter supply this complete customer workflow to that operation.


## Reconcile payment value and actual delivery cost

The same **Cohort delivery** edition now includes [Commercial reconciliation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/80e82c047a5ba69955d96fa5e7bd9ad9a6bb45e3/stellar/scf_2026/sf47_budget_model/workspace/COHORT-DELIVERY.md#reconcile-the-original-commercial-result). The operator selects the original settled-in-window or first-attempt-in-window transaction population and compares its exact network/asset quantities with the saved plan. The [maintained comparison engine](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/80e82c047a5ba69955d96fa5e7bd9ad9a6bb45e3/stellar/scf_2026/sf47_budget_model/workspace/cohort_delivery_comparison.mjs) counts every canonical payment once. A payment supporting several original funding groups retains its complete source and accepts an explicit whole allocation across those groups; the parts must equal its original amount.

Dated, sourced valuations express those payments in one chosen reporting currency. Supplier costs, actual active labor, payment fees and other costs use their original source references and dates. A shared service component keeps all of its purchased groups and useful results while its recorded costs enter once. Native XLM network fees retain their separate stroop unit and can remain separate or be explicitly included in this analysis. Original refund cash and refunded intents are joined to reviewed refund values before adjusted revenue and contribution become complete.

The operator can inspect payment, cost and contribution variances against the same-currency plan, locate an unpriced asset or incomplete cost register, and revise the complete input in the existing desk. Missing prices, unresolved transaction amounts, unfinished cost coverage and unreviewed refunds remain visible with known subtotals. Saved editions and complete JSON, CSV and readable HTML retain all original sources and choices. The existing nine Merchant delivery tools and installed command carry this whole selection through edit, refresh, reviewed preparation, native source saving, original-request recovery and reopening.

Use the complete operator guide at the immutable product source linked above. Select the existing saved adoption source and frozen COHORT_EVALUATION review, retain the original case and request owner, and start the Commercial reconciliation tab. The initial choices keep cost coverage partial and native network fees separate. Enter the actual reporting currency, dated asset valuations, source-backed cost rows and refund joins before selecting complete coverage. The original Calendar funding groups, service component identities, transaction observations and native review classifications travel with the saved edition.

The public typed module exposes `seedCohortCommercialChoices` and the existing comparison functions. Merchant's existing edit operation accepts `START_COMMERCIAL`, `SET_COMMERCIAL` and `REMOVE_COMMERCIAL`; its original review, prepare, save, request, open and export operations retain the whole commercial input. The installed `grant-cohort-delivery commercial-seed` and `commercial` commands author the same complete successor. An incompatible refreshed source returns the full editable selection and its actual constraint.

The commercial workflow was exercised through the maintained planner, comparison and delivery-agent modules in V8 with a controlled source-contract fixture and an in-memory native client. Two purchased groups shared one service; one settlement spanned both groups, a second settlement retained its original identity, and actual labor, supplier cost, a refund and network fees produced USD 7 adjusted revenue, USD 4.00002 complete cost and USD 2.99998 contribution. The complete original request was saved once, recovered and reopened with unchanged source bytes. Earlier delivery-only reports remained unchanged. These amounts describe that controlled exercise; the selected customer's original recorded case supplies its own sources and actual commercial inputs.


### Receive original Work and invoice costs into the service result

The operator now selects [original Work and supplier invoice portions](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/193ddbdcf4ef69f220014751d7e872c2dede4c14/stellar/scf_2026/sf47_budget_model/workspace/COHORT-DELIVERY.md#receive-original-work-and-supplier-invoice-costs) from the full frozen case review. Work retains its original hours, contributor and civil-date interval; each supplier invoice line retains its original USD amount, issue date and linked Work. The operator selects the actual portion, complete shared service and dated hourly cost or currency value. Exact selected quantities cannot exceed the original record, and selected and unselected balances remain visible beside the whole source.

The [same comparison engine](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/193ddbdcf4ef69f220014751d7e872c2dede4c14/stellar/scf_2026/sf47_budget_model/workspace/cohort_delivery_comparison.mjs) keeps invoice-linked Work visible when both contribute costs. The operator removes a duplicated portion or records the actual source explaining distinct costs before full contribution becomes complete. Original invoice liabilities, Work valuation and payment cash preserve their different meanings. The source records, purchased funding groups and existing funding allocations remain intact.

Refreshing the selected saved plan and frozen review carries every authored quantity, rate and overlap decision forward. Changed original context remains an editable successor with its full retained and current sources; each affected selection requires explicit review. The operator can correct several records in the same desk, retain predecessor drafts and save the complete calculated successor through the existing source request. The installed command and nine Merchant delivery tools provide the same intake, individual source acceptance, native saving and full reopening.

The original-cost continuation used those maintained modules with full native Work/invoice source-contract records in the same V8 and in-memory transport environment. A selected 1.25 hours from 2.5 recorded hours at USD 4 per hour and USD 12 from a USD 20 invoice line produced USD 17 selected cost. Linked-source overlap remained visible until its actual distinct-cost explanation was entered. Refreshing the Work source preserved both portions, their rate and overlap review while requiring separate source acceptance; the complete 108,415-byte prepared comparison was saved once through the in-memory client and reopened exactly.


### Turn reviewed actual costs into the next service plan

The [recorded-cost planning operation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/bb47c6e3f2e8b86aba2e352522d6c29b6ea9cb2d/stellar/scf_2026/sf47_budget_model/workspace/COHORT-PLANNING.md#use-recorded-costs-to-prepare-a-future-service-plan) lets the receiving operator use a completed commercial reconciliation to prepare the next service window. The operator selects the original service costs, records the actual useful-output quantity and its measurement basis, and maps those portions to explicit future schedules. The complete original reconciliation, future baseline, chosen quantities, coverage explanation and derived assumptions remain together.

The original calculator derives supplier cost and active hours per useful result, retains unknown cost coverage, and evaluates the successor against the existing capacity pools and service price floors. Every selected actual-cost portion is conserved across the target schedules. Purchased funding groups, their prices, source identities and payment history keep their original meaning. A prepaid service therefore carries its future delivery cost without automatically becoming another sale.

The operator reviews the complete before/after comparison and continues editing in the planning desk. The saved successor retains the original cost proposal and a separate comparison showing subsequent manual changes. The same whole operation is available through the installed command and existing Merchant adoption tools, including native source review, preparation, retained-request recovery, saving and complete reopening.

The prospective planning continuation used those original production modules and the same V8 in-memory transport environment. With two explicitly measured useful outputs, the selected USD 12 invoice portion and 1.25 Work hours at USD 4/hour produced USD 6 supplier cost and 0.625 active hours per result at USD 4/hour. Two future results cost USD 17; both existing prepaid groups retained their identities and the original calculator reported no new charges. Partial coverage remained unknown, an excessive cost portion and a past target schedule were rejected, and the complete 779,545-byte native-contract edition was saved once and reopened exactly. The original browser form and working-session flow retained the complete proposal and saved source.


### Use the customer's saved task measurement in the next costed plan

The [saved-measurement planning workflow](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/13200897c9c1ef90fea1dc95c8dd27b2bb7cba13/stellar/scf_2026/sf47_budget_model/workspace/COHORT-PLANNING.md#use-saved-customer-task-outcomes-as-the-output-basis) lets the operator select an exact Customer task outcomes revision and its installed method or one recurring observation. The complete original population, period, output, quality, source selection and customer response remain attached. The selected completed-task count and stable unit supply the next service plan's cost denominator, with an explicit explanation linking that task to its selected original service costs.

The [original comparison engine](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/13200897c9c1ef90fea1dc95c8dd27b2bb7cba13/stellar/scf_2026/sf47_budget_model/workspace/cohort_delivery_comparison.mjs) retains observed, estimated and mixed measurement bases separately, alongside the original operator review and customer acceptance state. Refreshing the case preserves the chosen revision. Explicitly selecting a later measurement retains the earlier complete selection; manual planning assumptions can continue with that history still available. Native source review, complete saved editions, editable working sessions and the installed command and Merchant tools carry this full choice through the next delivery window.

The complete selected measurement is consumed through its existing native Task Outcomes getter; its original writer and measurement workbook remain unchanged. The focused source-contract course used the maintained production modules in V8 with in-memory native/browser/file adapters and explicitly controlled saved-response inputs. It retained the whole measurement through calculation, a complete 804,237-byte prepared source save and exact reopen, preserved a pinned edition while its history grew, and kept earlier selections when a later estimated observation was explicitly chosen. These results describe the consumer-contract exercise; the original saved customer source receiving remains with its current operator.
