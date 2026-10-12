# MPP channel work

Operate recurring paid tasks through an existing funded Stellar channel. The original MPP workspace retains the task budget, each original request, cumulative commitment, merchant delivery, paid response and cooperative close. The browser, installed command and JavaScript client all use the same native records and lease.

This application adds the native **channel** intent beside the existing Charge product. Its wire protocol is the pinned Stellar MPP channel implementation: incremental challenge amounts, cumulative vouchers and the existing one-way-channel contract. Each receiving application carries the full operating history and the complete source needed to reopen it.

## Open the installed application

Use the original selected MPP product and its exact native runtime:

```sh
starforge mpp-workspace open --dir "$MPP_PRODUCT"
starforge mpp-workspace channel state --dir "$MPP_PRODUCT"
starforge mpp-workspace channel help
```

Open **Channel work** in the original browser. The browser keeps the existing private console session, displays the actual workspace records and sends operations to the original job queue. A second source workspace is unnecessary.

A received application can open its native workspace directly:

```sh
node "$RECEIVED_APPLICATION/stellar/scf-starforge-20261009/mpp-channel/cli.mjs" \
  serve --workspace "$MPP_WORKSPACE"
```

The original workspace must be stopped before the direct command acquires its lease. Attached commands use `--dir` and share the running product.

## Select useful work and authorize its task budget

1. Select the actual funded channel, token, funder, recipient, commitment public key, deployed WASM hash, source edition and RPC. Channel creation and funding follow the original contract deployment workflow; the pinned SDK's channel intent consumes an existing channel.
2. Start the merchant with its real authorized source and useful priced route. Load its public `/_mpp/channel-contract` through **Load a merchant offer**, or open the saved complete contract.
3. Select the offer, describe the recurring work and choose its accountable operator. Set a total budget in token base units, maximum amount per purchase, number of purchases and expiry.
4. Save the task edition. **Authorize task budget** presents the full source, channel, task, endpoint, selected merchant edition, unit and cap in the original controlling terminal.
5. Prepare each useful request with its stable purchase ID. **Execute** spends from the selected task authority. **Resume** continues the same saved commitment and response.

For example, a real source owner can expose an authorized dataset query, an explorer query or a document conversion as a priced route. Each request contains the actual input required for that unit of work. The source's edition, authorization and digest travel with its offer and task. This application does not create customer selections or source content.

### Budget corrections

A saved task has a current revision and immutable configuration digest. Correcting it creates a new planning edition and retains previous configurations and authorization history. Its committed amount and purchase count remain attached to the original channel. A budget cannot be reduced below work already committed. The operator authorizes the revised scope before further spending.

Stopping a task prevents new reservations. An already reserved or signed purchase can recover its original result. An unsigned reservation can be cancelled and releases its amount and count exactly once. A retained signed commitment is recovered using its original purchase ID.

### Run a real work list

The JavaScript client and installed command can process a complete supplied work list under a selected task cap. Stable purchase IDs allow the same file to resume after interruption.

```json
{
  "schema": "stellar-forge.mpp-channel-work.v1",
  "purchases": [
    {
      "taskId": "the-saved-task-id",
      "purchaseId": "the-original-unit-of-work-id",
      "request": {
        "url": "https://your-selected-merchant.example/your-route",
        "method": "POST",
        "json": {}
      }
    }
  ]
}
```

Replace the request with the real selected endpoint and useful input. Run it against the same native product:

```sh
starforge mpp-workspace channel run --dir "$MPP_PRODUCT" \
  --input "$ACTUAL_WORK_LIST" --out "$RUN_RESULT"
starforge mpp-workspace channel response --dir "$MPP_PRODUCT" \
  --id "$ORIGINAL_PURCHASE_ID" --out "$PAID_RESPONSE"
```

A running job keeps its ID when the command returns. Read that original job, then rerun the original list. Completed purchases return their retained responses; the same list never creates replacement payment IDs.

## Merchant setup

