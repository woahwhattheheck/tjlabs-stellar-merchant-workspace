# Launch the first complete customer services

Use this playbook to take two selected merchant installations from an agreed customer job through useful paid output, recurring operation and receiving-engineer handover. It accompanies the [development plan](DEVELOPMENT.md) and the maintained [Grant Operations guide](../grant-operations/OPERATING.md).

The launch uses the existing Customer installations, Buyer, Merchant Workflows, Accounting and Cohort interfaces. Its deliverable is an operating service: the buyer receives the whole result in the application where it will be used, the merchant can account for that work, and another engineer can maintain the installation.

## 1. Choose the customer job and commissioning arrangement

Start with a job the customer already needs to complete. Write its output in the customer's language: a complete reporting period, a reviewed filing comparison, a selected event window delivered into its database, or an exact source edition received into its analytical workspace. State what business decision or downstream operation uses that output.

Prefer a first installation with a reachable source, a receiving application the customer already uses, an accountable operator and a clear reason for a later purchase. A useful later purchase can follow a new reporting period, source edition, event window or independently requested query. An unchanged saved-result reopening continues the earlier purchase.

Agree the commercial arrangement around that job. A platform author, service merchant, implementation payer and end customer can be different organizations. The commissioning workorder should answer who pays for implementation, who operates the resource, who buys its output, who supplies the host and who receives the finished installation. The commissioning fee and resource price have their own recipients and accounting records.

The existing [Installation workflow](../../stellar/scf_2026/sf47_budget_model/workspace/INSTALLATIONS.md) retains these choices with the original commercial attachment. The [Workshare intake](../../stellar/scf_2026/sf47_budget_model/workspace/WORKSHARE_INTAKE.md) can receive a complete original workshare, its phase assignments and payment milestones into the same operating case.

### Give each accountable role an owner

| Role | Decision and work | Handover record |
| --- | --- | --- |
| Commissioning payer | Accepts the implementation scope, fee, payment timing and receiving outcome | Original workorder and its actual commercial status |
| Merchant operator | Selects the authorized resource, published terms, hosting and release | Original source/deployment and saved merchant installation |
| Buyer operator | Chooses the useful task, receiving application and spending authority | Original buyer deployment, request and complete output |
| Source administrator | Supplies the permitted source selection, credential reference and change procedure | Source edition or authorized live-operation reference |
| Facilitator operator | Supplies its supported network, scheme, asset and settlement service | Provider identity, service URL and original service selection |
| Receiving engineer | Takes over configuration, operating history, customer output and maintenance | Complete selected installation handover and receiving record |

An organization can take several roles when that matches the arrangement. The independent-operator targets use the accountable organizations recorded in the original cohort. Several wallets, hosts or sessions operated by the same organization retain that one identity.

### Make the first two installations complementary

The following pairing is an implementation recommendation. Select the actual customers and sources through their existing workorders.

| Installation | Complete customer task | Existing product path | Reason to buy again |
| --- | --- | --- | --- |
| A: recurring analytical output | Receive the entire selected source population or report, retain its meaning and open the result in the customer's analytical application | A maintained dataset/HTTP/GraphQL source product; Buyer receiving; complete customer export | A new reporting period, source edition or distinct analytical question |
| B: operational event or application output | Receive the selected event window or application result and complete the agreed destination operation | The maintained webhook, captured API or native application product; Merchant Workflows; destination/customer receiving | New events, a new customer request or an independently required application operation |

Each installation should have one useful service whose behavior can be followed from source selection to completed receiving. Select the existing adapter that matches that source. The [product entry points](README.md) and [operating guide](OPERATING.md) identify the maintained engines and their current interfaces.

The pairing gives the delivery team two different customer outcomes while preserving the same payment, delivery and handover architecture. Its source adaptations occupy the original six funded work packages below.

## 2. Define the whole task and its paid unit

