# Stellar Discovery Trust Layer

## Build application · SCF #46 · Open Track

**TokenJunkieLabs requests USD 38,000 equivalent in XLM for 400 prospective delivery hours over 150 days from actual award acceptance.** The work installs a useful paid Stellar service with two independently operated merchants, two independent buyer operators and the same selected operation through two independently operated facilitators.

The product is open-source, self-hostable merchant and buyer tooling. It carries an approved API request, dataset or paid MCP tool through native settlement, complete useful output, fulfillment and operating handover. The merchant controls its source and terms. The buyer controls its keys, request and spending. Another engineer can reopen the installation and recover unfinished work.

The working development baseline comprises **18 distinct team-operated purchases totaling 411,000 stroops, or 0.0411 native testnet XLM**, with network fees recorded separately. The funded milestones establish independent customer operation, repeated use and production receiving from that baseline.

### Application at a glance

| Item | Proposed or observed basis |
| --- | --- |
| Applicant | Bryce Muhlnickel, United States individual operating TokenJunkieLabs |
| Category and track | Developer Tooling · Open Track · Global / Not region-specific |
| Requested work | Six future integration and deployment packages, 400 hours at the USD 95/hour planning assumption |
| Delivery windows | Installed services and handover by day 30; repeated testnet use and threat response by day 90; mainnet operation and production receiving by day 150 |
| Interest state | Interest acknowledged October 11, 2026; awaiting the full application invitation |
| Round dates | Full Build deadline November 8, 2026; panel review November 11–18; community voting November 23–December 3 |
| Award timing | Award distribution is undated. The implementation clock begins at actual award acceptance. |

## 1. Customer problem and commercial model

An API or data-service operator needs to expose a useful resource to agent applications while retaining access rules, source meaning and commercial control. A buyer needs the complete result it approved and a way to resolve an interrupted paid request. The difficult join spans four records: approved request, settled transfer, delivered output and accepted fulfillment or accounting.

Current x402 reports show the practical need for that join. One October 2 report described payment-bearing requests rejected because a merchant required POST while the reference client retried GET; health and catalogue checks had appeared normal. The author subsequently corrected the server. An October 3 report described settlement without a discovery listing, with later indexing and facilitator diagnostics in the thread. These were Base deployments. They show how a healthy catalogue or settled payment can leave the customer's task unfinished. Our Stellar implementation retains the exact request and each original outcome so the unfinished step can be recovered. [Method report](https://github.com/x402-foundation/x402/issues/3657) · [Discovery report](https://github.com/x402-foundation/x402/issues/3677)

We serve recurring API/data-service operators, the developers using their results and agencies commissioned to integrate them. A fixed-fee implementation delivers one agreed operation and a handover the receiving engineer can maintain. Further care has its own scope. The commissioning payer, merchant controlling the resource and independent buyer may be different organizations. The workorder names each role, its source and host authority, payment responsibility and acceptance owner. The merchant retains its API or product receipts; TokenJunkieLabs invoices the implementation.

The selected customer task and the priced unit are recorded together. A complete report may require several paid pages. A handover may contain many files or transport chunks. The buyer retains per-request and aggregate spending controls while the operating record shows whether the whole task is complete. A later reporting period, changed source edition, fresh query or new order gives the same buyer a reason to use the service again.

## 2. Product architecture and control

Six connected components form the application: the merchant's private source/release workspace; its HTTP or MCP operation; the native Stellar SDK and configured facilitator; the buyer's private approval and spending state; complete result and delivery records; and merchant fulfillment/accounting. Merchant and buyer services run on their operators' hosts. Approved operations are public; administration, provider credentials, signer references and operating state stay private.

| Stage | Implemented customer control |
| --- | --- |
| Review and publish | Review a source edition or named live query, its arguments and schema, public fields, output limits and complete payment alternatives. Save rights, route, network, asset, recipient, atomic amount and authorization lifetime. Changes or withdrawal become new reviewed states. |
| Connect the source | Preserve original types, missing/null values, pagination and snapshot/live meaning. Customer-controlled credential or OAuth aliases select access and the existing quota/cache state. Retain the edition behind each result. |
| Approve and purchase | Save the actual endpoint, method or tool, arguments, payment option and result scope. Match remote schema and challenge to that selection before signing. Keep the per-payment ceiling and the application's aggregate reservation/budget owner. |
| Settle and deliver | Use the configured native SDK/facilitator for verification and settlement. Save the server's response, full output, byte identity and durable merchant notification. Independently reconcile transaction network, asset, payer, payee and atomic amount. |
| Use and maintain | Receive every selected page or file into the customer's existing application, query, report or workbook. Preserve the parent acquisition and earlier source editions. Existing order and finance authorities control fulfillment, refunds and accounting. |
| Deploy and receive | Select the release, HTTPS service, restricted administration and supervision. Drain, restart, roll back and restore with the original configuration, history and complete customer files. |

The native x402 flow reuses the existing Exact Stellar scheme, token contracts and facilitator supported/verification/settlement interfaces. For paid MCP, the HTTP endpoint, tool and arguments remain distinct from the payment resource. An unsigned call obtains the challenge; the full payment option must match the saved quote before the signed call is dispatched. The official MCP SDK transports the payment and settlement metadata.

Server confirmation, independently observed transfer, complete useful output, receiver acknowledgment and order fulfillment remain separately visible. An uncertain signed reply retains its dispatch state for reconciliation. Reopening a consumed quote returns saved work. Recovery of a complete retained result uses that saved result. A new request or changed purchase gets its own review. Complete export and restore carry the configuration, history and referenced files; the receiving host supplies current authorized secret references.

Browser, CLI, MCP and installed Applications use these same saved workspaces. Native source registrations connect setup, operation and lifecycle while preserving each source adapter's data semantics. The existing request-collection, buyer-to-Operations and document-analysis extensions retain their own original recovery operations; their pending native receiving stages are reported separately from the completed examples below.

