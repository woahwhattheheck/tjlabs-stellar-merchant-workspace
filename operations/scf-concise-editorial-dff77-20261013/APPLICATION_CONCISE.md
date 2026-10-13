# Stellar Discovery Trust Layer

**TokenJunkieLabs — SCF #46 Build / Open Track**

Nine-answer working application, 13 October 2026. The funding case, architecture, evidence, six deliverables and financing assumptions are stated here. The same application retains the complete development and financial material. The issuer’s actual fields and limits will be applied when the invitation arrives.

## Project and requested outcome

TokenJunkieLabs builds open-source software that lets a buyer purchase a complete API, dataset or agent task on Stellar and continue using its result after delivery or handover. The buyer approves the task and spending; the merchant keeps the payment, fulfillment and accounting together.

We request **$38,000 for 400 prospective hours over 150 days from actual award acceptance** to deliver **two independently operated merchant services and two independent buyer operators**. Each merchant will complete an approved testnet purchase by day 30. By day 90, two buyers will complete at least ten useful testnet purchases over seven consecutive days, with both merchants represented, and one selected service will operate through two independent facilitators. By day 150, both merchants will operate on mainnet; two buyers will complete at least thirty useful purchases over fourteen consecutive days, both returning on another UTC day. An independent maintainer will restore and continue each installation.

The existing product is our starting point. The grant funds the remaining customer-source and consumer adaptations, Stellar deployment, provider compatibility, monitoring, recovery and handover. The grant will extend the shared public software that carries a paid task from an approved request through complete delivery, recovery after interruption and independent handover. The two installations will demonstrate that capability with customer use, while reusable source, provider and receiving improvements become available to other Stellar merchants and buyers.

## Customer problem, need and adoption

The initial customer is an API or data-service operator, or an agency implementing that service in a customer's application. The commissioning payer funds implementation; the merchant receives resource payments; the buyer pays for useful output. A workorder identifies these roles and their authority.

An analyst needs every agreed page, the correct reporting period and units, and a result that opens in the receiving application. An agent may need several paid calls under one approved spending limit. If payment succeeds before delivery is interrupted, the customer needs the original purchase recovered with its remaining output.

We will select two recurring installations: an economic or operational report with its source data, or a typed query/refreshed dataset used in a continuing application. A new reporting period, revised source or genuinely different query gives the buyer a reason to return. Selection will fix the source, complete output, paid unit, spending cap, host, cost owner and receiving engineer before day 1 development.

Current human conversations inform this offer. Veridex invited the buyer CLI into its testnet cohort and reported no third-party testing budget; our reply proposes a paid integration pilot, partner funding or an agreed reciprocal workshare. CoCart’s founder asked who introduces customers, pays and contracts for implementation; our proposal assigns introductions to CoCart and implementation/handover to TokenJunkieLabs under a direct customer contract and written referral arrangement. Blockscout expressed interest with no integration budget; Nansen declined. **The two independent funded installations remain to be selected.** Team-operated cases establish development evidence; funded milestones measure independent adoption.