Separate the complete customer result from the requests priced by the merchant. A report may require several paid pages. A prepaid allowance may fund several later operations. An event window may require cursor continuation. Write all three meanings into the workorder:

1. **Customer task:** the complete result and receiving action.
2. **Priced unit:** the request, page, file, operation or allowance the merchant charges for.
3. **Completion:** the condition under which the customer has all required output and any agreed destination or fulfillment action has finished.

For a source population, record the query, scope, keys, field types, units, time basis and snapshot/live behavior. For an event window, record its time/ledger boundary, event identity and continuation rule. For a report, record its period, selected inputs and complete output files. The receiving engineer should be able to tell exactly which result belongs to the original task.

### Use the completed product examples to design the agreement

The existing [application source](../../stellar-forge/developer-site/dist/grant-data/application.md) describes a Queens HPD operation that received all 144 selected rows in two paid pages of 100 and 44. That is one complete dataset task with two paid intents. Its two original 10,000-stroop transfers belong to the recorded development operation.

The same application describes a prepaid example that purchased an eight-unit allowance for 10,000 testnet stroops, used two units for a complete result and retained six. The purchase of the allowance and the subsequent consumption have different records. An allowance can produce a later useful result without another settled transfer.

Use those source-backed examples to choose the commercial unit. Enter the actual customer's price and expected task size in its own installation. The development examples remain attached to their original source, network and operator.

### Price the task exactly

The Installation input retains the payment network, asset, recipient, whole atomic unit price, expected priced units and aggregate task budget. Review the complete task cost together with the buyer's original authority.

For one fixed-price unit in one asset:

```text
expected resource amount = unit atomic amount × expected priced units
```

For several routes, add their original atomic amounts only within the same network and asset. Keep asset identity and decimals with the amount. Record network fees, facilitator charges, source subscription costs and hosting costs in their own categories. A quoted dollar amount, an asset amount and a network fee retain their separate meanings until an explicitly dated valuation is supplied.

The existing [pricing workspace](../merchant-economics/OPERATING.md) retains supplier cost editions, route allocations and reviewed pricing. Use it to understand the cost of producing the task before choosing the resource price. A commercial implementation fee belongs to the commissioning workorder; the merchant's resource receipts belong to the merchant's settlement/accounting operation.

For a variable-size task, agree the discovery or quotation step, maximum spend and continuation decision. Carry the actual approved task budget into the original Buyer workspace. When a task needs more paid requests than originally approved, preserve the acquired results and obtain a deliberate continuation through that workspace.

## 3. Prepare one complete commissioning brief

Create the brief beside the original customer workorder, then attach it through Sources in the existing Grant Operations case. The following table is a working input form. Fill it from the customer's actual arrangement and selected source.

| Field | Entry to prepare |
| --- | --- |
| Original workorder | Existing case/reference, complete source attachment and current commercial status |
| Commissioning payer | Organization, accepted scope and original fee/currency/payment milestones |
| Merchant | Accountable operator, source administrator and selected deployment |
| Buyer | Accountable operator, receiving application and selected deployment |
| Receiving engineer | Named operator, receiving host and continuing maintenance destination |
| Useful task | Customer purpose, exact request, complete expected output and destination action |
| Repeat trigger | New period, source edition, event window or distinct customer request |
| Source | Original reference, population, keys/types/units/time, snapshot/live behavior and change procedure |
| Resource terms | Protocol, endpoint/tool, arguments, network, asset, recipient, atomic amount and authorization lifetime |
| Task economics | Priced-unit definition, expected units, aggregate budget, actual fee basis and cost payer |
| Facilitators | Accountable operators, actual endpoints, network/scheme/asset support and fee policy |
| Installation | Selected product, source commit/archive, runtime, host, release and customer state |
| Receiving outcome | Complete files, application operation, accounting/fulfillment requirement and acceptance observer |
| Work assignment | Original grant work-package IDs, separate commercial assignments and receiving responsibilities |
| Continuation | Source/price change, release change, interrupted purchase and support/care scope |

