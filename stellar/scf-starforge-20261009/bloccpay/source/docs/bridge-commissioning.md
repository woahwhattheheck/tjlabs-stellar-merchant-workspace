# Commission retained Bridge records

The existing `operate-bloccpay.mjs` programme can prepare selected Bridge reviews and incident decisions, open them in the operator desk, and carry them through its full workspace export and receiving flow.

## Select the work

Add `bridgeIntake` to the same private commissioning configuration used by the application. Use these fields:

| Field | Required value |
| --- | --- |
| `schema` | `bloccpay.bridge-commissioning-selection.v1` |
| `reviews` | Ordered new review selections; use an empty array when inspecting existing records only. |
| `existingRequestIds` | Ordered IDs of completed reviews or decisions to inspect and include in the handover. |
| `browser` | Boolean selecting inspection and downloads through the existing browser. |

At least one review or existing request is required. Omitting `bridgeIntake` leaves this stage unselected and allows the other configured work to proceed.

Each new review contains `requestId`, `selection`, `actor`, `note`, `preparedAt`, and an optional ordered `decisions` array. Use stable original request IDs and an explicit preparation timestamp.

The review selection follows [the Bridge intake contract](bridge-intake.md): `connectionAlias`, `environment`, `sourceScope`, `developerId`, `customerIds`, `virtualAccounts`, `versionIds`, `sourceIds`, `webhookIds`, and `captureIds`. Each virtual account is a `{customerId,virtualAccountId}` pair. Select IDs from the current workspace's retained records; the desk and CLI expose their source, scope, and version history.

Each decision contains its own `requestId`, `incidentIds`, `action`, `actor`, `note`, and `preparedAt`, with optional `evidenceFileIds` and `supersedes`. Its incidents belong to its parent review. Supported actions are `ACKNOWLEDGE`, `ESCALATE`, `RESOLVED_EXTERNALLY`, and `REOPEN`. External resolution requires the retained evidence selected by the intake service.

Put a completed request in `existingRequestIds`. Reuse a new-review selection only when this same commissioning operation already retains its original admission.

## Run in the original operation

Use the existing source directory, private configuration, and operation directory:

```sh
node operate-bloccpay.mjs \
  --configuration /private/bloccpay/commissioning.json \
  --operation-directory /private/bloccpay/original-operation \
  --source-directory /path/to/bloccpay-operations
```

The Bridge stage borrows the running workspace and browser. It creates the native preview at the current revision and saves its complete document, request ID, and revision before calling the original intake writer. Reviews and decisions remain attached to the native `file.retain` requests.

Stage files are retained under `bridge-intake/<selectionSha256>/` inside that operation directory:

| Output | Contents |
| --- | --- |
| `selection.json` | Complete normalized selection and original workspace identity. |
| `requests/<requestHash>/` | Immutable admission, returned result, and complete retained record. |
| `documents/` | Exact review and decision JSON. |
| `evidence/` and `originals/` | Full selected evidence, provider responses, and signed event bodies. |
| `PRODUCING_RESULT.json` | Selected requests, document identities, source files, and output descriptors. |
| `browser/original/` | Selected desk records and downloaded review files. |
| `RECEIVED_RESULT.json` and `browser/received/` | Inspection of the same records after independent receiving. |

Keep these outputs with the private case delivery. They can contain account details and signed event bodies.

## Resume an interrupted save

Repeat the same command with the same configuration and operation directory. The stage reloads its saved admission and uses the original request body and ID. A completed native request returns its retained result.

A revision conflict requires a fresh operator review of the changed workspace. Preserve the rejected admission and deliberately select a new request for new work. The helper never rewrites an admitted preview to match a later revision. If a native request already exists without this operation's saved admission, select that completed request for inspection through `existingRequestIds`.

## Inspect the desk and receiving copy

With `browser:true`, the stage opens `/bridge` in the configured browser, selects each saved request using **Open original record**, and uses **Download exact JSON**. The downloaded file must match the retained document's complete byte count and hash.

The original programme closes the desk and its pending work before releasing the borrowed context. Its selected Bridge records become part of the final export identity, so later work produces a corresponding export edition.

After full workspace receiving, the stage reads the same requests, documents, source files, and decision lineage from the received installation. The received workspace has its own ID while the historical records preserve their original producing identity. The received host selects `webhookProjection.enabled:false` during inspection.

## Embedding the stage

`createBridgeCommissioning({workspace,operationDirectory,selection,signal})` returns `produce`, `receive`, `observeBrowser`, `inspect`, and `close`. Register the returned owner before starting work and remove it only after `close()` resolves. Failed closure preserves the same owner for retry.

The helper drains its admitted tasks, downloads, desk contexts, and intake service. The parent continues to own the workspace, HTTP host, browser process, and operation directory.

The stage's review and inspection operations use retained sources. Wider provider reads or financial operations follow the separate selections in the original commissioning configuration.