## 3. Why Stellar and the ecosystem fit

Stellar settles the approved operation. Buyer approval binds the complete request to its network, asset, recipient and integer atomic amount. Existing libraries and payment services sign, verify and settle; our application connects the transfer to complete output and practical merchant fulfillment.

| Existing component | What it supplies | What this product contributes |
| --- | --- | --- |
| Native Stellar x402 and OpenZeppelin facilitator | Supported payment options, buyer-authorization verification and settlement | The approved HTTP/MCP request, original source, complete output and recoverable receiving operation |
| Vellar discovery | Optional discovery extension and best-effort catalogue updates independent of settlement | Saved offer/schema/terms and a complete source edition that remains usable through customer review and handover |
| Stellar MPP | Charge for individual requests; Session with funded channels and cumulative commitments | An existing Charge workbench that retains the native challenge, request and merchant profile through concurrent preparation and restart |

OpenZeppelin, Vellar, Veridex and Periplo remain payment-infrastructure choices. Rumble Fish is developing facilitator, discovery and SDK capabilities. We build on those components and return reusable integration and receiving improvements to the public source.

A retained comparison found 27 Vellar offers and two Periplo offers with no shared seller/route identity. The funded two-facilitator deployment therefore includes registering and integrating the same useful operation with both. Each completion will retain the selected provider's actual scheme, network, asset and fee policy. This makes the cost and effort of changing payment infrastructure observable while the merchant service and buyer task remain defined.

