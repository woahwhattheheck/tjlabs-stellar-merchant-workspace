# Operating ROZO payments

## Bind the actual profiles

Copy an example connection file into a private directory and replace its explicit placeholders with the actual account, source and runtime selections. Keep credentials in the existing host environment. Configuration stores environment-variable names, never inline API keys or webhook secrets.

The merchant connection binds an observed appId to its API-key environment variable. Save a merchant profile with that same app ID, host alias and actual chain/network/token/precision definitions. The same ticker can identify different assets, so each definition includes the real network and token address.

Materialize original Checkout before configuring its source root:

~~~sh
starforge rozo-payments publisher \
  --publisher checkout --directory /private/rozo-source/checkout-0.1.21
~~~

This verifies all 135 publisher files and writes an immutable source binding. The profile uses type checkout-mpp-0.1.21 and a connection containing that source root. Quote, create, status and read-only resume execute the publisher's functions in an isolated child.

Common SDK uses intent-common-0.1.43. Its source root, actual compiled module, full dependency runtime and hashes must be declared. SOURCE_AND_RUNTIME.md describes its original build. Testnet reads use rozo-testnet-v1 and retain the selected actual endpoint/network.

## Start and inspect

~~~sh
starforge rozo-payments inspect --workspace /private/merchant/rozo
starforge rozo-payments state --workspace /private/merchant/rozo \
  --config /private/merchant/rozo-connections.json \
  --profile merchant --offset 0 --limit 100
starforge rozo-payments serve --workspace /private/merchant/rozo \
  --config /private/merchant/rozo-connections.json --host 127.0.0.1 --port 0 \
  --expected-workspace-id ACTUAL_WORKSPACE_ID --expected-origin-id ACTUAL_ORIGIN_ID
~~~

Use the IDs from inspection. Only one writable operator lease is held per workspace. Applications starts this same command using its reviewed source, environment and original IDs. Stop that operator before a separate CLI write against the same workspace.

The seven business views provide proper fields and selectors. History exposes full request details and source-bound recovery. Profiles, orders and decisions retain complete immutable editions.

## Exact original request

~~~json
{
  "workspaceId": "ACTUAL_WORKSPACE_ID",
  "requestId": "merchant-order:original-001",
  "expectedRevision": 3,
  "actor": "Selected operator",
  "command": "merchant.create",
  "payload": {"profileId": "merchant", "orderId": "order-001"}
}
~~~

The payload orderId selects the internal saved order record, which separately retains the provider's original order ID. Read the workspace revision before preparing new work. Keep actor, expected revision and payload unchanged while retrying a retained ID.

~~~sh
starforge rozo-payments run --workspace /private/merchant/rozo \
  --config /private/merchant/rozo-connections.json \
  --input /private/requests/original-create.json
starforge rozo-payments request --workspace /private/merchant/rozo \
  --request-id merchant-order:original-001
starforge rozo-payments resume --workspace /private/merchant/rozo \
  --config /private/merchant/rozo-connections.json \
  --request-id merchant-order:original-001
~~~

Accepted operations return schema stellar-forge.rozo-payments.v1.operation-result with original workspace/request/fingerprint/revision and complete result. Replays add reused:true. Pending external work retains its prepared intent, attempts and captures.

Before keyed create, the service looks up the exact original app/order pair. Lost create responses can be recovered through that lookup. An earlier uncertain POST followed by 404 remains pending. After operator review, explicit **resume --retry** retries the same saved request without changing its input. Provider 429 responses retain Retry-After evidence.

Checkout create never automatically repeats after a recorded native dispatch. Native recovery selects the original pending request and actual payment/invoice IDs; the publisher's returned raw invoice-status response must bind both.

The browser saves its complete IndexedDB body before dispatch. Its recovery panel compares body and server request identity before acceptance. Generic errors and later not-found reads cannot discard an earlier uncertain send. Retained server intents can also be resumed by their original request ID when browser state is unavailable.

## Orders and provider commands

| Command | Payload | Result |
| --- | --- | --- |
| profile.save | {id,label,type,connection,appId?,assets,wallet?,stellar?,notes?} | Original profile edition |
| order.save | {id,profileId,orderId,title,source,expectedDestination?,fulfilmentRef?,checkout?,notes?} | Original order edition |
| orders.import | {profileId,file,columns} | Original CSV mapping, bytes and saved order IDs |
| merchant.create | {profileId,orderId} | Original app/order lookup or keyed exactIn create |
| merchant.register | {profileId,paymentId,txHash,fromAddress} | Existing payin transaction registration |
| payment.refresh | {profileId,paymentId} | Original keyed/testnet payment response |
| payment.lookup | {profileId,txHash}, sourceTxHash/destinationTxHash, or receiverAddress+receiverMemo | Original provider lookup |
| payment.attach | {profileId,paymentId,orderId} | Explicit original payment/order link |
| checkout.quote / checkout.create | {profileId,orderId} | Original quote/invoice creation |
| checkout.status | {profileId,paymentId,linkId?,provider?} | Original invoice/payment status |
| checkout.resume | {profileId,paymentId} | Original read-only reuse/status |
| native.recover | {profileId,originalRequestId,paymentId,linkId,provider?} | Original dispatched create recovery |
| sdk.fee / sdk.create | {profileId,orderId} | Original Common getFee/createPayment |
| sdk.refresh | {profileId,paymentId} | Original Common getPayment |
| sdk.register | {profileId,paymentId,txHash,senderAddress?} | Original Common updatePaymentPayInTxHash |