Open decisions can be saved as a planning installation and assigned in the existing delivery queue. Keep the draft usable as the team resolves those choices. The original native seed supplies the complete input fields and the case's actual work packages.

### Receive the commercial source

When the workshare already exists, use **Customer installations → Receive commercial Workshare**. Select its original commissioning attachment and matching receiving packet, inspect the native case inventory, and prepare the chosen case into a new installation or the next edition.

The importer supports the complete original `dealscout.workshare-commissioning-inputs.v1` and `sec-workshare.commissioning-inputs.v1` sources described in [Installation operations](../../stellar/scf_2026/sf47_budget_model/workspace/INSTALLATIONS.md). It carries the commercial phase criteria, owners, dependencies and effort. Complete the native customer-task, payment, receiving and funding fields in the original editor.

A revised workshare becomes a new original attachment and a later Installation edition. The original phase and source history remain with the prior edition. Use the source revision to update commercial phase definitions, then continue the actual receiving work through the existing preview/save interface.

### Save through the maintained interfaces

The product already supplies a browser, CLI, typed client and Merchant MCP interface. Choose the interface used by the actual operator and retain that same case.

| Step | Existing interface |
| --- | --- |
| Create the complete input | Browser **New installation**; typed `installationSeed(caseId, expectedVersion)`; CLI `installation-seed` |
| Receive a commercial workshare | Browser **Receive commercial Workshare**; `installationWorkshares` and `installationWorkshareSeed` |
| Review the complete input | Browser **Review complete installation**; `installationPreview`; CLI `installation-preview` |
| Save the reviewed edition | Browser **Save reviewed edition**; `installationSave`; CLI `installation-save` |
| Read its history | Original saved-edition view; `read('installation-history', ...)`; CLI `installation-history` |
| Hand over the complete case | Browser **Export complete handover**; `download('installation', ...)`; CLI `installation-export` |

The native seed's `document` is the complete editable Installation input. Its preview uses the current case version and intended installation edition. Save that same document with the returned preview identity and original request ID. The [full contract](../../stellar/scf_2026/sf47_budget_model/workspace/INSTALLATIONS.md#native-api-and-typed-client) supplies the envelope and receiving semantics.

Assign actual implementation and receiving work in the existing [delivery queue](../../stellar/scf_2026/sf47_budget_model/workspace/DELIVERY_QUEUE.md). Its assignee, due date and priority support planning; the observer of completed work retains its own native identity.

## 4. Install the agreed service and receiving application

Start from the selected product's operating guide and the actual source/archive selected for the customer. Keep the immutable product edition, installed runtime and mutable customer state identifiable throughout commissioning.

Use a source selection that contains the entire chosen product, browser assets, clients and operating guide. The [source-selection guide](../../stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md) and [runtime installer](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) describe the maintained packaging and installation paths.

The delivery lead records the selected source commit/archive and the customer's intended host. The source engineer configures the authorized original source and operation. The buyer engineer configures the receiving application and spending authority. The receiving engineer prepares the actual destination for the whole customer output.

For a new customer, the commissioning sequence is:

1. Receive the original source and reproduce the selected request using the maintained source adapter.
2. Review the complete output shape, original meanings and the customer's intended downstream use.
3. Configure the merchant's terms, route and selected payment service on the intended host.
4. Configure the buyer's exact request, receiving application, wallet reference and task budget.
5. Complete the paid operation and receive every required page/file into the actual application.
6. Complete the agreed destination or fulfillment action and connect the result to the original financial record.
7. Save the installation edition, complete customer output and the operator's receiving notes.
8. Give the receiving engineer the complete handover and have that engineer continue the same customer workflow.

The source-specific guide supplies the original commands and format. The [merchant operator guide](OPERATING.md) connects the shared runtime, original service, Buyer and customer handover.

### Keep request selection and payment authority explicit