The merchant is a separate loopback listener, normally port 8789, exposed through the selected HTTPS origin. Its profile selects the actual channel and native dependency directory. Each route defines its authorized source, useful priced unit, incremental base-unit amount and JSON value, JSON file or installed handler.

| Profile field | Selected value |
| --- | --- |
| `title`, `publicOrigin` | Actual merchant name and its public HTTPS origin |
| `channel` | Network, contract address, token, funder, recipient, commitment public key, decimals, WASM digest, original contract source URL and RPC URL |
| `dependencyRoot` | Absolute directory containing the original installed dependency set |
| `secretEnv` | Environment variable holding the merchant's challenge authentication secret |
| `routes[]` | ID, GET or POST, path, description, priced unit, source, amountAtomic and resource |
| `routes[].source` | ID, edition, title, source URL, SHA-256 and the actual authorization for its use |
| `resource.kind` | `json` with value; `json-file` with absolute path; or `handler` with export name |
| `handlersModule` | Absolute original module path when any route uses a handler |
| `settlement` | Recipient account, signing-key environment variable, maximum fee in stroops and accountable operator |

Save its selected edition through the browser or `merchant-save`. Start the listener with its saved stream key. The state view supplies that exact key. Editing the selected profile preserves old deliveries and profiles. Stop and start the listener to operate the newly selected merchant edition.

A handler receives the original stable operation ID, request, route, source, accepted cumulative commitment and native receipt. It returns a `Response` or a JSON value. Implement work that is read-only or idempotent with that operation ID: an interruption after external work but before response persistence can invoke the same operation again. Maintain the original handler edition and its required files for incomplete deliveries.

The merchant atomically associates its native claim and cumulative acceptance with the original delivery ID and credential digest. Recovery resumes that actual accepted delivery, including a crash between the SDK's cumulative update and its challenge completion. It never borrows another request's accepted cumulative amount.

Completed responses retain their original bytes, status, headers and digest. Browser downloads use an attachment response; the native response record preserves its original media type.

## Close and collect the channel

Prepare a close with a stable close operation ID. The recipient reviews the selected cumulative commitment, original delivery, fee account, maximum fee and any pending deliveries in its controlling terminal.

The application uses the original channel contract's `close` function and the selected recipient account. It retains the signed Stellar envelope, transaction hash, fee and expiry before submission. Resume submits or queries that same envelope; it does not create another fee authority automatically.

| Saved state | Operator behavior |
| --- | --- |
| DRAFT | Review and authorize this selected close |
| AUTHORIZED | Resume its original authorized preparation |
| SIGNED / SUBMITTING / PENDING | Resume or reconcile the same transaction hash |
| SETTLED | Original transaction and current contract state received; completion journal is idempotent |
| FAILED | Original failed transaction retained; its own pending marker is finalized |
| EXPIRED | RPC history covers every possible inclusion ledger and has advanced beyond the saved envelope expiry |
| HISTORY_REQUIRED | Query the original hash through the selected archival RPC to recover the missing historical result |
| CANCELLED | Unsigned close cancelled with its original records retained |

For an old transaction, `close-reconcile` accepts `{settlementId, rpcUrl}`. The chosen archival RPC supplies the original transaction result. The configured and archival RPC must first return the selected network passphrase through `getNetwork`. The original signed envelope and network continue to determine its identity, so another network's absent transaction cannot release a pending close.

After a definitive expired or failed close, prepare a new close operation ID if collection remains necessary. It obtains a fresh recipient fee authorization. Every prior close record remains in the same channel history.

## Move the complete operating channel

**Create operating handover** transfers the selected channel from its current workspace. It retains one immutable file before transferring operation, including:

- Complete task editions, task authority, budget reservations, signed cumulative commitments and original requests.
- Native SDK state, merchant profiles, accepted deliveries and exact paid response bytes.
- Close authority, signed transactions, original finality responses and incomplete journals.
- Full source closure, native package manifest and lockfile, browser assets, required handler modules and selected input files.

Download the same saved file by its SHA-256. Interrupted download is a read of that original handover; export with the same handover ID returns it again.