The app prepares source/deposit information but has no signing or funds-send command. A registered transaction must already exist.

CSV intake retains {name,base64,bytes,sha256} for the complete original UTF-8 file. Explicitly map orderId, title, chainId, tokenSymbol and amount; fulfilmentRef is optional. Amount cells are decimal text. Duplicate original IDs or changed pre-existing bodies require review through their original records.

Checkout orders add checkout:{url,provider:"coinbase",email?,utmSource?}. Quote binds the original invoice; creation binds its selected source chain/token. Existing supported invoice/payment IDs can be inspected directly.

## Complete capture and recurring catch-up

**capture.payments** takes {id,profileId,fromDate,toDate,limit?,status?}. Page limit is at most 100. Every page, header, request, offset and original body is retained. Newest-first offset pagination is a provider traversal rather than an atomic snapshot; the capture records this boundary.

**capture.active** takes {id,profileId} and refreshes every retained payment, including failed, expired and previously terminal rows. Callback delivery does not cover every state change.

**schedule.save** takes {id,profileId,enabled,intervalSeconds,lookbackHours}. The server uses durable capture requests and the original lease. Bounds are 15–86,400 seconds and 1–8,784 lookback hours. Pause preserves identity and last request. On restart an interrupted saved request resumes before another run is prepared.

## Signed callbacks

~~~text
POST /callbacks/<profileId>
X-Rozo-Timestamp: <original milliseconds>
X-Rozo-Signature: sha256=<hex>
Content-Type: application/json
~~~

The connection supplies its UTF-8 secret from a named environment variable. Verification computes HMAC-SHA256 over timestamp, a dot and the complete raw body; tolerance is five minutes. Preserve raw body bytes through the original proxy/gateway. Callback delivery does not use the browser session header.

Exact duplicate events return their retained receipt. A changed body under the same event identity returns a conflict. An older provider timestamp does not replace later source; changed content at an equal timestamp becomes a finding. Catch-up remains necessary because the original callback contract covers selected payin/payout events and delivery can be at most once.

~~~sh
starforge rozo-payments callback --workspace /private/merchant/rozo \
  --config /private/merchant/rozo-connections.json --profile merchant \
  --file /private/callbacks/original-body.json \
  --timestamp ORIGINAL_MILLISECONDS --signature sha256=ORIGINAL_HEX
~~~

An old saved event fails the delivery-time tolerance. Its existing receipt remains the audit source; do not relabel it with an invented current timestamp.

## Corrections, fulfilment and evidence

**decision.save** takes {id,profileId,paymentId,kind,basisSha256,reason,...}. Use the current payment detail's sourceSha256. Each decision is immutable; supersedes creates a following edition.

| kind | Additional fields |
| --- | --- |
| accepted_variance | issues: exact current finding names reviewed |
| provider_review | Explained reason for source review |
| fulfilment | value:{state,reference}; state pending/delivered/failed/cancelled, actual fulfilment reference |
| reopen | supersedes: original decision being reopened |

A changed provider source makes source-bound corrections stale. Fulfilment has its own recorded reference. Raw provider bytes remain unchanged.

**evidence.link** takes {id,profileId,paymentId,observationId,side,reason} and links an original Stellar observation to the exact observed source/destination transaction. A proxy or escrow event does not itself prove destination settlement.

## Reports and original files

**report.save** takes {id,profileId,title,period:{from,to,field},notes?,supersedes?}. The period is [from,to), using provider createdAt or updatedAt. Every report freezes selected rows, asset-group integer totals, observation/capture references, capture-job context and JSON/CSV/HTML files.

Reports download those originals and compare editions. CSV guards formula-leading spreadsheet text while JSON retains original values.

~~~sh
starforge rozo-payments report --workspace /private/merchant/rozo --id settlement-2026-10
starforge rozo-payments object --workspace /private/merchant/rozo \
  --sha256 ORIGINAL_FILE_SHA256 --out /private/delivery/settlement.csv
starforge rozo-payments history --workspace /private/merchant/rozo \
  --kind order --id order-001
~~~

Object export streams ranges, verifies complete bytes/SHA-256 and refuses a different existing file. Browser downloads use short-lived original-file tickets and server streaming.

## Finish a shift or transfer custody

Stop drains original work and releases the operator lease. **Working export** creates a review copy. **Handover** pauses recurring work, drains, seals and exports as one resumable request. Keep the same request/delivery ID when packing or download is interrupted. See RECEIVING.md for the receiving contract.