The application retains the approved HTTP request or MCP endpoint, tool and arguments, the selected source and full expected result. Stellar/Soroban payment authorization carries the selected native transfer authority. The merchant and buyer connect the transfer to their original approved request and delivery state.

Read the actual selected scheme and SDK contract when configuring that association. A payment authorization by itself does not establish the semantics of an arbitrary HTTP response or the completeness of a dataset. The application-owned request and receiving records carry those meanings.

The official [x402 Stellar overview](https://developers.stellar.org/docs/build/agentic-payments/x402) explains Soroban authorization and facilitator operation. The maintained product's Buyer and source-specific guides supply its actual request, result and recovery interfaces.

### Choose the two facilitator services by operator and supported network

The proposal's T2 service must operate through two independently operated facilitators. Record their accountable operators as well as their URLs, actual supported scheme/network/asset, selected SDK version and fee policy.

As documented on October 12, 2026, the [Built on Stellar service](https://developers.stellar.org/docs/build/agentic-payments/x402/built-on-stellar) publishes separate testnet and mainnet URLs and supports x402 v2 with the exact scheme. The [Stellar facilitator directory](https://developers.stellar.org/docs/build/agentic-payments/x402#x402-facilitators) describes Coinbase's Stellar route and Vellar as testnet options. Select the service actually supported for the network being commissioned.

A provider's testnet/mainnet URLs retain the same accountable operator. A self-hosted facilitator is an independent operator only when the receiving organization actually controls and operates it. The native Cohort record retains that operator relationship.

Use the same useful customer operation when demonstrating the T2 provider transition. Preserve the original source/query/output definition while selecting each service's actual payment requirements. Keep the resource result and native financial outcome connected to the intended provider. A later production deployment selects its actual mainnet service and retains that choice in the installation.

## 5. Operate a recurring customer task

A first successful request creates the working foundation for repeat use. Agree the next useful period, source edition or event boundary with the customer and record it with the original installation.

The maintained **Merchant operator → Workflows → Recurring customer work** interface can retain a named series, original cycle inputs, source changes, saved runs and prior-period history. Its [operating guide](../../stellar-forge/mcp-merchant-operator/console/WORKFLOW_SERIES.md) connects the browser, CLI and typed client to the same native workflow. Select the actual source inputs for each period, review the saved work and continue through the existing engine.

For a recurring analyst task, retain the previous source and complete report while receiving the next edition. The customer can compare the editions and open either one. For an event task, continue from the original agreed cursor/window and record which events reach the destination. For a prepaid service, retain the actual allowance purchase and consumption so the customer can see how much of the approved plan remains.

Carry the useful output through **Customer** export and the receiving application. The customer package should supply the original results, source selection, period/request definition and instructions needed to continue the business task. The receiving engineer uses the product's original receive/reopen operation and retains the returned destination identity.

### Complete the financial handover

The resource transaction, implementation invoice and ongoing-care invoice may have different payers, recipients and timing. Operate them through their original records.

The [merchant financial operations guide](FINANCIAL_OPERATIONS.md) and [merchant payment-plan product](../merchant-payment-plans/README.md) describe the retained customer amounts and dated payment work. The maintained [accounting platform client](../../stellar-forge/mcp-merchant-operator/ACCOUNTING-PLATFORMS-CLIENT.md) carries the chosen QuickBooks/Xero operation and original provider return.

For the implementation workorder, retain its accepted phase, issued invoice, actual receipt allocation and balance. For resource use, retain the network, asset and atomic amount with the original purchase. Select an explicit valuation only where the commercial accounting operation needs one. Keep any refund, credit or correction connected to its original item.

Offer ongoing care around an observable service obligation: a named maintenance interval, supported source/release changes, expected receiving assistance and a defined commercial price. Use actual recorded delivery effort and support demand to refine that offer.

## 6. Complete the unchanged grant delivery plan

This playbook implements the current six-package proposal. The [canonical application](../../stellar-forge/developer-site/dist/grant-data/application.md) and the case's pinned `deployment_acceptance_plan` remain the source of the funded work and proposed measurements.

| Window | Funded work | Hours | Amount | Customer result |
| --- | --- | ---: | ---: | --- |
| T1, days 1–30 | Merchant-resource integration | 80 | $7,600 | Both merchants operate the agreed useful service and their buyers receive the complete result |
| T1, days 1–30 | Authority and handover | 40 | $3,800 | A second accountable operator reopens each installation and completes its agreed source/terms change or withdrawal |
| T2, days 31–90 | Provider and ledger deployment | 70 | $6,650 | Two independent buyers complete at least ten useful testnet purchases during seven consecutive days; the same operation completes through both facilitators |
| T2, days 31–90 | Deployed threat response | 50 | $4,750 | The customer continues an interrupted settled purchase and a merchant-delivery failure through the useful result |
| T3, days 91–150 | Mainnet rollout | 90 | $8,550 | Both merchants operate on mainnet; two independent buyers complete at least thirty useful purchases in fourteen consecutive days and both return on another day |
| T3, days 91–150 | Production recovery and handover | 70 | $6,650 | The receiving engineer restores the operating state, reconciles later work and completes the independent maintainer's support case |
| **Total** | **Two complete merchant installations and recurring independent customer use** | **400** | **$38,000** | **150-day prospective delivery plan** |

The original rate is $95/hour. The tranche delivery costs are $11,400, $11,400 and $15,200. The proposal's day zero is actual award acceptance. Original issuer payment and completion records determine the corresponding funding and completion clocks.

Assign each source adaptation to the actual work package once. Retain separately commissioned commercial assignments with their original workorders. The proposal funds prospective integration and deployment; the existing implementation, recruitment, general operations, purchase principal and service charges have their own funding basis. Its incremental service reserve and hosted Actions budget are both $0.

### Schedule the entire customer operation

At the start of the first tranche, use each complete commissioning brief to assign the merchant/source, buyer/application and receiving work. Prepare the two installations together so the provider, runtime and handover decisions can be shared where appropriate.

During T1, complete source and consumer adaptation, usable delivery and the second operator's source/terms change. During T2, complete the two-provider operation and the customer's interrupted-delivery continuation while retaining its actual recurring-use window. During T3, commission the mainnet deployments, operate the actual recurring-use period and deliver the complete receiving-host recovery.

Use the existing Installation delivery queue and [Portfolio](../../stellar/scf_2026/sf47_budget_model/workspace/PORTFOLIO.md) to allocate those original phase tasks to the actual available resources. The original phase graph and the customer's commercial conditions determine sequencing. The original [Forecast](../../stellar/scf_2026/sf47_budget_model/workspace/FORECAST.md) retains dated cash assumptions and actual collection conditions.

## 7. Report paid use and completed customer work together

The funded ten/thirty purchase targets retain their original meaning. The operator should also be able to answer how many whole customer tasks finished, how much those tasks cost and whether the output was actually used in the receiving application.

The [Cohort workflow](../../stellar/scf_2026/sf47_budget_model/workspace/OPERATIONS-COHORT.md) already retains original intents, paid amounts, complete parent products, accountable operators, return use and recovery outcomes. Use those native records when describing adoption.

| Measure | Unit and interpretation |
| --- | --- |
| Original purchase attempts | Original approved intent groups with their payment-attempt and outcome records |
| Completed paid purchases | Original intents that meet the pinned cohort's settlement, complete-output and applicable fulfillment criteria |
| Complete customer tasks | Parent outputs with every expected original purchase and the entire agreed result/receiving action complete |
| Distinct customers | Accountable buyer and merchant operators retained in the original deployments |
| Returning customers | Distinct completed original intents on different UTC completion days under the pinned rule |
| Prepaid purchases | Settled allowance purchases with original price, asset and financial outcome |
| Allowance use | Actual subsequent consumed units and useful customer outputs under that original allowance |
| Resource receipts | Original settled atomic quantities grouped by network and asset |
| Network/provider costs | Known fees in their original denomination and explicit source; unknown observations remain unknown |
| Implementation revenue | Actual commercial invoice and receipt records, retained separately from resource payments |
| Receiving outcome | Whole customer output opened in its intended application and the maintainer's actual continued operation |

A ten-page acquisition can have ten paid intents and one complete parent task. A saved-result reopening retains the original intent. A prepaid consumption with no new transfer can be useful customer use while adding zero settled purchases. Those relationships make the economics intelligible without changing the proposal's targets.

For the stated T2 measurement, select the original seven consecutive UTC calendar dates ending by the proposed day-90 boundary. For T3, use the original fourteen-day window ending by the proposed day-150 boundary. Retain the actual observed cutoff, original first-attempt and completion times, selected operators and source coverage.

The original Cohort interface evaluates the selected case population and saves the reviewed result. It can retain incomplete observations while the actual installation continues. Use **Cohort acceptance** in the same operating case and select the existing original purchases, useful operation, facilitator and customer output. The [native contract](../../stellar/scf_2026/sf47_budget_model/workspace/OPERATIONS-COHORT.md#native-cli-and-api) also exposes the same seed, preview, prepare and export through the CLI and authenticated service.

## 8. Hand over a service the maintainer can keep using

Deliver the complete selected Installation edition through **Export complete handover**. Its native ZIP retains the original operating case, commercial/source attachments, saved editions, complete history and the selected-edition marker.

The receiving engineer imports that complete case into the receiving workspace and reopens the selected edition. The original merchant/source and buyer/customer packages accompany it through their own maintained export/receive operations.

The receiving session should leave the engineer with:

- The selected source release, runtime and actual service configuration references.
- The complete original customer task and its source, payment and receiving choices.
- All agreed customer output and its source/period identity.
- Original purchase, delivery, fulfillment and accounting history.
- The native commands and browser entry points for continued operation.
- The source/terms change, release, rollback and recovery procedures for that installation.
- The named maintenance owner and the actual commercial care arrangement.

Continue an interrupted purchase using its existing request and recorded financial state. Continue an interrupted handover using its existing source and receiving operation. A deliberate source, price or scope change becomes a reviewed later edition with its own native history.

The result is a maintained customer installation and its next useful operation. Keep its commissioning, recurring use, financial records and receiving history together in the existing product.

## Maintained sources

| Source | Purpose |
| --- | --- |
| [Development plan](DEVELOPMENT.md) | Architecture, current product behavior and original funded roadmap |
| [Merchant operating guide](OPERATING.md) | Installed runtime, source/merchant/buyer operation and complete receiving |
| [Grant Operations](../grant-operations/OPERATING.md) | Original planning, commercial intake, installations, delivery and handover |
| [Installations](../../stellar/scf_2026/sf47_budget_model/workspace/INSTALLATIONS.md) | Complete commissioning fields, native APIs, immutable editions and full case receiving |
| [Cohort](../../stellar/scf_2026/sf47_budget_model/workspace/OPERATIONS-COHORT.md) | Original purchase/task/operator populations and proposed tranche measurements |
| [Recurring customer work](../../stellar-forge/mcp-merchant-operator/console/WORKFLOW_SERIES.md) | Saved customer periods, original runs, prior history and complete customer receiving |
| [Current application](../../stellar-forge/developer-site/dist/grant-data/application.md) | $38,000 / 400-hour / 150-day plan and the original ten/thirty-purchase targets |
| [Stellar x402](https://developers.stellar.org/docs/build/agentic-payments/x402) | Native authorization and current documented facilitator/network options |
| [Built on Stellar facilitator](https://developers.stellar.org/docs/build/agentic-payments/x402/built-on-stellar) | Hosted exact-scheme service configuration and network selection |
