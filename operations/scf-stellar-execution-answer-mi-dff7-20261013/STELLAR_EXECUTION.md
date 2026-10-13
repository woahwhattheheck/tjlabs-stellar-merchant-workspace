# Self-contained Stellar execution contribution

## Full answer insertion

### From the approved request to Stellar settlement

The funded x402 Exact integration uses an existing SEP-41 token contract on the selected Stellar network. Its on-chain operation transfers the agreed atomic token amount from the buyer to the merchant. The customer query, source files, full response and editable report stay in the operators' applications. The token transfer's Soroban authorization covers the contract call, payer, recipient, amount and expiry. The saved HTTP request and delivered result are bound by the application records; the transfer authorization does not itself sign arbitrary request headers, prove a report's contents or make delivery atomic with payment.

The existing buyer first sends the intended HTTP request without payment. A `402` challenge supplies the actual resource and payment alternatives in `PAYMENT-REQUIRED`. Before signing, the buyer matches one alternative against its independently configured network, token contract, recipient, atomic spending cap and selected payment timing. Its approval retains the complete accepted terms, request URL/method and body presence, length and SHA-256. The original spend governor reserves that approved operation before the native signer runs. Payer and RPC configuration come from the buyer's host; an advertised offer cannot replace them.

The native signer uses the pinned original x402 Stellar SDK to create and simulate the transfer and sign its required Soroban authorization. It returns the complete SDK envelope to the existing buyer transport, which sends the same request once with `PAYMENT-SIGNATURE`. The signer adapter does not submit a separate transfer. The selected facilitator verifies the native payload, signed authorization and merchant payment policy, then uses its configured fee-paying account to submit through the original SDK. Token principal and transaction fees retain separate units and limits.

The merchant and buyer must agree the offered timing before that approval:

|Selected timing|Order in the original merchant|Failure and continuation|
| --- | --- | --- |
|Authorization|Verify the authorization, prepare the complete permitted application result, settle, then release the result.|A handler failure before settlement invokes the original cancellation path. That cleanup is not a refund. If settlement or delivery becomes uncertain, the original payment is reconciled before another financial action.|
|Upfront|Settle before beginning fulfillment, then deliver the finite response or stream under the selected limits.|An interrupted or failed handler can leave a successful transfer and incomplete output. Keep the payment and received bytes, and continue that original entitlement or delivery operation. Any commercial refund is a separate authorized accounting action.|

A `PAYMENT-RESPONSE` header is the seller's reported settlement result. The independent observer checks its configured RPC's network, the transaction's successful status and ledger, and exactly one decoded token-transfer event matching the approved contract, trusted payer, merchant recipient and atomic amount. An unavailable, incomplete or contradictory observation leaves that original payment unresolved. The observer does not sign, repay or release the buyer's reservation.

Completion then joins two separate results: the reconciled native transfer and the customer's accepted full output. Every agreed page or file remains part of that task. The same original intent, reservation, transaction and delivery records govern interrupted-response recovery; a fresh operation is not substituted merely because a response was lost. T1 commissions this complete path for each selected service, T2 adapts the same service to its second independent facilitator and operates the two recovery cases, and T3 deploys the reviewed mainnet configuration within the existing package amounts.

Maintained implementation: [buyer transport](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/c414ab5863084af80c1af0a05b6ad008b24724a5/stellar/scf-starforge-20261009/sf31-buyer-client/buyer.mjs), [native signer adapter](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/c414ab5863084af80c1af0a05b6ad008b24724a5/stellar/scf-starforge-20261009/sf103-native-buyer-signer/adapter.mjs), [merchant resource dispatcher](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/c414ab5863084af80c1af0a05b6ad008b24724a5/stellar/scf-starforge-20261009/sf30-seller-sdk/resource-server.mjs) and [independent transfer reconciliation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/c414ab5863084af80c1af0a05b6ad008b24724a5/stellar/scf-starforge-20261009/sf86-rpc-transfer-reconcile/README.md).

## Concise answer insertion

### Concrete Stellar execution

For the funded x402 Exact path, an existing SEP-41 token contract transfers the selected atomic amount from buyer to merchant. The customer query, source and report remain in their applications. Soroban authorization covers the token call, parties, amount and expiry; the application separately binds the approved HTTP request and complete output to the original operation.

The buyer receives the actual `402 / PAYMENT-REQUIRED` challenge, matches one option to its configured network, asset, recipient, cap and timing, and reserves the approved URL/method/body and full terms before signing. Its original Stellar SDK creates and simulates the transfer and signs the required authorization. The buyer sends the complete envelope once in `PAYMENT-SIGNATURE`; the selected facilitator verifies and submits it with its configured fee account. Principal and fees remain distinct.

With authorization timing, the merchant verifies, prepares the result, settles and releases it. With explicitly selected upfront timing, settlement precedes fulfillment. Failed delivery can therefore leave a successful payment and unfinished customer work. The original payment and delivery records drive recovery; a failure-path cancellation is not a refund.

The seller's `PAYMENT-RESPONSE` is checked separately against the configured RPC network, successful transaction and exactly one matching token-transfer event. Uncertain observations preserve the original unresolved operation. Completion requires both that reconciled transfer and all accepted pages/files. T1 commissions this path, T2 adapts the same service to the second facilitator and operates recovery, and T3 deploys its reviewed mainnet configuration within the unchanged six packages.