The receiving command checks the entire native record set before joining it. Existing matching records permit interrupted receiving to continue. A conflicting operating record remains intact. The restored application source and file mappings point to real receiving paths, while historical profile and source identities stay unchanged.

The receiver restores existing reservations and signed commitments exactly. Its tasks reopen as **RECEIVED** until the receiving operator selects authority for future purchases. Original pending purchases retain their already selected commitments. Both the full JSON handover and a READY receiving record remain in the original native workspace.

```sh
starforge mpp-workspace channel export --dir "$MPP_PRODUCT" --input "$SELECTED_HANDOVER_INPUT"
starforge mpp-workspace channel handover --dir "$MPP_PRODUCT" \
  --id "$RETURNED_BUNDLE_SHA256" --out "$COMPLETE_HANDOVER"
starforge mpp-workspace channel receive --dir "$RECEIVING_PRODUCT" \
  --input "$RECEIVING_INPUT"
```

The receiving input selects `file` and `dependencyRoot`; the browser can send the complete bundle directly. A subsequent handover reads the restored input mappings and includes every retained profile edition.

## Application and agent API

```js
import { connectMppChannel } from './stellar/scf-starforge-20261009/mpp-channel/client.mjs';

const channel = await connectMppChannel({directory: process.env.MPP_PRODUCT});
try {
  const state = await channel.state();
  const work = await channel.runPurchases(actualWorkList);
  // work contains the original purchase records or the original pending job.
  const response = await channel.response(originalPurchaseId);
  // Persist response.bytes to the selected receiving destination.
} finally {
  await channel.close();
}
```

The export path is also available directly from `mpp-channel/client.mjs`. The client checks the original console identity through `MppProductClient` on every operation. Its typed interface covers work lists, jobs, task/purchase/contract records, responses, handovers and complete operations. The installed CLI exposes those same operations to an agent using the current product session.

The original merchant MCP also exposes `merchant_mpp_channel_status`, `merchant_mpp_channel_record`, `merchant_mpp_channel_operate` and `merchant_mpp_channel_file`. Select its host-declared console alias. Channel operations return the original native job; `merchant_mpp_job` reads it. Large channel handovers stream from their original immutable file through the maintained reader, with the returned read ID, exact byte digest and next offset. An interrupted transfer resumes the same original file after the reader or process restarts.

## Native source and engineering boundaries

The exact installed dependency set is `@stellar/mpp 0.7.1`, `mppx 0.6.29`, `@stellar/stellar-sdk 15.1.0`. The channel modules load through the existing native runtime resolver; dependency receiving stays with the original MPP product owner.

- [Stellar MPP v0.7.1](https://github.com/stellar/stellar-mpp-sdk/tree/9f2f8254421e09906dfb7e983e2491a273120adf): channel request/payload, cumulative client store, native merchant atomic acceptance and commitment preparation.
- [One-way channel contract](https://github.com/stellar-experimental/one-way-channel/blob/main/contracts/channel/src/lib.rs): actual deployed edition is selected by its WASM digest in the channel profile.
- [Stellar RPC getNetwork](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getNetwork): confirms the selected network before channel observations, submission and archival recovery.
- [Stellar RPC getTransaction](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransaction): transaction status, retained ledger boundaries and ledger close times used by close recovery.
- Original `mpp-charge/storage.mjs`, `products/mpp-workspace` and distribution contribution remain the native lease, product identity and installed application path.

Per-channel operations are serial within the original leased workspace. An active merchant selected by the exact same workspace, profile digest and channel uses its original native request handler inside the buyer's existing operation, avoiding a loopback lock cycle. Other merchants use the selected public HTTPS transport. Amounts are canonical decimal base-unit strings and use integer arithmetic. One outstanding buyer commitment per channel preserves unambiguous response recovery. Task authority is separate from recipient close-fee authority. Private key material is read from the operator's environment and is excluded from source, profiles and handover files.

This engineering contribution is AI assisted and belongs with the original SCF application disclosure and its selected funded adaptation. Customer installations, commercial workshare allocations and measured participating operators remain in their original grant and customer cases.
