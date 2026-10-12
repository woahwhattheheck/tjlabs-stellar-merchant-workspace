# Customer deployment and acceptance

This operating appendix connects the existing Merchant Workspace to the six prospective SCF delivery packages. It is a proposed acceptance procedure for the selected customer installations. Its starting point is the complete current application at PR383, the merged customer-launch work, and the original buyer, signer, incident and recovery implementations identified below. Customer selection, commissioning agreements, funded independent purchases and mainnet acceptance retain their own actual records.

Use it with [Customer launch](CUSTOMER_LAUNCH.md) and the [development scope](DEVELOPMENT.md). Keep one original workorder and its receiving operation. Record the installation’s actual decisions in that workorder, then use the existing product interfaces and saved requests to perform the work.

## 1. Select the useful customer operation

The commissioning payer, resource merchant, independent buyer and receiving engineer may belong to different organizations. Name their responsibilities before choosing an endpoint. The merchant authorizes the resource, publication and terms. The buyer approves its request, wallet authority and spending. The receiving engineer decides whether the agreed output opens and works in the customer’s application. The commissioning payer accepts the scoped engineering delivery and its commercial invoice.

Describe the task in customer terms: the complete reviewed filing comparison, every selected page of an acquisition, a reporting period, a model-input file, or a native application action. Specify the output population and period, required files, field meanings and the receiving application. A query deliberately limited to 100 rows can be complete for that selected query while its retained truncation flag still reports that the upstream population is larger. A response’s byte count alone cannot establish that the selected task is complete.

The workorder records the original source, authorized access and rights, snapshot or live-query basis, keys, types, missing/null rules, units, time basis, sorting and page boundaries. Identify required downstream effects, such as an order acknowledgment, invoice allocation or external document return. Their outcomes remain visible even when payment and file delivery have already completed. The existing [customer-launch contribution](../../operations/scf-customer-launch-05c7-20261012/application-contribution.json) supplies the commissioning and measurement definitions.

Choose a real reason for another purchase: a later period, a changed source edition or a different customer request. Reopening an already acquired report and resuming its interrupted download continue the same original work. This distinction makes recurring use meaningful and gives the engineer a concrete acceptance task.

## 2. Keep each authority with its original owner

| Decision | Accountable owner | Retained selection |
| --- | --- | --- |
| Source access, release and withdrawal | Resource merchant and source owner | Authorized source, edition or live query, publication and changed terms |
| Customer implementation and acceptance | Commissioning payer and receiving engineer | Scope, complete useful output, host, receiving application, corrections and acceptance |
| Request and spending | Independent buyer | Endpoint/method or MCP tool/arguments, selected source, body identity, price option and aggregate reservation |
| Token authorization | Buyer’s selected signer and native SDK | Payer, recipient, asset, atomic amount, authorization lifetime and selected payment flow |
| Verification and settlement | Selected facilitator and Stellar network | Native response and independently reconciled transfer under the chosen network and fee policy |
| Delivery and required fulfillment | Merchant service and original downstream owner | Complete result, delivery state, order/accounting result and acknowledgment |
| Incidents and restoration | Named primary/backup responders and receiving engineer | Original incident revision, permitted response, acknowledgment, restored generation and post-backup reconciliation |

These responsibilities compose into one customer operation. They do not collapse into a single “paid” flag. A facilitator response, a ledger observation, a complete downloaded file and a customer acceptance are separate records. Retain their actual identities and times, including contradictions and incomplete stages.

The original [buyer](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/32fe7d732741ba10900c28800e4efb6b8944192d/stellar/scf-starforge-20261009/sf31-buyer-client/buyer.mjs) freezes the request and selected full payment requirement before approval. Its saved intent includes the URL/method, network, asset, recipient, atomic amount, limits, accepted terms and request-body identity. The selected [native signer](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/32fe7d732741ba10900c28800e4efb6b8944192d/stellar/scf-starforge-20261009/sf103-native-buyer-signer/adapter.mjs) checks that original operation before invoking the official SDK. The native token-transfer authorization and this application-level binding have different jobs; both are required.

## 3. Receive the selected runtime and payment profile

Record the exact released source, source manifest, installed runtime/profile and SDK versions used by the service and buyer. Run the original installation inspection and retain its complete returned selection. Import and reopen the actual customer workspaces through that selected installation. A source-only package or successful syntax parse establishes source readiness; it does not establish an installed customer service.

The reviewed native signer pins `@x402/core` and `@x402/stellar` to version 2.28.0. It accepts the selected native networks and flows, checks the original payment terms, and requires the offered sponsored-fee condition. Treat that as a property of the selected implementation. A different SDK, facilitator offer or fee arrangement requires its own supported compatibility selection and original receiving. Do not silently relax that check to make a provider appear compatible.