Published customer needs give that selection concrete tasks. [GeoRobotix](https://georobotix.com/services/) integrates sensor data; the sent proposal covers a complete authorised observation period received by an independent analyst. Its illustrative workflow completed query/export and separate receiving; customer deployment and the paid service remain prospective. [Lutra Consulting](https://www.lutraconsulting.co.uk/migration-to-open-source-gis) supplies QGIS migration; the proposed work covers a baseline and corrected vector edition. [Inspry](https://www.inspry.com/wordpress-services/javascript-frameworks/) supplies headless WooCommerce; the proposed work covers one store and digital product, with CoCart as a possible introduction channel.

The environmental commissioning programme also has five sent offers and four shipped technical profiles for complete laboratory reissues, a client import, a monitoring study and a KiWIS programme. No acceptance or revenue is recorded for that cohort. These proposals supply source-qualified choices. The actual agreement, recurring reporting period/query and named operator must be confirmed. The [customer launch plan](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b5cc37b64b180cc3740ceba37786aac68ff43a63/products/merchant-workspace/CUSTOMER_LAUNCH.md) joins those decisions to the original Installation and Customer-use Calendar. Sales and customer research use separate funding.

The commercial model is paid implementation and handover, with separately scoped care. Merchants keep resource receipts and partners keep customer relationships. Grant and commercial work allocate each change and hour once. The 30-purchase mainnet target needs actual recurring demand: two buyers purchasing once per ordinary weekday yield only 20 purchases in 14 days. Selected jobs must support the full target; retries, reopening saved results and artificial task splitting add no demand.

## Why Stellar and what we contribute

Stellar provides buyer-authorized token transfers and shared settlement. We use existing SDKs, SEP-41 token contracts and facilitators, with explicitly configured fee sponsorship. Our proposed Open Track contribution connects this payment infrastructure to a complete customer task: the reviewed request, source edition, aggregate spending approval, every agreed output, recovery and independent maintenance.

|Existing foundation|Our application contribution|
| --- | --- |
|Stellar x402 supplies payment challenges, authorization, verification and settlement.|Keep each original transfer and response attached to the approved request and total task; collect every agreed page or file.|
|The Stellar MPP SDK supplies on-chain Charge and funded Channel with cumulative off-chain commitments and later settlement.|Carry task authority, original responses, funding/collection recovery and editable receiving through the maintained MPP workspace.|
|ApiCharge documents paid route grants, service levels, prices and access limits.|Preserve the purchased terms and consumed allowance through the customer's source, query and later work.|
|MPP Router documents paid proxy access, request-ID response caching and authenticated job polling.|Keep the selected request, source, payment and original operation together through interrupted delivery and independent reopening.|

This lets the next operator determine what was approved, what settled and what still needs delivery. Buyers retain signing and spending authority; merchants retain source, pricing and fulfillment authority. The application improvement is the continuity of the useful task across these stages.

The two-facilitator milestone will hold the useful service, schema, source population and output constant. The retained Vellar/Periplo comparison found no shared seller/route identity, so registering and adapting that same service remains funded work. The requested Open Track remains subject to issuer invitation and review.

Primary documentation: [Stellar x402](https://developers.stellar.org/docs/build/agentic-payments/x402/built-on-stellar), [Stellar MPP SDK](https://github.com/stellar/stellar-mpp-sdk), [ApiCharge](https://apicharge.com/Documentation/core-concepts.html) and [MPP Router](https://www.mpprouter.dev/llms.txt). Their relevant roles are described above.

## Defined architecture and operating behavior

The merchant workspace selects the authorized source, query, output schema, price and limits. Its HTTP or MCP resource retains types, nulls, keys, pagination, units, period and snapshot/live meaning. Browser, CLI, typed-client and MCP interfaces share the buyer's approval, settlement, delivery and recovery records.

For the funded x402 Exact path:

1. The buyer receives the actual `402 / PAYMENT-REQUIRED` challenge and matches an option to its configured network, asset, recipient, cap and timing. It retains the approved URL, method, body and complete terms, and reserves aggregate task spending.
2. The original Stellar SDK creates and simulates the SEP-41 transfer and signs the required Soroban authorization. That authorization covers the token call, parties, atomic amount and expiry. The application separately binds the approved HTTP request and output to the operation.
3. The buyer dispatches the complete envelope once in `PAYMENT-SIGNATURE`. The selected facilitator verifies and submits it with its configured fee account. Principal and fees retain separate records.
4. Under authorization timing, the merchant verifies, prepares the result, settles and releases it. Under explicitly selected upfront timing, settlement precedes fulfillment. Delivery failure can leave a successful payment and unfinished work; cancellation is not a refund.
5. The seller's `PAYMENT-RESPONSE` is checked against the configured RPC network, successful transaction and exactly one matching token-transfer event. Completion requires the reconciled transfer and all accepted pages/files. An unavailable or contradictory RPC observation leaves payment unresolved; the observer does not sign, repay or release the spending reservation. A settled purchase resumes its original entitlement or delivery session. The token authorization does not make fulfillment atomic with payment or prove the contents of a report.

A prepaid call retains its original pass and consumed allowance after defaults change. MPP Charge and Channel keep their distinct approval and recovery lifecycles. Channel tasks retain the selected contract, service, spending authority, original commitments, responses and collection. Cumulative commitments are distinct from individual on-chain transfers.

The same records continue through the customer’s work. Runtime Applications retains original files beside editable copies; saved procedures retain the task, source, decisions and history. Quotation, invoice, Stellar/bank receiving, allocation, refund and close use the original accounting workspace. Commissioning and invoice intake preserve reviewed source, recipients, amounts and requests through interruption. Principal, fees and commercial obligations remain distinct.

Node.js supplies browser, CLI, typed-client and MCP interfaces alongside Python/SQLite and PHP/WooCommerce applications. Named staff retain assigned cases and history. Releases identify upstream contracts, dependencies and licenses; funded contract changes will be published under compatible open-source terms.

**Complete installation recovery is implemented in the maintained release.** A receiving engineer gets the application source, configuration references, workspace, files, request history and support case. The operator captures the installation with its writers stopped. An interrupted restore continues the same authenticated files and destination; a lost reply does not repeat a completed restore. Unrelated files and later work are preserved. The host validates the complete current installation before adoption. The [complete operating guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/0e3adb79ac8de8971f0665a704a3407fef692072/stellar/scf-starforge-20261009/sf101-merchant-recovery/workspace/HOST_HANDOFF.md) covers setup, saved-state recovery, host receiving and independent support. The current additions passed complete source review and actual-module courses with reference filesystem/native interfaces; installed Linux receiving remains to be recorded. T3 funds deployment and measured customer recovery.

T1 configures this architecture for the selected customers. T2 implements provider compatibility and monitored recovery. T3 operates the reviewed mainnet configuration and independent maintenance. Current reusable source is the starting product; funded estimates cover the remaining installation-specific work.

Development documentation: [unified product guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/68929767fd9c138e3bcee2df65ea9e5928ca565a/products/merchant-workspace/DEVELOPMENT.md).

## Working product and demonstrated results

The historical baseline is **18 distinct team-operated testnet purchases totaling 411,000 stroops / 0.0411 native XLM**, with fees separate.

|Operated case|Observed result|
| --- | --- |
|Complete paid HPD acquisition|Two 10,000-stroop purchases delivered 100 + 44 rows: one complete 144-row Queens HPD task, reopened as CSV/JSONL with source and accounting.|
|Limited MySQL query|One 50,000-stroop purchase returned 100 rows, 14 columns and 53,468 bytes with truncation explicitly true. Its complete response and history reopened with signing disconnected and in another directory.|
|Recurring data receiving|All 830 original OData Orders passed through typed collection, saved SQL, report, a two-sheet workbook and independent receiving. Three subscription editions, original-request replay and publisher/customer restores completed; unchanged source produced zero row changes.|
|Staff, billing and handover|Six profiles, three work records and two example invoices completed contribution, review, payment and correction across 15 desktop/mobile views with zero errors. Cold receiving retained all 421 source files and history.|

[Saved-pass operations](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/24506172ed7c4288d158ab7f6c1735c645dc6ab9/operations/api-pass-portfolio-agent-921ba0-20261012/NATIVE_RESULT.json) preserved selection and consumed allowance through changed defaults and cold receiving. [OpenLineage receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/1b1f756587619d21cab44f627f5d4e9b4fa6ad72/products/openlineage/OPERATING.md) retained a 1,000-row measurement against a 1,001-row requirement, its decision, unknown column count and two matching 76-file exports.

The October 13 merchant financial course completed eight HTTP/MCP workflows: quotation recovery, a $100 invoice, wallet observation/cancellation, a $25 credit and $75 receipt, full files, interrupted download and cold reopening with zero due. Seven paired wallet workflows covered native/issued-asset amounts, fee-bump aliases, replay and testnet/commercial separation. The [full operating result](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/2c69f99e2a787a0ff4966e1029c809fc65a8c0c2/operations/scf-receivables-native-2a51-20261012/HOSTED_RECEIVING.md) uses official SDK-generated XDR and controlled RPC observations. It adds no network purchases to the 18-purchase baseline.

Other team-operated handovers preserve customer decisions: Resource Review resolved a conflicting return and continued editing after complete journal receiving without source files, with twelve desktop/phone views free of recorded page/console errors. Human Services received twenty fields as three FHIR resources with warnings, referral and editable workspace. Installation receiving retained named observations, explicit KEEP/APPLY decisions and changed-criteria review through cold reopen at revision 3.

The OData managed selection loaded all twelve entry points; preparation/adoption and managed Start/receive/Stop/reopen remain to be operated on that edition. The new complete-host restore also awaits its separate installed receiving.

Catalog discovery was evaluated separately across 27 resources, 33 queries and 31 scored query–resource pairs: expected-resource retrieval improved from 22 to 31 and top-three placement from 19 to 29; direct and indexed results agreed on all 33 queries. Nine general queries have no expected-resource mapping.

The [original acquisition record](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/687ea12ac97f06b7f1336676249c349ade7a7692/products/merchant-workspace/DEVELOPMENT.md#5-existing-delivery-foundation-and-receiving-examples) and [reviewer operating guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/03a93f7c59a703ebc63416ae0e914f07099fef37/products/grant-reviewer/OPERATING.md) retain the complete purchase and receiving examples. The [3:32 product/team film](https://github.com/woahwhattheheck/public-commons-sprint-2026/releases/download/scf-presentation-20261011/stellar-forge-scf46-presentation.mp4) follows the limited MySQL result, purchase/accounting and independent receiving. The complete HPD task is a separate case. These observations establish the named development and receiving results; the funded milestones below require independent customer and mainnet operation.

## Three funded tranches and six priced deliverables

Day zero is actual award acceptance. **400 hours at $95/hour total $38,000.**

|Tranche / deadline|Package|Hours / cost|Required completion|
| --- | --- | --- | --- |
|T1 / days 1–30|Merchant-resource integration|80 / $7,600|Both services run on their selected hosts. Each buyer completes one approved Stellar testnet purchase through a supported facilitator and opens all agreed output in its application. Retain the approved request, independently observed successful transfer, network/asset/accounts/atomic amount and useful output. Recurring data reopens with its source/customer edition and complete receiving backup.|
|T1 / days 1–30|Authority and handover|40 / $3,800|A second accountable operator reopens each installation and performs an agreed change or withdrawal. Previously acquired output remains usable under its original terms. Publish required installation and recovery corrections.|
|T2 / days 31–90|Provider and ledger deployment|70 / $6,650|The same service runs through two independent testnet facilitators with documented registration and payment/fee-policy compatibility. Two independent buyers complete at least 10 useful purchases during seven consecutive days ending by day 90, representing both merchants. Each facilitator carries distinct approved purchases with service, schema, population and output held constant.|
|T2 / days 31–90|Deployed threat response|50 / $4,750|Both installations have their threat models, monitoring, responders and material corrections. Operate an interrupted settled purchase and a merchant-delivery failure through acknowledgment, recovery and useful output, retaining both financial and unfinished-delivery states. Managed Stop/reopen preserves the connection, edition and original request.|
|T3 / days 91–150|Mainnet rollout|90 / $8,550|Both merchants run reviewed mainnet releases with production configuration, recurring consumer integration, release and rollback. Two independent buyers complete at least 30 useful purchases during 14 consecutive days ending by day 150; both return on another UTC day for a distinct completed purchase.|
|T3 / days 91–150|Production recovery and handover|70 / $6,650|Complete supervision, off-host retention, key rotation, receiving-host restore and post-backup reconciliation. An authorized engineer restores original state/files, reconciles later operations, measures recovery time and completes an independent maintainer's support case.|

Tranche costs are **$11,400 / $11,400 / $15,200**. The 400 hours comprise **320 engineering + 80 integration/handover**, allocated **96+24 / 96+24 / 128+32**.

Bryce owns delivery, source/release decisions and tranche submissions. Each workorder names the merchant/source operator, buyer, integration engineer, receiver, support responder and acceptance owner. One person may fill several delivery roles; independent adoption counts accountable external people or organisations once in each role across their routes, hosts, agents and wallets. Two project-controlled endpoints do not establish two independent facilitators. Team-operated development purchases and team-funded rehearsals do not count toward independent adoption.

Reviewers receive the workorder, selected release, approved requests, native transfer observations, accepted output and operating/receiving results. T2 adds the same-service provider comparison and seven-day cohort; T3 adds mainnet configuration, the fourteen-day cohort and support/restore results. T1 purchases retain their original period and do not count again toward T2. Both mainnet merchants must receive use within the selected cohort.

The starting components are the seller/buyer and source/receiving applications for T1; facilitator, signer, spend control, accounting and monitoring for T2; and release/rollback, backups and Support for T3. Each funded change belongs to one package and installation requirement, including receiving instructions. Work shared with a commercial scope is allocated once. Unchanged source data stays unchanged in later-edition comparisons.

The request covers prospective Stellar-integrated work. Completed pre-award work, general operations, sales, purchase principal and fees use separate funding. There is no purchase subsidy. Existing compute is the starting resource; incremental service reserve and hosted Actions budget are $0. Workorders name the parties responsible for host charges and purchases.

## Threat response and outcome measurement

T2 applies the existing ten threat decisions and eight monitoring/response definitions to each customer's source, release, authority, network and facilitator. Each deployment records protected data, signals, numerical thresholds, notification and acknowledgment routes, and primary/backup responders.

The response programme covers altered offers or approvals, payment/output attribution, unauthorized access, interrupted fulfillment, missing observations and restoring the wrong generation. The two required recovery exercises retain financial and delivery states, response/recovery times, useful output and observation gaps, then reopen that history after restart.

A **completed purchase** has one distinct approved intent, an independently observed native transfer and complete useful accepted output. Deduplicate transactions per network and keep assets and fees separate. A prepaid pass counts once after its first agreed operation produces accepted output; later calls are usage. A **completed task** includes every agreed page/file or order action: the HPD example is two purchases and one task.

Cohorts retain the original first attempt, with settlement and acceptance inside the selected window. Later observations keep their dates; attempted, complete, partial, unresolved, cancelled and refunded outcomes stay visible. Purchase principal, assets and fees remain distinct. Reopening, retrying or rereading one original purchase does not add a purchase.

Customer-value measurement compares equivalent population, period and output before installation, on first use and on recurrence: active effort, corrections, time to accepted output and unresolved work. Economic value uses the customer’s measured hours and stated hourly value, less implementation and incremental provider, host, payment and support costs. Accepted milestones, actual collections and support effort remain alongside those measurements. Public reporting uses sanitized counts, timing, coverage, unresolved findings and source/version references; customer files, request bodies, signing material and response destinations remain in their protected workspaces.

The merchant owns its source, terms and fulfillment; the buyer owns signing and spending policy; each facilitator owns its fee/signing and service boundary. Primary/backup responders and the receiving engineer get the selected release, complete customer state and open cases. Implementation follows Stellar’s [threat-modeling guidance](https://developers.stellar.org/docs/build/security-docs/threat-modeling) and [monitoring template](https://developers.stellar.org/docs/build/security-docs/monitoring/monitoring-template-builders).

## Delivery capacity, payment timing and sustainability

The lowest examined timely allocation is **25 engineering + eight integration/handover hours weekly**; named availability and payment arrangements remain uncommitted. T1’s 96 engineering hours need **19.2 active days at five hours/day**, leaving four to fourteen hours in twenty to twenty-two weekdays before local holidays. Customer selection, access and hosts must be ready before funded development. Grant and accepted customer work share one calendar.

SCF payments are **$3,800 at acceptance, then $7,600, $11,400 and $15,200 after the corresponding approvals**, compared with delivery costs of **$11,400 / $11,400 / $15,200**. The USD-equivalent award is paid in XLM at the applicable reference on each payment day; conversion fees and later price movements are separate. Each tranche completion is due within **90 calendar days of the preceding actual payment**. Anticipated delays require written notice and SDF acknowledgment before the deadline; an extension is discretionary and requires written confirmation.

**The grant request is not available cash.** From zero opening cash and with the full package value modeled as cash cost, T1 costs $11,400 against the $3,800 initial receipt, leaving $7,600 to finance before the following payment and further lag/costs. The unchanged day-30/90/150 receipt plan needs a grant-only bridge of **$17,250 / $23,275 / $26,600 at 14/30/60-day review/payment lag**. December 7 is a planning assumption; these lags are sensitivities, not issuer promises. Filing when all actual criteria are complete reduces the modeled fourteen-day case to $15,200. Worked hours alone do not establish acceptance.

Current proposed financing comprises **seven workshares, 392 customer hours and $48,720 in quoted fees**, alongside the grant’s 400 hours. This work and financing remain uncommitted. All customer delivery, correction and support obligations must be reserved before counting contribution. GeoRobotix is outside this selection.

|Current combined planning assumption|Modeled result|
| --- | --- |
|792 grant/customer hours at the original $95/hour cost basis, including original referral assumptions|$11,120 contribution before further costs; $10,920 after the separately identified $200 source/compute reserve.|
|20% more grant and customer effort at that same cost basis: 950.4 hours|A $3,928 deficit before the reserve, or $4,128 after it. The requested grant remains $38,000.|
|That increased effort at proposed cost ceilings of $85/hour for core/integration and $75/hour for additional/paired work|$8,072 before the reserve, or $7,872 after it. The rates and availability are not agreed commitments.|

Payment timing cannot cure the original-cost overrun. Costs require actual accepted scope, qualified availability, opening cash, obligations, collections and confirmed financing. The $200 reserve has no selected payer/date and stays separate from dated cash peaks. The complete financial companion retains original terms and all historical cash/staffing scenarios.

Sustainability comes from implementation and separately scoped care around reusable open-source software. The proposed $600 monthly care illustrates the need for scope control: it leaves $125 at five hours or $30 at six at the $95/hour planning valuation, before other costs. Actual contributor payments, invoices and hosting costs enter the operating forecast separately.

By day 150 each operator receives the selected release, saved plan and Runtime handoff, dependency/license inventory, untouched inputs and continuing working copies, complete state/history, configuration references, installation/upgrade instructions, operating procedure and open support cases. The handover names the host owner, maintainer, primary/backup responder and service-cost owner. Updates review route/schema/payment changes and drain admitted work before switching. Rollback preserves later purchases/output; restore reconciles post-backup operations. Necessary compatibility corrections and migration instructions return to the maintained component. Paid care retains its own scope.

The [financial companion](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar-forge/developer-site/dist/grant-data/product-and-finance.md#8-capacity-and-cash-plan) retains the complete histories and links to the original working forecast/calendar. The [SCF payment guidance](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines) and [Official Rules](https://stellar.gitbook.io/scf-handbook/scf-awards/official-rules-for-submissions) govern award payments. The requested scope remains **six packages / $38,000 / 400 prospective hours / 150 days**.

## Applicant, experience and submission

**Bryce Muhlnickel**, a United States individual operating **TokenJunkieLabs**, is accountable for product, relationships, engineering and operations. Submitted selections are **Developer Tooling; Open Track; United States team; Global / Not region-specific; no referral**.

The maintained Node.js/Stellar x402/MCP, Python/SQLite and PHP/WooCommerce product, operated purchases and complete receiving demonstrate relevant implementation experience. The film identifies Bryce's role. **AI agents generated and assisted code, interfaces, operating programmes, design, documentation and this application**, and supported source review and native operation. Bryce is responsible for the artifacts, statements and commitments.

SCF acknowledged the Build Interest Form on **October 11, 2026 at 14:59:29 UTC**. The retained issuer record still awaits the full-application invitation and reply to the October 10 inquiry about the individual route and two-eligible-human-participants rule. Applicant, contributor and KYC declarations will follow the issuer's actual questions and facts.

SCF #46 lists **November 8, 2026** for submission, November 11–18 panel review and November 23–December 3 voting. Award distribution is undated; the 150-day schedule starts at actual acceptance. Actual invited fields and limits will map to these answers while preserving edited versions. The retained working record contains no issued numeric field limits.

The submitted local-financial-infrastructure answer remains “Not sure yet”: global USDC/XLM support is proposed without a new domestic rail or fiat on/off-ramp.


Official references: [round calendar](https://communityfund.stellar.org/awards/recxrSMYwAl8vcglg), [submission criteria](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/submission-criteria) and [Open Track](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/open-track). The applicant and contributor eligibility clarification remains outstanding; this draft does not substitute assumptions for an issuer decision.
