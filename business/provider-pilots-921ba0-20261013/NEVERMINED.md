# Nevermined API provider onboarding pilot

**Proposed implementation fee: USD 3,000. Delivery: 24 engineering hours over five business days from an agreed start and receipt of the selected integration inputs.**

## Useful customer result

A customer buys or tops up access to one API through the provider's existing Nevermined purchase flow, receives the original usable key or entitlement, completes one agreed API operation, and reopens the complete output and original purchase record. If the response is interrupted, the operator can continue that same recorded purchase and fulfillment.

The proposed buyer is Nevermined's API provider onboarding or solutions team, or one provider it selects for the pilot. Nevermined's published API-provider guide is the qualification evidence: it describes both purchasing a provider key and metering API calls through the facilitator. The proposed pilot selects **one purchase-key/top-up flow**. A provider's underlying API continues to meter that key using its existing service.

## The integration we would deliver

We would add a maintained customer recipe and provider adapter around the selected provider's original key-provisioning or top-up function. The recipe retains the selected plan, reviewed request, original operation identifier, returned key reference and settlement response in the provider's existing private store. It uses Nevermined's maintained SDK for the selected environment and payment scheme.

The workflow is:

1. Freeze one customer purchase intent and its plan, amount rule, endpoint and allowed fulfillment before dispatch.
2. Verify the original payment permission through the SDK. The displayed state distinguishes verified permission from a returned successful settlement.
3. Call the provider's original key-provisioning or top-up action and retain its native identifier and result under that same purchase intent.
4. Settle through the original facilitator, retaining the full returned response and its native charge reference.
5. Deliver the original key through the provider's private customer channel, run one agreed useful API request, and receive the complete response.
6. Export the customer output, source/selection references, operation history and readable handover. Reopen those complete output files after the active caller has closed.

The detailed ordering in steps 3–4 will follow the selected provider's existing provisioning and settlement contract. The kickoff records its actual idempotency and lookup facilities. A lost result remains attached to the original native operation. An ambiguous payment or provisioning outcome is reconciled through that provider's existing records or operator review before another charge or provisioning action is permitted.

The included source artifact, [provider-projections.mjs](provider-projections.mjs), demonstrates one billing boundary that the customer view will preserve: a successful PAYG settlement may report zero credits. The view therefore retains `billingModel`, `orderTx` or `transaction`, and credit movement separately. It leaves a USD amount unresolved until the original plan and charge record supply one.

## Source and authority

The implementation will compose the existing TJLabs [Buyer Dataset session](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/dataset-session.mjs), [Dataset delivery](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/dataset-delivery.mjs) and [API customer workspace](../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-access/workspace/application.mjs) where their selected contracts apply. Their roles are retained requests, original operation continuation and complete file receiving.

Nevermined owns the payment protocol and facilitator. The API provider owns its key store, underlying usage enforcement and commercial terms. A `nvm:card-delegation` pilot uses the Nevermined SDK and selected card-delegation environment. A Stellar settlement integration would be a separately selected supported payment path; it is not assumed by this scope.

The implementation binds deduplication to the purchase-key flow and the original purchase intent. A customer's reusable API credential remains able to make its legitimate later API calls.

## Five-day implementation plan

| Work package | Hours | Delivered result |
|---|---:|---|
| Select plan, SDK environment, one provider action and example operation | 4 | Reproducible configuration and actual native authority/recovery map |
| Compose purchase-key/top-up and original customer request | 8 | Installed recipe using the selected existing provider and SDK |
| Continue interrupted provisioning, settlement and response | 4 | Same-operation recovery with exact native return and clear unresolved state |
| Receive full output and portable handover | 4 | Complete selected files, hashes, operator guide and cold reopen |
| Joint acceptance and one correction pass | 4 | Demonstrated agreed cases and final maintained source |
| **Total** | **24** | **One complete provider/customer pilot** |

Day 1 selects the provider and freezes the acceptance example. Days 2–3 implement and exercise the selected native actions. Day 4 completes recovery, receiving and handover. Day 5 is the joint acceptance and correction pass. The engineering allocation is assigned to this commercial engagement; the start is scheduled against named available delivery capacity.

## Acceptance

The provider and TJLabs will review the following in the selected sandbox or explicitly approved funded environment:

- One original purchase or top-up yields the intended usable key/entitlement and one complete agreed API output.
- Reopening a completed local purchase returns its retained result without a second native provisioning or settlement invocation.
- An interruption keeps the exact original request and returned native identifiers. The continuation uses actual provider evidence before advancing.
- A PAYG response with zero credits remains a PAYG response. A credit response retains its credit quantities. Neither view invents a USD amount from credit units.
- The agreed output includes every expected member and can be received and reopened from its published manifest after the donor caller closes.
- Source, configuration recipe, installation/opening commands and ownership of any remaining unresolved native action are handed to the provider.

The sample data supplied in this repository are authored examples for source review. A provider-backed acceptance run is part of the proposed engagement.

## Inputs, costs and delivery terms

Required inputs are one selected provider and plan, its maintained SDK/environment, a sandbox key-provisioning or top-up interface, its original lookup/idempotency contract, a non-sensitive useful API example, and a named technical reviewer. Credentials are supplied through the provider's existing private channel and referenced by environment or store name in the handover.

The customer supplies hosting, underlying API service access, any third-party subscription, test or production payment principal, and payment/network fees. The implementation fee covers the work above. Ongoing hosting, paid service operations, extra endpoints and continuing support are separately priced if requested.

Proposed payment is **USD 1,500 at kickoff and USD 1,500 on acceptance**, with invoices due in seven calendar days. The work starts in an agreed delivery slot after the selected inputs and kickoff payment are available. Applicable taxes are additional. These are proposed commercial terms for agreement.

## Official source basis

- [API provider use case](https://nevermined.ai/use-cases/api-providers/) — existing provider onboarding and key-purchase integration.
- [API provider implementation guide](https://nevermined.ai/docs/solutions/api-providers) — SDK verification/settlement, PAYG and credits, provisioning and top-up.
- [Settle-permission reference](https://nevermined.ai/docs/api-reference/x402/settle-permission) — original response fields and native settlement call.
- [Card-delegation specification](https://nevermined.ai/docs/specs/x402-card-delegation) — facilitator, permission and settlement authority.
- [Published contact](https://nevermined.ai/contact-us/) — contact@nevermined.ai.

Sources were read on October 12–13, 2026. The SDK and selected provider environment are pinned again during implementation.