For each facilitator, retain the actual endpoint, registration, payment scheme, network, supported asset, recipient, atomic price, authorization timeout and fee policy. Check that the service’s resource identity and the buyer’s selected requirement remain aligned. Discovery results are useful inputs to selection; the receiving record establishes which actual provider profile operated the customer task.

T2 requires the same useful service through two independently operated **testnet** facilitators. Preserve the service, selected source, expected customer output and buyer authority while reviewing each provider’s actual payment requirements. T3 requires both merchant installations on **mainnet** under their own received profiles. The selected scope does not introduce an additional two-mainnet-facilitator obligation.

Current [Stellar x402 documentation](https://developers.stellar.org/docs/build/agentic-payments/x402) describes the native authorization-entry flow and provider-dependent support. The existing MPP Charge workbench retains its separate protocol and request state; an MPP session or channel is not implied by receiving a Charge operation.

## 4. Define completion before spending

Use the existing buyer’s unsigned discovery and challenge flow. Review the actual resource, request schema, full price option, network, token, recipient and lifetime. For a paginated task, retain its parent acquisition and the aggregate spending reservation as well as each priced child request. A new body, new selection or new purchase returns to the original approval step.

The acceptance record joins these observations:

| Observation | What it establishes | What remains to be established |
| --- | --- | --- |
| Approved request | The buyer selected this operation and these terms | Actual dispatch, native transfer and delivery |
| Signed dispatch | This selected request was sent | Its financial outcome if transport fails |
| Merchant/facilitator response | The service reported the recorded state | Independent transfer reconciliation and complete output |
| Independently observed transfer | The selected network recorded the matching native transaction and amounts | Delivery, required fulfillment and receiving |
| Complete acquired output | All selected result bytes/pages are retained and verified | Customer application use and any required downstream effect |
| Fulfillment return | The selected order or accounting action produced its recorded result | Receiving engineer’s review of the whole task |
| Accepted handover | The named receiving engineer accepted the scoped outcome | Later support, renewed source editions and future purchases |

The original buyer classifies a lost signed response as `PAYMENT_OUTCOME_UNKNOWN` with payment sent. Preserve that dispatch and reconcile it. It sends neither a replacement signature nor a new purchase merely because the transport failed. Its reported settlement header state is also retained as a report, not substituted for the independent ledger observation.

The receiver checks the complete original file or page set against the selected output contract, including hashes, names, types and coverage. Then it opens that result in the actual workbook, typed client, native model or application selected by the customer. Preserve scalar types, nulls, limits and truncation declarations. A convenient screen excerpt remains an excerpt of the retained complete result.

## 5. Operate the two T2 response cases

These cases belong to the existing 50-hour/$4,750 deployed-response package. Select them in the customer’s authorized receiving workorder. Use the existing incident, purchase, delivery and recovery interfaces; preserve their original IDs. Record the actual state reached at each step. The procedure below defines acceptance and does not claim that a new customer has already performed it.

### A. Settled purchase with interrupted delivery

1. Start one approved useful purchase and retain its original intent and dispatch.
2. At the selected delivery interruption, retain the merchant response, received prefix or completed files, pending coverage and original acquisition state.
3. Independently reconcile the actual native transaction under its network, asset, payer, recipient and atomic amount. Preserve an unresolved signed outcome until that evidence is available.
4. Reopen the same purchase and continue its unfinished delivery using the original retained request and download state.
5. Verify the whole agreed output, open it in the customer’s receiving application and obtain the receiving engineer’s recorded acknowledgment.
6. Compare the payment/attempt history before and after recovery. Acceptance requires that continuing this delivery created no additional payment.

Retain the interruption observation, financial reconciliation, final full files, remaining or completed coverage, response/recovery times and same-case reopen. If required fulfillment is still pending, show it separately. A duplicate payment, unexplained new intent, changed output or unresolved original financial state is a material finding, not a successful recovery.

### B. Merchant-delivery or fulfillment failure

1. Retain the affected purchase and the exact failing output or downstream step, including its original error or incomplete result.
2. Open the existing incident for that source and case. The primary or backup responder acknowledges the displayed incident revision with the original named actor and note.
3. Perform the permitted correction. Continue the same delivery or original downstream operation; a genuinely changed customer operation requires a newly reviewed selection.
4. Compare the full recovered output with the expected source, selection, coverage and hashes. Retain the actual returned order/accounting identity when fulfillment is required.
5. Record the receiver’s acknowledgment and any residual discrepancy. Drain/restart the selected installation and reopen the same case and customer result.

The original [incident-source workflow](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/03a93f7c59a703ebc63416ae0e914f07099fef37/stellar/scf-starforge-20261009/sf74-merchant-support-console/INCIDENT_SOURCES.md) binds a selected source, configuration revision and named incident actions. Its notification queue owns the original destination, retry body and provider delay. A reminder or retry uses that maintained queue state. An old saved RUNNING label is not a current liveness observation.

## 6. Make monitoring operational

For each installed threat, identify the protected record, expected behavior, observable deviation, detection source, reviewed threshold, named responder and permitted action. Integrity contradictions and configuration changes require explicit review. Age, rate and capacity rules use the installation’s actual baseline and operating expectation.

The threat model covers both native and application boundaries: changed approval or terms; wrong financial or output attribution; unauthorized access or publication; lost delivery; absent monitoring; and restoration of the wrong generation. Record gaps where the available observation cannot establish the expected property. Preserve actual monitor start/stop, rule state, incidents, notifications, acknowledgments and recovery clocks.

The official [monitoring guide](https://developers.stellar.org/docs/build/security-docs/monitoring/monitoring-template-builders) connects threat IDs to observations, rules and response owners. Apply that relationship to the selected implementation, including its off-chain service. Keep the populated operational plan, live destinations, secret references and sensitive response details in the customer’s private operating records. The public source can retain reusable rules, schemas and a safe explanation.

Measure detection, acknowledgment and recovery from their original event times. Record unavailable intervals and continuing residual findings. An observed recovery duration is an acceptance measurement for this case; a contractual service level requires a separately agreed commitment and operating coverage.

## 7. Restore the whole installation

The receiving engineer receives the selected source/runtime, workspace state, customer files, operating history and the instructions for current authorized secret references. Supply secrets through the receiving host’s original access mechanism. Public source and review exports must not contain private keys, bearer credentials or populated secret configuration.

Use the original [merchant recovery operation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/03a93f7c59a703ebc63416ae0e914f07099fef37/stellar/scf-starforge-20261009/sf101-merchant-recovery/README.md). Its complete backup has a real consistency boundary: drain the selected merchant/proxy, reconcile its outbox, close/checkpoint the applicable SQLite state and stop writers to selected catalogs. A declaration that a source is quiesced does not stop an unrelated writer.

Preserve the complete selected roots and archive identity. Authenticate and verify the entire encrypted backup before creating its new private restore destination. The receiver then reopens the installed service and customer work. Keep the original installation available under its owner’s recovery plan; receiving never overwrites an unrelated production directory.

Reconcile operations that occurred after the saved generation against the original payment, delivery and accounting owners. A backup cannot itself prove that no later payment or webhook exists. Retain original ledger/intent/outbox identities, source-generation differences and any unresolved replay. Measure the actual save time, restore time and recovery point from the received data. Finish one independent maintainer support case and retain its outcome.

## 8. Count payments, useful work and prepaid use

Keep the funded counts unchanged: ten completed purchases in total across two independent buyers during T2’s seven-day window; thirty in total across two buyers during T3’s fourteen-day window. A purchase requires its distinct approved intent, independently observed native transfer and complete purchased output.

Use the reviewed accountable operator identity from the original cohort. Record its declared buyer/merchant role, source-supported independence basis, required network and operating or handed-over state. Agents and wallets belonging to that operator do not become additional buyers. Team-operated development purchases are excluded. Facilitator independence also follows the accountable operator for the same useful service. Returning buyers use distinct intent groups on at least two UTC days. The declarations retain their source; they are not automatic corporate-independence verification.

Report associated work alongside those counts:

- A full acquisition or application job keeps one parent identity and all required child operations.
- Each new paid request keeps its own original financial intent and transaction.
- A prepaid order keeps its purchased allowance, each application request and consumed/remaining units. Spending an existing allowance is useful usage; another native payment records another purchase.
- A resumed download, retried original delivery or reopened acquired result remains attached to the original purchase and task.
- Partial, unresolved, canceled and refunded outcomes remain in the same observation window. Required fulfillment and accepted handovers remain distinct.

The completed Queens HPD task has 144 selected rows across two paid pages of 100 and 44. It therefore has two 10,000-stroop purchases and one complete customer task. The retained MariaDB query has 100 selected rows, 14 columns and 53,468 bytes, with its declared truncation indicator preserved. These examples explain the unit and completeness rules without changing either selected output.

Keep payment amounts, refunds and network fees in their original asset and atomic units, grouped by network. Use the original first-attempt and completion clocks when selecting a cohort window. A commercial valuation must retain its explicit conversion basis; do not add unlike assets or treat testnet amounts as collected implementation revenue.

## 9. Receive the six funded packages

| Package | Existing price | Deployment acceptance |
| --- | --- | --- |
| T1 resource integration | 80 hours / $7,600 | Both merchants operate the scoped native service; the buyer opens its complete output in the selected customer application. Publish the necessary reusable source/runtime and receiving improvements. |
| T1 authority and handover | 40 hours / $3,800 | Another accountable operator reopens each installation, completes the agreed change/withdrawal and preserves earlier acquired output and original terms. |
| T2 provider and ledger | 70 hours / $6,650 | Same useful service through both independent testnet facilitators; ten total qualifying purchases across the two buyers in the seven-day window. Receive each actual compatibility profile. |
| T2 deployed response | 50 hours / $4,750 | Both response cases above retain financial and delivery state, acknowledgment, full result and same-case continuation. Publish reusable monitoring/recovery corrections. |
| T3 mainnet rollout | 90 hours / $8,550 | Both mainnet installations; thirty total qualifying purchases across two buyers in fourteen days, with both returning on a distinct UTC day. |
| T3 recovery and handover | 70 hours / $6,650 | Complete off-host receiving, restore and post-backup reconciliation; measured recovery and an independently completed support case. |

The request remains $38,000, 400 prospective hours and 150 days from actual award acceptance. Delivery costs remain $11,400 / $11,400 / $15,200. The 10/20/30/40 payment schedule produces $3,800 / $7,600 / $11,400 / $15,200 and is not the cost schedule.

Assign each change once to its grant package or separately commissioned customer workorder. Existing code and completed pre-award work supply the baseline. Host charges, purchased usage, purchase principal and fees keep their original payer; the grant scope includes no purchase subsidy. The current cash study describes an uncommitted requirement, not a secured financing source.

The [submission criteria](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/submission-criteria) and [budget guidance](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines) frame the three prospective outcomes and T2 response work. The selected application remains Open Track. Follow governing [Official Rules §§5.6 and 5.8](https://stellar.gitbook.io/scf-handbook/scf-awards/official-rules-for-submissions) for actual paid-day conversion and tranche-form timing; retain any acknowledged extension in the original grant case.

## 10. Deliver a result another engineer can assess

For each selected installation, hand over the complete source/runtime selection, original workorder and customer-output definition, all required source and result files, native request/payment/ledger records, delivery/fulfillment history, incident actions, measured acceptance and complete restore result. Include the original receiving commands and current secret-reference requirements. Link these materials to the six-package acceptance record without hiding incomplete stages.

A reviewer should be able to answer: What did this buyer approve? Which native transfer was observed? Which complete customer output was acquired? What required fulfillment occurred? Which accountable operator received it? What remained unresolved? Which original request is continued after interruption?

The technical review accompanying this appendix uses the existing submission-draft and review-round models. It retains the full PR383 source, the proposed edits, every named AI editorial action, explicit carry-forward of unchanged content and independently received complete review. Human applicant review and issuer-field mapping remain separate. This does not submit the application or record a customer, human reviewer or issuer approval.

## Source and evidence scope

The current application’s register reports 18 distinct **team-operated development** purchases totaling 411,000 native testnet stroops, with fees separate. Those observations support implementation experience; they are not the future independent cohort. Current IATI/participant/financial-reconciliation source carriers and syntax results remain source-readiness evidence until their original installed receiving returns. Fiscal’s completed source/browser receiving remains distinct from its paid driver’s facilitator-readiness failure.

Source bodies reviewed for this procedure:

| Original source | Git blob |
| --- | --- |
| PR383 full application | `cd05c693938a0adcbfa1358a12bcddf061d6eaed` |
| PR383 complete product/finance companion | `d242a2f652d434daec1838421fddec80fdb68928` |
| PR383 source index | `842aaf923124226fb4b697e82e7f5dcbea39cffb` |
| Accepted customer-launch contribution | `e46f86d64e6d95ea22fbcf6bf417da87cd83cc0e` |
| Original buyer | `04de96e3445a4928d213b036bbb6c2b1c5e92077` |
| Native signer | `b2a9e3161273eecf047f05e9fa94db8ecb351896` |
| Incident-source guide | `551518546f06e886d79b342e1ad2623c46f93bff` |
| Recovery guide | `f87f74a3b35f273a0b73e3c4fa1c3558d9bfb868` |
| Original editable draft core | `947ea682c202476b2b0af372dd32ee2b8366cefa` |
| Original named review-round core | `0787c166af3365166bec2d4475d662180e109811` |

Official pages were checked on October 12, 2026. The complete review package preserves source identities and separates original observations, proposed acceptance and unresolved customer/applicant decisions. Current author edits remain subject to the original manuscript owner’s explicit selection.
