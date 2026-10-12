# Customer commissioning for the A2A analytical product

**Status: proposed customer work specification, 12 October 2026.** This document resolves the activity cadence for the existing grant's day-150 target. It does not identify a commissioned buyer, authorize a payment, or record a completed purchase. Its machine-readable companion is [a2a-customer-commissioning.json](a2a-customer-commissioning.json). The two files describe the same thirty jobs.

The current application requests **$38,000 equivalent paid in XLM, 400 hours at a planning rate of $95/hour, over 150 days from actual award acceptance**. Its day-150 activity target is at least thirty useful purchases across two independent buyers during fourteen consecutive calendar days; both merchant installations receive independent buyer use, and both buyers return on another day. This appendix preserves those figures, the original baseline, and the other milestones. [Selected grant source index](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/6ccf9f01147418338a0fee51b38b160fdcbacc5f/stellar-forge/developer-site/dist/grant-data/source-index.json).

## An achievable calendar requires additional useful work

With an ordinary Monday–Friday calendar and no holidays, fourteen calendar days contain ten business days. One purchase from each of two buyers on each business day produces twenty purchases. Reaching thirty under that assumption requires ten additional useful purchases.

This proposed schedule gives each buyer **ten distinct source-period extracts plus five separate reconciliation or reporting jobs**. There are three planned purchases on each of ten business days, fifteen per buyer. Source-query merchant M1 serves both buyers for twenty extracts. Comparison/report merchant M2 serves both buyers for ten additional jobs. The distribution is 20/10 across merchants; the grant does not require equal purchase totals at each installation.