[Stellar x402 documentation](https://developers.stellar.org/docs/build/agentic-payments/x402) · [Stellar MPP documentation](https://developers.stellar.org/docs/build/agentic-payments/mpp)

## 4. Completed development work

The existing product supplies an operated foundation for the future customer deployments.

| Completed operation | Useful result and its boundary |
| --- | --- |
| Queens HPD data | From a 1,342-row source, the reviewed selection received all 144 rows in pages of 100 and 44. Both 10,000-stroop native testnet transfers finalized. The complete CSV/JSONL edition reopens with source and accounting. |
| Paid MySQL agent query | The MariaDB HPD Preservation/minimum-20 query returned 100 rows, 14 columns and all 53,468 bytes for 50,000 stroops on testnet. Scalar strings and the declared truncation indicator remained intact. It reopened with signing disconnected and in another installation. These are project-event records, rather than a count of unique buildings or current vacancies. |
| Order and receiving | WordPress/WooCommerce applied USD 1.00 and USD 1.50 credits to a USD 2.50 order and reopened both as applied, using controlled reverse-transfer RPC responses in that development exercise. CoCart completed guest-cart actions, native checkout, order handover and receiving of all 48 saved objects. |
| Filing analysis | A 10,000-stroop testnet purchase delivered Genpact's 2024–2025 comparison: four disclosure pairs, five findings and all 1,027,807 bytes. The editable workspace reopened, repeated receipt preserved its revision, and backup/restore reproduced the comparison elsewhere. |
| Supplier catalogue | Both original SAP SHINE SPS11/SPS12 editions contained 106 materials. The operator identified 106 supplier-only changes, reviewed the edition and retained exact identifiers and quantities: 12.500 EA remained 25/2. The original compiler built two 11-file merchant packages. Complete receiving preserved later customer decisions when an earlier bundle was imported. |

Across the development record, 18 distinct team-operated purchases transferred 411,000 stroops / 0.0411 native testnet XLM. Fees are separate. These purchases cover HTTP/MCP, DuckDB/Parquet, RPC, MySQL, Routescan, Socrata, an API plan, Huwise, Genpact, Blockscout and StellarExpert. Independent-customer mainnet adoption is the prospective funded outcome.

The filmed MySQL purchase is independently identifiable: transaction **50d61d1102bfcf960af44171e5248e0899ed6d99cec1951a62075f9a65a6cbed**, ledger **5,145,195**, completed **October 11, 2026 at 20:12:58 UTC**. Its complete result SHA-256 is **4c22f8a26d48156c3e07543328b62ca6f993ce60856166d6805dc0660d9acb8d**.

An installed incident-to-case operation completed an observation gap, notification retry, acknowledgment, recovery and support-case reopening. Encrypted merchant recovery and off-host restore are delivered components. The private grant reviewer completed its 14-phase desktop and 390-pixel mobile journey, including full result reads, Buyer close/export, cold reopening and second-operator receiving, with zero new payments and its processes closed. The later managed-Applications and merchant receiving continuations retain their pending state.

The complete economic briefing is another usable output: a 15-file offline report with all 2,219 original observations, 75 selected observations and 150 comparisons, plus saved review and CSV/JSON. Its unemployment, prices and GDP views preserve units, missing values and retrieval dates. Opening that example initiates no paid operation.

## 5. Funded work and acceptance

The six prospective packages total **400 hours / USD 38,000** at the **USD 95/hour planning assumption**. Day zero is actual award acceptance.

| Package and delivery window | Hours / USD | Remaining work and assessed completion |
| --- | --- | --- |
| T1 · Merchant-resource integration · days 1–30 | 80 / 7,600 | Connect both selected merchants' actual sources, runtimes, authorized access, typed input/output, public routes, payment terms and buyer setup. Each merchant operates one agreed HTTP or MCP service on its host; the buyer opens the complete selected result in its actual application. |
| T1 · Authority and handover · days 1–30 | 40 / 3,800 | Integrate source/terms change or withdrawal, receiving-engineer configuration and installation-specific recovery. A second accountable operator reopens each installation and completes the agreed change while earlier acquired output remains usable under its original terms. |
| T2 · Provider and ledger deployment · days 31–90 | 70 / 6,650 | Register and integrate the same useful service with two independently operated facilitators and the customer's buyer/ledger owner. Two independent buyers complete at least ten useful testnet purchases in total during seven consecutive calendar days ending by day 90. Original intents, observed transfers, full outputs and provider attribution are retained. |
| T2 · Deployed threat response · days 31–90 | 50 / 4,750 | Complete the deployment-specific threat model, monitoring/notification setup and material remediation. The customer operates an interrupted settled purchase and a merchant-delivery failure through acknowledgment, recovery and useful output. |
| T3 · Mainnet merchant rollout · days 91–150 | 90 / 8,550 | Integrate both production hosts, network/asset/account configuration, recurring task, controlled release and rollback. Both merchants operate on mainnet; two independent buyers complete at least thirty useful purchases in total during fourteen consecutive calendar days ending by day 150, and both return for a distinct purchase on another day. |
| T3 · Production recovery and handover · days 91–150 | 70 / 6,650 | Complete supervision, off-host retention, key rotation, receiving-host restore and reconciliation after the backup point. An authorized engineer restores original state/files, measures recovery, reconciles later operations and completes an independent maintainer's support case. |
| **Total** | **400 / 38,000** | **Two merchants, two buyers, two facilitators and an independently maintainable mainnet service.** |

The allocation is 320 engineering hours and 80 integration/handover hours: 96 + 24 in T1, 96 + 24 in T2, and 128 + 32 in T3. The three windows cost USD 11,400 / 11,400 / 15,200. Bryce assigns actual contributors, rates and working-day availability within those packages.

Each installation starts from one complete workorder: recurring task and commissioning payer; merchant, buyer and receiving operators; source rights and access; selected host/runtime; exact request, full output and priced unit; approved network, asset and terms; repeat-use trigger and acceptance owner. The source contract identifies snapshot/live behavior, keys, field/time meaning, limits and completeness. T1 implements those concrete joins into the existing product.

Each performed adaptation is assigned once to its grant package or a separately sold commercial workorder. The grant pays for future Stellar integration, deployment, technical recovery and handover. Existing implementation, routine operation, sales and purchased usage have separate records. Usage targets carry no purchase subsidy. Existing compute is the starting resource; incremental service reserve and the planned hosted Actions budget are both USD 0.

## 6. Customer selection and repeat use

Four human conversations inform the current decisions. Veridex invited an open testnet design partnership after declining an external testing budget; the subsequent proposal is USD 1,500 over five business days. Nansen referred a proposed read-only Holdings integration internally and confirmed on October 12 that the Holdings detail was included; its proposal is USD 2,400 over five business days. CoCart's founder asked about introductions, the commissioning payer, referral compensation, responsibilities and contracting; its proposal is USD 7,200, 60 planned hours and fifteen business days. Blockscout expressed interest on October 12 and reported no current integration budget; the proposed workshare is USD 4,800 over ten business days.

Bryce owns these favorable relationships and subsequent agreements. The first CoCart customer remains to be selected. Source-platform participation and the organization commissioning an installation are recorded separately. These responses are customer learning and proposed work, with acceptance and collected revenue retaining their actual stages.

Selection favors a recurring buyer task, permitted source, accountable merchant host, independent receiving application and agreed payer. The buyer engineer connects the operation to the application's existing authorization, signer, aggregate budget and destination. The receiving engineer uses the full output, records corrections and reopens the same operation. The maintainer completes a source or terms change, recovery or receiving task during handover.

Eight October 12 data-platform proposals apply this method to AceMQ, OpsTree, Cazton, Natron, Severalnines, Altinity, Percona and ScaleGrid. Their separately retained scopes total USD 52,500 for 350 planned hours, priced at USD 150/hour. At the common USD 95/hour labor assumption, modeled labor is USD 33,250 and the remainder before other costs is USD 19,250. A 25% labor overrun leaves USD 10,937.50 before other costs. These are proposed economics; they do not select the funded customers or establish revenue. Scope, original customer ownership and actual effort determine the next implementation estimate.

The six funded packages retain their own hours. Qualified commercial work is scheduled and costed separately so the same adaptation is assigned once. No combination of overlapping offer cohorts is presented as booked business.

## Recurring economic-report installation

The maintained FRED application supports the complete reporting cycle: retain original release calendars and series vintage histories; save a watch for the selected series or an existing analyst template; review the next source acquisition; acquire the chosen observation vintage; preview and save its analyst report; publish the selected report through the existing merchant; and receive the useful result through the original buyer. A second engineer can receive the complete economic project, reopen its saved plans and reports, and continue that same reporting procedure.

**Useful customer task and roles.** An economic research desk, reporting team or software application needs a defined report for a later period while retaining the basis of its previous publication. The commissioning workorder names the organization paying for implementation, the merchant controlling the source and publication, the independent buyer using the result, and the maintainer accepting the operating handover. It selects the series, source rights and access, calculation choices, reporting interval, required output, native payment terms and receiving application. An independent operator can assess the finished task directly by opening the whole delivered report and tracing each measure to its retained current and baseline observations.

**The paid unit.** A published analyst edition advertises complete report assets through the original FRED merchant. One selected `briefing.html` download is a complete offline report with its local measures/source interface and CSV/JSON exports; `briefing.json` is the corresponding machine-readable report. The advertised resource identifies its byte count, SHA-256 and content type. The buyer prepares that exact GET and reviews the original network, asset, recipient, integer atomic amount and authorization lifetime. The original Stellar SDK, facilitator and Buyer carry verification, settlement, retained output and recovery. If an installation instead requires multiple advertised files or paged observations, each selected native resource retains its own request and price, and the agreed complete output and aggregate spend are part of that installation’s task.

**Acquire the right source edition.** A saved release watch names the series or original briefing template, observation interval, baseline date and whether to catch up every applicable vintage or select the latest available one. The operator retains the complete official response pages and reviews calendar changes, series vintage dates, coverage and source meaning before saving the plan. Calendar dates describe the publisher’s release schedule; the returned series vintage dates drive actual observation acquisitions. An incomplete source interval exposes the exact additional selection to acquire. The operator then selects a planned date, and the original FRED observation provider acquires its exact series, period and as-of selection into the same economic project.

**A recurring edition.** The template retains the original series/comparison selection, relative-change choices, precision and meaning. Its calendar policy names the number of complete months, the selected-series observation-date rule and any trailing months to omit. Missing markers retain their original dates; a quarterly observation date remains its source period label. Preview exposes every selected series’ source and window coverage, changed units/frequency/seasonal adjustment, new or departing periods, and changes to current values and baselines. Saving a successor retains the normal analyst review and complete report, ready for the original publication and customer path. The full predecessor comparison is also available as HTML, CSV and JSON.

Reopening a saved report or resuming its download retains the original purchase. A later reporting window or newly retained source edition begins the next useful operation: review the selected acquisition, inspect the changed report and approve its publication. Catch-up completion belongs to the selected watch and exact release snapshot, so a later snapshot can reveal an additional series revision on a date already processed. Previous plans and buyer reports remain readable with their original source and values. Source retrieval time, API real-time/vintage dates and observation-period labels retain their distinct meanings.

**Implementation within the existing funded plan.** The six packages below are the application’s shared allocation for both selected merchant installations. This economic-reporting case supplies concrete work and acceptance inside those packages; its installation workorder assigns each adaptation once.

|Existing package|Economic-report installation work|Customer outcome|
|  ---  |  ---  |  ---  |
|T1 — Merchant-resource integration, 80 hours / $7,600|Connect the selected authorized source, original FRED project and report procedure to the merchant’s native route and buyer’s receiving application; implement required source/report mappings and deployment corrections.|The independent buyer opens the complete agreed report from the installed merchant, with its selected observations, calculations and original payment terms.|
|T1 — Authority and handover, 40 hours / $3,800|Implement the customer’s source/terms change or withdrawal and receiving-maintainer configuration against the same saved project and native publication.|Another operator reopens the installation, performs the agreed change, and retains earlier acquired reports and their original terms.|
|T2 — Provider and ledger deployment, 70 hours / $6,650|Register the same useful report operation with both independent facilitators and adapt actual payment requirements, fees and buyer configuration.|The common seven-day cohort completes at least ten useful testnet purchases in total across the two independent buyers; the same selected operation works through both facilitators.|
|T2 — Deployed threat response, 50 hours / $4,750|Implement the installed source, approval, settlement and file-delivery threat assessment; monitoring, notifications and customer-specific recovery for the two required response cases.|The customer resolves an interrupted settled purchase and a delivery failure while retaining the original financial outcome and complete useful report.|
|T3 — Mainnet rollout, 90 hours / $8,550|Configure the production hosts, native network/asset/accounts, recurring report consumer, controlled release and rollback; correct actual installation defects.|Both merchants operate on mainnet and the common fourteen-day cohort reaches at least thirty useful purchases in total, with both independent buyers returning on another day.|
|T3 — Production recovery and handover, 70 hours / $6,650|Implement the selected off-host retention, secret-reference replacement, receiving-host restore and reconciliation of operations after the backup point.|An authorized maintainer restores the same reporting project and complete customer files, measures recovery time and completes an independently accepted support case.|


The allocation remains **400 prospective hours / USD 38,000 / 150 days from actual award acceptance**. The workorder keeps implementation funding, report purchase principal, network fees and separately commissioned service charges on their original assignments. The customer’s actual report use, accepted corrections, time to usable output, repeat purchases and receiving handover feed the common outcome measures.

**Operate and transfer the delivered product.** The installed `fred` command, private FRED Applications workspace, typed client and merchant tools share the same project and original operations. Staff can acquire or import complete release source, save a watch, preview and save its plan, and select a planned vintage for acquisition before continuing the existing template/report/publish workflow. Interrupted source acquisitions and imports resume through their retained operation and source identity. Whole-project export includes original economic captures, analyst files, templates, successor relationships, publication plans, full release responses, immutable watches, saved plans and completed acquisitions. Receiving restores that complete working history and checks each planned acquisition against its original source selection. Saved original report files remain byte-for-byte readable through mobile presentation improvements and interrupted report preparation.

**Completed recurring-report receiving.** The original October 12 native operation saved the analyst template, generated its later reporting window and retained the successor in the same project at revision 5. The selected window contains 28 original observations. Its 76 comparisons retain 20 new periods, 20 periods leaving the window and 36 unchanged rows, including the original monthly missing markers. The complete successor outputs—152,956-byte HTML, 29,550-byte CSV and 213,562-byte JSON—remained byte-for-byte identical after complete-project receiving into a separate directory and reopening. The [original full native result and output identities](https://github.com/woahwhattheheck/public-commons-sprint-2026/tree/19417265c6757d19343952d303cd748dd4899e89/operations/fred-e2747-receiving-20261012/results) retain both completed executions of that same receiving operation.

[Merged complete release-planner application](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/280) · [Release planning, source acquisition and receiving guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/d14b92d08c56b311da33b58676f52b72e638d35f/stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/PROJECT.md) · [Official source and calendar interpretation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/d14b92d08c56b311da33b58676f52b72e638d35f/stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/README.md) · [Recurring briefing guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/d14b92d08c56b311da33b58676f52b72e638d35f/stellar/scf-starforge-20261009/sf30-seller-sdk/fred/TEMPLATES.md) · [Original analyst operation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/d14b92d08c56b311da33b58676f52b72e638d35f/stellar/scf-starforge-20261009/sf30-seller-sdk/fred/BRIEFINGS.md) · [Installed client and merchant operation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/d14b92d08c56b311da33b58676f52b72e638d35f/stellar-forge/mcp-merchant-operator/FRED.md)

## Coastal model-input installation

A coastal engineering team needs the selected station records in the format its model and analysts actually use, with the original observation, units, time basis, datum, quality fields and later corrections still traceable. Moffatt & Nichol’s published [numerical-modeling practice](https://www.moffattnichol.com/solution/numerical-modeling) and [Digital services](https://www.moffattnichol.com/digital) provide a concrete prospect for this installation. The original workshare proposes USD 18,000 for 150 planned hours over six active working weeks: one selected study, up to five NOAA stations and five years, one agreed CSV/JSON model-input convention and one deployment environment. The original inquiry was sent on October 12, 2026 to Moffatt & Nichol’s published general-routing mailbox, requesting the coastal, Digital or small-business outreach colleague. The firm would choose the actual study and acceptance reviewer and would retain calibration, engineering interpretation and client recommendations.

The merged Coastal Source Operations product carries the source work from a saved station and historical window through original response capture, reviewed source editions, selected input mappings, a complete study release and a returned-file decision. It preserves observation and prediction products separately, exposes complete coverage and source receipts, and retains the original station-specific datum and time meaning. A saved release fixes its source editions, selected windows, mapping and review. Later working-study edits do not change the files already supplied to the analyst.

The installation workorder names four operational responsibilities. The commissioning organization agrees and pays for its engineering scope. The merchant’s source operator controls the selected capture, review and release, including the rights and terms attached to the original data. An independent buyer uses the advertised result in its own analysis. The receiving engineer owns the installed configuration, restoration and support handover. One person may perform several staff tasks where the agreement permits it; the funded independent-merchant and independent-buyer targets retain their stated separation.

The useful priced unit is a selected advertised model-input resource, such as the complete released CSV for an agreed study and window. The quote identifies that resource, its selected edition, price, native payment requirements and expected complete result. Source archives, other formats and query pages retain their own advertised access and request terms. The USD 18,000 implementation proposal is separate from those resource purchases. A later observation period or an explicitly reviewed source correction supplies a reason to acquire another useful edition. Retrying the same request or reopening an already acquired edition preserves that original operation.

The engineering sequence begins with the client’s actual station selection and input specification. Staff retain the originals, inspect the selected periods and quality fields, and map source columns to the receiving model’s declared headings, units and missing-value rules. The reviewer decides whether the complete selected input is suitable for release. The analyst can then obtain the released files through the existing application or standard-library Python client, verify every selected file and original-source archive, continue an eligible native dataset query across all its cursors, and reopen the retained files offline. A selected query dataset follows the existing 250,000-row and 256 MiB parser limits; complete released study files remain the source for a larger handoff. A returned input is kept as its own original version. Full comparison and an explicit receiving decision preserve changes and ambiguous rows for the assigned engineer.

This is one candidate customer operation within the existing two-merchant deployment. Its selected adaptations would be assigned once in the original six-package workorder:

|Existing funded package|Coastal installation work|Useful completion in the existing cohort|
|  ---  |  ---  |  ---  |
|T1 merchant-resource integration — 80 hours / USD 7,600|Connect the agreed original station/source selection, accepted model-input mapping, complete resource route, native terms and receiving client to the selected host.|Each participating merchant supplies its agreed useful service; its independent buyer opens the complete source-bound input in the receiving model or analyst application.|
|T1 authority and handover — 40 hours / USD 3,800|Bind release authority, source and terms changes, receiving-engineer configuration, installation defects and the recovery procedure.|A second accountable operator reopens the installation and completes the agreed source or terms change or withdrawal while earlier acquired input remains available under its original terms.|
|T2 provider and ledger deployment — 70 hours / USD 6,650|Connect the same selected input service to the two independent facilitators, retaining their actual scheme, requirements and fee policy.|The existing target of at least ten useful testnet purchases by two independent buyers over seven consecutive days joins original intent, native transfer and complete input.|
|T2 deployed threat response — 50 hours / USD 4,750|Operate the installed settled-purchase interruption and merchant-delivery failure cases, including the staff acknowledgment and original request recovery.|The customer retains the financial outcome and unfinished delivery, then recovers the same useful input with the responsible operator’s response.|
|T3 mainnet rollout — 90 hours / USD 8,550|Complete production host and account configuration, reviewed source refresh, recurring analyst use, controlled release and rollback.|The existing two-merchant and two-buyer target reaches at least thirty useful purchases over fourteen consecutive days, with each buyer returning on another day; asset amounts and fees remain separate.|
|T3 production recovery and handover — 70 hours / USD 6,650|Finish supervision, original-file retention, key rotation, receiving-host restore and reconciliation after the backup point.|The authorized receiving engineer restores the source, release, query and returned-file state, measures recovery time and completes the independent maintainer’s support case.|


The existing total remains 400 hours and USD 38,000 over 150 days from actual award acceptance. The commercial proposal’s five source, model-input, analyst, staff-refresh and handover packages retain their own 30/24/36/36/24-hour allocation. Before commissioning, the workorder assigns each adaptation to its actual funding source and selects the deployment host and responsibility for service charges, purchase principal and network fees. The grant’s existing usage targets and cost assumptions remain the shared plan.

The original La Jolla receiving operation is registered; its complete operating run continues with the existing native owner and selected source rules. The standalone product and Python receiving implementation are merged. The original sent inquiry is retained in the company record; native receiving continues under its original operation and source selection.

The complete [coastal operating guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/92eb1c73a3cab9781ef7dbabdc12067344fb6aa2/products/coops/OPERATING.md), [study and release guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/92eb1c73a3cab9781ef7dbabdc12067344fb6aa2/stellar/scf-starforge-20261009/sf30-seller-sdk/coops/STUDIES.md), and [Python receiving guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/92eb1c73a3cab9781ef7dbabdc12067344fb6aa2/stellar/scf-starforge-20261009/sf30-seller-sdk/coops/python/RECEIVING.md) retain the full source and operator workflow. The [original commissioning brief](https://tokenjunkielabs.slack.com/docs/T0BRETUB5TK/F0C8GTX1N0J) and [company contact operation](https://tokenjunkielabs.slack.com/archives/C0BTTA66TK3/p1791793139122609) retain the proposed scope, milestones and correspondence.

## Merchant settlement, customer billing and accountant receiving

A working Stellar merchant needs the useful paid result and a financial record its customer and accountant can continue. The maintained product joins native settlement accounting, customer invoicing, dated receipt allocation, credit notes, installment schedules and Xero document receiving around the same original accounting workspace. That connection makes the installation maintainable after the first successful payment.

### The customer's complete operating task

The merchant's resource receipts and an implementation or service invoice retain their own original records. A paid resource begins with the approved HTTP or MCP intent, selected payment terms, native settlement and complete output. A prepaid allowance continues its original acquired order while later requests consume service units. A separately agreed customer invoice begins with the accepted scope and a reviewed issued document. Its selected Stellar wallet request retains both the invoice-currency value and exact native or issued-asset amount; receiving binds the verified transfer to the same customer obligation. Its receipt allocations and credits determine the dated amount due; a payment plan places that existing amount on agreed collection dates.

The accounting reconciliation retains the actual network, asset, transaction identity and atomic amount. Commercial-currency amounts retain the merchant's explicit valuation and accounting basis. The customer, accountant and receiving engineer can follow the resulting source link without converting an installment, repeated export or imported document status into another purchase.

|Operating stage|Customer and operator result|Original record carried forward|
|  ---  |  ---  |  ---  |
|Agree the source or service|Name the useful request and complete output, or select the accepted implementation/service quotation.|Buyer intent and terms, or original quotation, customer response and accounting customer.|
|Complete and reconcile the Stellar operation|Receive the full result and review the original settlement, independent network verification and delivery.|Native event, network/asset/atomic units, transaction fingerprint, complete result and selected accounting source.|
|Issue and receive customer charges|Review exact invoice amounts, dates and billing identity; record the actual receipt and its effective invoice allocations.|Frozen invoice files, receipt identity, allocation dates and explicit valuation where selected.|
|Continue collections and corrections|Review credits, dated releases, agreed installment editions and the customer's complete statement.|Original invoice/receipt history, schedule basis and every retained customer edition.|
|Receive into the accountant's organisation|Map issued invoices and credits to actual Xero templates, contact names, accounts and tax fields; receive its original returned document results.|Mapping version, immutable package, external document IDs, exact amounts, validation and correction history.|
|Hand over the running operation|Receive the complete saved workspace and its operating sources, reopen it and continue the customer's agreed task.|Original accounting journal, customer files, request identities, encrypted backup and post-backup reconciliation.|


### Shipped foundation and demonstrated operation

The [installed receivables product](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/8886181672f00ff8301477e111d97f20012f6962/products/merchant-receivables/README.md) receives the original service quotation, reviews exact-decimal invoice lines, freezes issued customer files and continues payments, credits and historical allocations. Its original complete native exercise passed with the accounting and quotation controllers, customer export, cold reopening and HTTP interface.

The [payment-plan product](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3c689665cd4b100b40bc59d1e398050678034677/products/merchant-payment-plans/README.md) is merged in public PR2334 and maintained workspace PR259. It reviews and activates an exact installment schedule over one invoice's dated balance, retains all customer editions, and reflects effective allocations, credits and releases in dated collections. The original whole-product receiving operation continues under its existing owner. The installed browser, typed client, CLI and managed Applications use the same original accounting writer.

The [Xero customer handover](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/2f8ae336e76966b25eb117aa940b5f77f0c74680/stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/xero/README.md) is merged in public PR2357 and maintained workspace PR278. Its completed original native exercise used two issued invoices, one credit, a receipt allocation, two profile versions, two package generations and six original-format JSON return files. It completed exact invoice/negative-credit import files, regional dates, document-ID conflict correction, full handover export and cold reopening at revision 23 on October 12, 2026. The original operation retains all 84 source files and its result.

The [complete merchant financial operating guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/merchant-workspace/FINANCIAL_OPERATIONS.md) carries installation, original source reconciliation, invoice issue, receipt/credit history, collections, accountant receiving and encrypted recovery together. The Xero service composes the existing receivables, payment-plan and customer-statement routes under one accounting owner. The [invoice-wallet collection workflow](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/65257b07b0ee6be78bbe40bcf67dae67fbacba50/stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/PAYMENT_REQUESTS.md) is merged in PR245. It binds an issued invoice to reviewed native or exact issued-asset terms, a memo and expiry; the customer reviews its SEP-7 request in the selected wallet. The original receiving operation verifies the returned transaction and records the public-network customer receipt and eligible allocation in the same journal. The test-network path retains its original verified observation. Its complete native receiving continues under the original operator.

### Future customer engineering within the current award

The existing request remains **USD 38,000 / 400 prospective hours / 150 days**. The six packages fund the selected installations' remaining Stellar implementation. The financial workflow provides their operating foundation; the grant allocation applies once to an actual customer adaptation and its technical receiving.

|Existing package|Selected future implementation using this foundation|Completion within the original funded result|
|  ---  |  ---  |  ---  |
|T1 merchant-resource integration — 80 hours / $7,600|Bind each customer's actual source, native payment option and complete result to its merchant/order identity; implement the required consumer and accounting source mapping.|Each independent merchant and its buyer complete the agreed useful operation with source meaning, selected native terms and original financial identity retained.|
|T1 authority and handover — 40 hours / $3,800|Configure the receiving operator, source/terms change or withdrawal, customer identity and installation-specific continuation; resolve material integration defects.|A second accountable operator reopens each installation, completes the agreed change and retains earlier purchased output under its original terms.|
|T2 provider and ledger deployment — 70 hours / $6,650|Register the same useful service with both independent facilitators and integrate their real return/fee handling into the merchant's original settlement and accounting source.|The two independent buyers complete at least ten useful testnet purchases in total during seven consecutive days ending by day 90, with the same operation completed through both facilitators.|
|T2 deployed threat response — 50 hours / $4,750|Implement the customer's threat model, monitoring, notification and reconciliation for interrupted settlement/delivery and incorrect financial or output attribution.|The two existing response cases preserve the original financial outcome and complete useful result through recovery, acknowledgment and same-case reopening.|
|T3 mainnet rollout — 90 hours / $8,550|Configure the actual production network, assets, accounts, hosts, recurring consumer use and controlled releases; finish material deployment fixes.|Both merchants operate on mainnet, and the two independent buyers complete at least thirty useful purchases in total within fourteen consecutive days ending by day 150, each returning on another day.|
|T3 production recovery and handover — 70 hours / $6,650|Finish the customer's off-host retention, key references, supervision, original workspace restoration, accountant receiving integration where selected and reconciliation after the backup point.|An independent receiving engineer restores the complete state and files, measures recovery time and completes the original support continuation.|


The selected workorder names its commissioning payer, merchant, independent buyer, receiving engineer and accounting decision-maker; its source rights and access; the exact request and useful output; network, asset, recipient, amount and fee responsibility; the commercial valuation and destination contract when selected; and the person accepting delivery. Each implementation item is assigned to its original grant package or a separately commissioned commercial workorder. Existing product development, ordinary bookkeeping and sales retain their original funding basis.

### Demonstrate and receive the same task

Begin the demonstration in the existing retained purchase workbench. Open its selected quote, native outcome, complete result and source. Reopen that same result with its retained identity, then show the merchant's original accounting event and its explicit commercial basis if one exists. This keeps the useful customer output at the center of the Stellar story.

For a customer that has a separately issued obligation, continue in the same accounting customer: open the original quotation/invoice, dated receipt allocation, credit and statement; review the effective installment edition and its original customer files; then show the Xero package, actual returned record and any correction family. The receiving engineer opens the complete saved workspace and continues those same records.

The demonstration records the actual selected source, customer, dates, output and result. The funded useful-purchase cohort follows its approved resource intent, independently observed transfer and complete useful output. Invoice collection retains its own issued obligation and original receipt. The application's purchase register keeps its existing distinct network transactions and useful-output definition. Collection schedules, accounting exports and repeated receiving contribute to operating continuity. Customer acceptance establishes whether the agreed complete result works in the receiving application, alongside measured active effort, source period/population and recovery time.

The official [Build criteria](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/submission-criteria) require the submitted answer to carry its substantive explanation. This chapter supplies that explanation within the existing manuscript; its product links give the receiving engineer the complete source and operator instructions. The [budget guidance](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines) supplies the future-development and tranche structure used by the unchanged six-package plan.

## 7. Threat response and useful-outcome measurement

T2 includes the actual deployment's threat assessment, monitoring thresholds, notification destinations, accountable responders and material remediation.

| Failure to operate | Control and observation |
| --- | --- |
| Changed source, request or terms | Match exact source generation, request and approved payment alternative before dispatch. Retain rejection cause, quote age, source expiry and capacity refusal. |
| Uncertain payment or incomplete delivery | Reconcile the original intent and transfer, retain partial output/entitlement state and recover unfinished work. Measure outstanding age and time to useful output. |
| Unauthorized access or exposed private state | Validate issuer, audience, subject, scopes, expiry and current authority. Restrict administration and protect credentials, keys, claim tokens, private bodies and backups; retain access/rotation observations. |
| Observation or notification failure | Keep the last useful capture, incident and original notification attempts. Retry the same event; measure coverage, alert, acknowledgment and recovery time. |
| Restart or state loss | Restore the selected backup and reconcile later operations. Reopen the same support case and full output on the receiving host; measure time, retained history and active effort. |

Count each independent organization or person once across agents and wallets. A completed purchase joins one distinct approved intent, an independently observed native transfer and complete useful output. Transactions are deduplicated within their network; amounts and fees retain their asset and atomic units. Required fulfillment remains separately visible.

Report completed/attempted purchases, complete/started parent tasks, returning buyers and accepted handovers. Keep partial, unresolved, canceled and refunded outcomes in the same cohort. A result reopen, delivery retry or transport chunk continues the original result. Returning use follows a fresh period, input or customer request. Payment, full output and recovery retain separate actual clocks.

For each customer, record the previous method and, where available, the active effort and corrections of a prior execution. Compare the installed task against the same input/output definition, retaining the actual period and population so a larger later source remains visible. Record customer acceptance, incomplete coverage and unresolved corrections. Measure active implementation/support effort separately from elapsed access or review delays, and merchant receipts separately from service invoices and collected business cash.

## 8. Capacity and cash plan

The delivery plan uses the original six packages, 400 hours and USD 38,000. A completed native scheduling comparison assumes award acceptance on **December 7, 2026**, Monday–Friday availability, and closures on December 25, January 1, January 18 and February 15. These are scenario inputs, not an announced award date or an assigned staffing commitment.

At 18 engineering plus eight operations hours weekly, one T1 task finishes nine calendar days late. At 24 plus eight it finishes one day late. **25 engineering plus eight operations hours is the lowest examined timely allocation**: all six tasks are scheduled, with zero late tasks and zero collection-timing findings. T1 finishes January 6; final handover finishes April 13, 23 days before the original May 6 target. Actual award timing and named contributor availability will replace the planning calendar.

SCF's four payments are 10%, 20%, 30% and 40%: USD-equivalent 3,800 / 7,600 / 11,400 / 15,200 for this request. Tranche delivery costs are 11,400 / 11,400 / 15,200. SCF pays XLM using its scheduled-payment conversion basis. Actual receipt dates, rather than a forecast award or payout date, anchor the completion-form deadlines.

| Assumed review/payment lag | Conditional payout days after award acceptance | Original evenly phased cash requirement | Selected 25 + 8 calendar cash requirement | Selected peak date |
| --- | --- | --- | --- | --- |
| 14 days | 0 / 44 / 104 / 164 | USD 15,200.00 | USD 17,250.00 | March 20, 2027 |
| 30 days | 0 / 60 / 120 / 180 | USD 18,746.67 | USD 23,275.00 | April 5, 2027 |
| 60 days | 0 / 90 / 150 / 210 | USD 26,346.67 | USD 26,600.00 | April 13, 2027 |

The selected schedule brings some labor costs forward. Its cash calculation spreads each package's remaining cost across the selected inclusive start/finish interval; the resource calendar assigns engineering and operations hours on working days. The same package totals are preserved. Opening cash remains unentered and these forecasts contain zero observed cash records. Working-capital provision, actual contributor payment dates and actual award/customer receipts are execution inputs to finalize against the agreed terms.

The separate combined-work planning example contains three conditional implementations: USD 21,200 of fees and 144 additional hours / USD 13,680 modeled labor. Its retained entered-date scenario reports a USD 7,680 peak additional requirement; a separate USD 5,000 planning entry reduces it to USD 2,680. A later four-customer scenario including Freeform totals USD 30,000 of proposed fees and 208 additional hours / USD 19,760 modeled labor. Grant plus those proposed deliveries totals 608 hours / USD 57,760 of modeled labor cost. Freeform's actual commencement, work and receipt dates remain unset pending its agreed trigger. These scenarios keep commercial delivery workload visible; they do not supply observed funding for the grant.

We will submit each tranche's completion form within 90 calendar days after receipt of the previous tranche payment. The original receipt sets the deadline. Completed deliverables, payment records, actual submissions and any SCF-confirmed extension remain together. The day 30/90/150 implementation plan continues from actual award acceptance.

## 9. Applicant, delivery experience and assistance

Bryce Muhlnickel is the United States individual operating TokenJunkieLabs, accountable for product direction, customer relationships, engineering delivery and operations. Published JavaScript/Node services compose the native x402/Stellar and MCP libraries. Python applications preserve complete acquired data in typed/versioned SQLite tables and saved SQL views. PHP connects native WordPress/WooCommerce product mappings and checkout. The completed paid datasets, native MCP query and customer receiving examples demonstrate the practical integration and recovery foundation for the proposed deployments.

AI agents generated and assisted source code, interface code, operating scripts, design, documentation and application material. They also performed source review and native operating exercises. Bryce remains responsible for the artifacts, statements and delivery commitments. The team film identifies that responsibility and assistance.

SCF acknowledged the individual Build Interest Form on October 11, 2026. The full application remains at **INTEREST_SUBMITTED_AWAITING_INVITATION**. The original submitter will apply the invited form's actual wording and limits to this same substantive narrative. The requested award, work packages and applicant remain unchanged.

## 10. Open the existing work

This page contains the substantive application. The following materials let an engineer inspect the demonstrated product and retain the original source.

### Watch the product and team

The 3-minute-32-second film follows the HPD MySQL query, saved terms, one 0.005 testnet XLM purchase, full 100-row/14-column output, JSON download and reopening with signing disconnected. Its editable companion contains eleven clips, captions, script, query result and rendering tools.

[Watch the product/team film](https://github.com/woahwhattheheck/public-commons-sprint-2026/releases/download/scf-presentation-20261011/stellar-forge-scf46-presentation.mp4) · [Download the editable film companion](https://github.com/woahwhattheheck/public-commons-sprint-2026/releases/download/scf-presentation-20261011/Stellar-Forge-SCF-Presentation-Editable-Companion-20261011.zip)

### Reopen the retained purchase

Use the maintained runtime installation with native Stellar packages, the MCP feature and operator support. Retain the selected source archive, complete lock and READY installation. In Applications choose **Grant purchase reviewer**, select that runtime and a private workbench directory, then use **Review → Save → Connect → Start → Open**. Leaving Packet and SHA-256 empty selects the bundled original purchase; an existing exported packet uses its exact digest. The installed command is:

~~~sh
starforge grant-demo workbench --dir /srv/starforge/state/grant-review --port 0
~~~

The full original guide covers private parent ownership, instance access, both retained quotes, complete results, closed Buyer export and receiving. This route reopens retained work; opening the page itself does not launch an application.

[Grant reviewer operating guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/03a93f7c59a703ebc63416ae0e914f07099fef37/products/grant-reviewer/OPERATING.md) · [Runtime installation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/03a93f7c59a703ebc63416ae0e914f07099fef37/stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md)

### Read and reuse the economic briefing

Download the complete 15-file economic package and open its offline report. Its source/review/CSV/JSON and receiving guide travel together.

[Economic briefing package](https://github.com/woahwhattheheck/public-commons-sprint-2026/raw/655e527e30fd72ae877d3b11390378a6168ca7e4/stellar-forge/developer-site/dist/examples/fred-briefing-20261012/stellar-forge-economic-briefing-20261012.zip) · [Economic report opening and receiving guide](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/655e527e30fd72ae877d3b11390378a6168ca7e4/stellar-forge/developer-site/dist/examples/fred-briefing-20261012/START_HERE.md)

### Continue from the original source

[Complete merchant development guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/03a93f7c59a703ebc63416ae0e914f07099fef37/products/merchant-workspace/DEVELOPMENT.md) · [Merchant operating guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/03a93f7c59a703ebc63416ae0e914f07099fef37/products/merchant-workspace/OPERATING.md) · [Original six-package scenario](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/2761cc9a44d511959e224dc7ee5998aa13df7e8e/stellar/scf_2026/sf47_budget_model/sf10_current_candidate.json)

### Issuer references

[SCF #46 dates](https://communityfund.stellar.org/awards/recxrSMYwAl8vcglg) · [Submission criteria](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/submission-criteria) · [Budget and deliverable guidance](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines)

Application evidence edition: October 12, 2026. The dated development baseline, prospective milestones and conditional forecasts retain their stated scope.