Every extra job must have its own customer decision, selected inputs, complete output and accountable receiving person. Repeating an already received query, splitting its CSV/JSONL/SQLite formats into separate purchases, or buying an unnecessary report does not establish a new useful job. If a proposed task is unnecessary, the customer and current application owner must choose an actually useful schedule or acknowledge that this illustration does not satisfy the target. The [original commissioning and economics brief](https://tokenjunkielabs.slack.com/docs/T0BRETUB5TK/F0C8G8A9B7V) gives the same cadence issue and calls for an actual two-week operating calendar.

Before the window begins, replace the relative days below with the customers' actual UTC dates, holidays, source periods and receiving availability. A Monday start is an illustration, not a condition imposed on customers. The first seven-day testnet milestone needs its own approved ten-purchase calendar and separate native settlement records; these planned mainnet jobs do not count retrospectively toward it.

## Customer and merchant responsibilities

| Plan label | Prospective role | Selection needed before commissioning |
| --- | --- | --- |
| Buyer A | An operational monitoring customer that needs complete period extracts and actionable source-change reviews | Independent organization; actual buyer and receiving people; approved asset population; source licenses; workorder; price and payment authority |
| Buyer B | An independent analytical customer that needs complete portfolio data and scheduled publications | Separate organization; actual buyer and receiving people; approved portfolio and cohorts; client decision periods; source licenses; workorder; price and payment authority |
| Merchant M1 | A source-query merchant exposing reviewed analytical procedures | Actual independent operator and installation; approved saved queries/views; source custody; service URL; asset, signer and settlement recipient |
| Merchant M2 | A comparison/report merchant exposing reviewed reconciliation queries and publications | Actual independent operator and installation; permitted source transfer; saved comparison queries and reports; source/input editions; service URL; payment configuration |

These roles are prospective. Two actor accounts created by the development team do not establish two independent customer buyers, and two local copies of a development service do not establish the two independent merchant installations. The customer workorder records those facts and the actual operating people. Authority remains with the existing buyer approval and merchant payment paths described in the [merchant operator guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/9106f038471ba9435f9600ccf5a090d97b6c84f4/stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/OPERATOR.md).

## Fourteen-day activity plan

Each row with work contains two primary extracts and one separate customer decision task. No purchase is scheduled on the four illustrated weekend days. Receiving and reconciliation may continue then if the actual customer calendar supports it; the original records retain their real timestamps.

| Calendar day | Illustrative weekday | Planned jobs | Planned purchases |
| --- | --- | --- | --- |
| 1 | Monday | A-Q01, B-Q01, A-C01 | 3 |
| 2 | Tuesday | A-Q02, B-Q02, B-R02 | 3 |
| 3 | Wednesday | A-Q03, B-Q03, A-C03 | 3 |
| 4 | Thursday | A-Q04, B-Q04, B-R04 | 3 |
| 5 | Friday | A-Q05, B-Q05, A-C05 | 3 |
| 6 | Saturday | No purchase scheduled | 0 |
| 7 | Sunday | No purchase scheduled | 0 |
| 8 | Monday | A-Q06, B-Q06, B-R06 | 3 |
| 9 | Tuesday | A-Q07, B-Q07, A-C07 | 3 |
| 10 | Wednesday | A-Q08, B-Q08, B-R08 | 3 |
| 11 | Thursday | A-Q09, B-Q09, A-C09 | 3 |
| 12 | Friday | A-Q10, B-Q10, B-R10 | 3 |
| 13 | Saturday | No purchase scheduled | 0 |
| 14 | Sunday | No purchase scheduled | 0 |

**Totals:** 30 jobs, 30 planned priced task requests and 30 planned purchases. These are planning quantities. The native service's actual pricing contract and resulting settlements must be recorded separately. An ancillary task, transport retry, several output parts or a reconnect is not automatically another purchase.

## Complete job register

P01–P10 mean ten distinct customer-selected source periods. P00 is an already available, licensed baseline needed for the first comparison. Before approving any job, record each period's exact UTC boundaries and immutable source edition/hash. The two buyers select their own populations; using the same period label does not imply the same customer dataset.

For every primary A-Q job, Buyer A receives all observations for its approved asset population in the selected period, including original identifiers, nulls and source-native status. Its operational data owner accepts the result for updating the operating record. For every primary B-Q job, Buyer B receives all observations for its separately approved portfolio in that period. Its analytical data owner accepts the result for the scheduled customer analysis.

The machine-readable register contains the complete purpose, selection, source periods, output contract and receiving role for every job. Procedure IDs, view IDs, exact parameter text, prices, customer identities and actual results are deliberately unfilled until selected by the customer through the existing application.

| Job | Calendar / business day | Buyer / merchant | Required customer job | Selected periods | Complete output |
| --- | --- | --- | --- | --- | --- |
| A-Q01 | 1 / 1 | A / M1 | Operational observation extract P01 | P01 | Complete query |
| B-Q01 | 1 / 1 | B / M1 | Independent portfolio extract P01 | P01 | Complete query |
| A-C01 | 1 / 1 | A / M2 | New and missing observation coverage | P00, P01 | Complete query |
| A-Q02 | 2 / 2 | A / M1 | Operational observation extract P02 | P02 | Complete query |
| B-Q02 | 2 / 2 | B / M1 | Independent portfolio extract P02 | P02 | Complete query |
| B-R02 | 2 / 2 | B / M2 | First two-period client brief | P01, P02 | Complete report |
| A-Q03 | 3 / 3 | A / M1 | Operational observation extract P03 | P03 | Complete query |
| B-Q03 | 3 / 3 | B / M1 | Independent portfolio extract P03 | P03 | Complete query |
| A-C03 | 3 / 3 | A / M2 | Late and corrected observation review | P02, P03 | Complete query |
| A-Q04 | 4 / 4 | A / M1 | Operational observation extract P04 | P04 | Complete query |
| B-Q04 | 4 / 4 | B / M1 | Independent portfolio extract P04 | P04 | Complete query |
| B-R04 | 4 / 4 | B / M2 | Source-quality report for the next two periods | P03, P04 | Complete report |
| A-Q05 | 5 / 5 | A / M1 | Operational observation extract P05 | P05 | Complete query |
| B-Q05 | 5 / 5 | B / M1 | Independent portfolio extract P05 | P05 | Complete query |
| A-C05 | 5 / 5 | A / M2 | Monitored asset coverage change review | P04, P05 | Complete query |
| A-Q06 | 8 / 6 | A / M1 | Operational observation extract P06 | P06 | Complete query |
| B-Q06 | 8 / 6 | B / M1 | Independent portfolio extract P06 | P06 | Complete query |
| B-R06 | 8 / 6 | B / M2 | First workweek publication | P01, P02, P03, P04, P05 | Complete report |
| A-Q07 | 9 / 7 | A / M1 | Operational observation extract P07 | P07 | Complete query |
| B-Q07 | 9 / 7 | B / M1 | Independent portfolio extract P07 | P07 | Complete query |
| A-C07 | 9 / 7 | A / M2 | Metadata and quality-status change review | P06, P07 | Complete query |
| A-Q08 | 10 / 8 | A / M1 | Operational observation extract P08 | P08 | Complete query |
| B-Q08 | 10 / 8 | B / M1 | Independent portfolio extract P08 | P08 | Complete query |
| B-R08 | 10 / 8 | B / M2 | Selected site-cohort comparison report | P06, P07, P08 | Complete report |
| A-Q09 | 11 / 9 | A / M1 | Operational observation extract P09 | P09 | Complete query |
| B-Q09 | 11 / 9 | B / M1 | Independent portfolio extract P09 | P09 | Complete query |
| A-C09 | 11 / 9 | A / M2 | Correction decision register | P08, P09 | Complete query |
| A-Q10 | 12 / 10 | A / M1 | Operational observation extract P10 | P10 | Complete query |
| B-Q10 | 12 / 10 | B / M1 | Independent portfolio extract P10 | P10 | Complete query |
| B-R10 | 12 / 10 | B / M2 | Two-workweek customer report | P01, P02, P03, P04, P05, P06, P07, P08, P09, P10 | Complete report |

### The ten additional decision tasks

| Job | Decision supported | Required receiving input |
| --- | --- | --- |
| A-C01 | Which monitored assets need a source follow-up after the first period? | Every added/missing observation key between P00 and P01, both original editions, and the approved asset population |
| A-C03 | Does the operational record need correction for late or changed observations? | All late arrivals and changed values for P02/P03, with original and current values |
| A-C05 | Which assets have newly lost or gained source coverage? | Complete asset-level coverage changes for P04/P05 and the exact population |
| A-C07 | Do metadata, unit or source quality-status changes affect combining periods? | Every changed approved metadata/status field and affected observation key for P06/P07 |
| A-C09 | Which changed records need an accept, retain or follow-up decision? | Complete correction-decision input for P08/P09; the customer retains its own decisions |
| B-R02 | What does the first two-period client brief need to say? | The complete approved report and all supporting tables for P01/P02 |
| B-R04 | Is the next two-period source sufficiently understood for the customer's analysis? | Full coverage/missing-value publication for P03/P04, with original limitations and tables |
| B-R06 | What is the completed first-workweek position? | The complete five-period publication, supporting tables and exact source inventory |
| B-R08 | How do the two customer-approved site cohorts compare? | The complete selected-cohort publication for P06–P08 and exact cohort membership |
| B-R10 | What is the position for the scheduled two-workweek customer decision? | The complete ten-period publication, all tables, original report definition and source editions |

These are requirements for customer adaptation. The released native service runs reviewed saved queries and reports selected from the original AnalysisWorkspace. It does not infer the customer's comparison rules or execute arbitrary SQL supplied by an external agent. The existing demonstration's parameter-boundary query is a receiving exercise, not an additional useful customer purchase. The retained 28-response/660-row Hamburg population is a reference input and must not be relabeled as thirty new customer tasks. [Original service interface](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/9106f038471ba9435f9600ccf5a090d97b6c84f4/stellar-forge/a2a-analysis-agent/README.md), [original reference setup](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/9106f038471ba9435f9600ccf5a090d97b6c84f4/stellar-forge/a2a-analysis-agent/commission-workspace.py).

## Output acceptance and payment evidence

| Contract | Complete required output | Acceptance |
| --- | --- | --- |
| Complete query | Full original CSV, JSONL and SQLite export; original query manifest; analysis-record.json; every advertised original output part | Reopen all files, verify their SHA-256/bytes, original output positions, source/view/population, query parameters and native job/workspace identity |
| Complete report | Full original JSON and HTML report; complete CSV ZIP; original publication/report record; analysis-record.json; every advertised original output part | Reopen the full publication and supporting tables, verify input editions, report definition and artifact identities, then retain the named receiver's decision |

These are the released product's existing complete-output and receiving contracts. Customer-specific report or comparison definitions remain work to be commissioned. [Installed receiving guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/9106f038471ba9435f9600ccf5a090d97b6c84f4/products/a2a-analysis/RECEIVING.md), [service source](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/9106f038471ba9435f9600ccf5a090d97b6c84f4/stellar-forge/a2a-analysis-agent/README.md).

For each actual job, retain one joined record containing the customer workorder and purpose; buyer and merchant installation; source editions and period boundaries; approved procedure/view and unchanged parameter text; quoted price and original approval; original request and A2A task IDs; actual native settlement ID/network/state/amount/asset with fees separate; every complete output's filename, byte count and SHA-256; original SF82 release/edition; and receiver identity, decision and timestamp. The JSON companion supplies the complete record template.

Count **useful customer jobs, priced requests, native settlements and completed received tasks separately**. A settled request with a missing or rejected output remains visible as that actual state. An output without an established settlement does not become a paid purchase by inference. Original request replay, A2A resubscription, resumed work and the several file formats for one result stay bound to the same job. Unknown payment outcomes follow the original reconciliation path and keep the same request; they do not authorize a second purchase. The application owner evaluates the actual milestone record against the grant's requirements.

## Remaining adaptation within the existing funded packages

This appendix adds no hours, price or delivery days. The current funded packages already sum to 400 hours and $38,000. Assign each real adaptation once to its funded package or its separately commissioned workorder. Record completed reusable source as the selected starting component; do not describe it as future source creation. [Current grant allocation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/6ccf9f01147418338a0fee51b38b160fdcbacc5f/stellar-forge/developer-site/dist/grant-data/source-index.json).

| Existing package | Hours / USD | Specific remaining customer work |
| --- | --- | --- |
| T1-resource | 80 / 7,600 | Bind the actual merchant resources, licensed populations, saved queries/reports and complete output contracts; record selected reusable source |
| T1-handover | 40 / 3,800 | Name customer/merchant/receiving operators and configure original approval, signer, source-license and handover responsibilities |
| T2-provider | 70 / 6,650 | Deploy the actual customer provider/ledger configuration and execute the separate real testnet calendar |
| T2-threat | 50 / 4,750 | Exercise deployment-specific denial, disconnect and uncertain-payment recovery with original request identities |
| T3-mainnet | 90 / 8,550 | Commission the customer-approved mainnet calendar and receive the original useful jobs across both independent buyers/installations |
| T3-recovery | 70 / 6,650 | Have the receiving engineer restore the complete package, reopen results, reconcile outcomes and accept operating ownership |

The workshare delivers an approved source/procedure register, actual operating calendar, authority/installation map, complete output acceptance rules, joined per-job outcome records and the final receiving handover. The existing [delivery-plan integration](grant-delivery-plan.mjs) continues to govern the broader grant packages and operating responsibilities; this appendix supplies the concrete customer cadence and job definitions within it.

## Integration into the maintained grant reader

The current manuscript owner can insert the supplied H3 text under the existing **A2A analytical services: complete agent work, merchant delivery and customer receiving** H2. Keep its existing engineering/status paragraphs and all other chapters. The original `grant-customers.mjs` selects that section; `grant-a2a.mjs` adds only its exact selected source references and measured file identities. The original composer records the helper's Git identity and generates its normal reader/source-index output.

The machine-readable calendar is a prospective work specification, not a scheduler, payment sender, customer result database or replacement for the original operation. The live joint A2A reference programme keeps its own source, controller, requests and native outcomes. No runtime outcome, independent adoption, award, income or settlement is established by publishing this appendix.
