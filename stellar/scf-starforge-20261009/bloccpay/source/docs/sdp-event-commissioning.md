# Operate a retained SDP event during commissioning

The existing `operate-bloccpay.mjs` programme can inspect a signed SDP event, run explicitly selected readback actions through its inbox, and include the resulting records in the full workspace export and receiving flow.

## Select an original event

Add the optional `sdpEventInbox` object to the same private commissioning configuration:

```json
{
  "sdpEventInbox": {
    "webhookId": "ACTUAL_LOCAL_WEBHOOK_ROW_ID",
    "selectionSha256": "ACTUAL_EVENT_SELECTION_SHA256",
    "actions": ["reconcile", "adopt"]
  }
}
```

Replace both placeholders with the values from the original retained event. The row must belong to SDP, be verified, have no conflict association, and retain its original metadata source, signed body, and signature headers.

The ordered `actions` array accepts at most three distinct selections:

| Action | Inbox control | Company method |
| --- | --- | --- |
| `project` | Prepare first resource read or original read continuation | `webhook.project` |
| `reconcile` | Prepare explicit reconciliation GET | `operation.reconcile` |
| `adopt` | Prepare adoption of retained reconciliation | `webhook.reconcile` |

Use an empty array for inspection and downloads only. Select actions that the inbox offers for the event's current state. A complete readback usually needs no further action. Reconciliation performs the real resource GET; adoption uses the retained reconciliation result.

The private configuration supplies the existing provider connections and selected browser runtime. Start or continue the same operation:

```sh
node operate-bloccpay.mjs \
  --configuration /private/bloccpay/commissioning.json \
  --operation-directory /private/bloccpay/original-operation \
  --source-directory /path/to/bloccpay-operations
```

## Retained command and result files

Each event/action selection has its own `sdp-event-inbox/<inputSha256>/` directory within the original operation. Repeating that selection resumes the same saved requests; selecting other work preserves the earlier directory.

Before a selected inbox command leaves the browser, the programme reads its committed local request row and saves the exact command, event, workspace, request ID, and revision. The original HTTP request proceeds after this local save. Its complete native result is retained beside it.

| Output | Contents |
| --- | --- |
| `selection.json` | Original event identity and selected actions. |
| `commands/` | Exact original browser requests and native results, in selection order. |
| `downloads/` | Complete event view and original source downloads. |
| `candidate.json` | Completed browser observation awaiting native retention. |
| `result.json` | Observation and its retained workspace file/request. |
| `received/<workspaceId>.json` | Inspection of the same records in an independently received workspace. |

These are private operating records. Keep them with the workspace delivery.

## Continue after interruption

Repeat the original command with the same selection and operation directory. Saved commands are restored into the inbox using their original IDs and bodies. The programme uses **Reconcile / continue this exact request**, which checks the native request before deciding whether it needs to continue.

An accepted request returns its retained result. A rejected request keeps its original outcome. An unavailable action requires an operator to review the current event state and deliberately select the next work.

If the browser observation completed before its workspace retention was interrupted, the saved candidate resumes the same `file.retain` operation. A completed observation is read back with its file identities before being reused.

## Export and inspect the received installation

The completed event observation and command identities become part of the final workspace export selection. The normal application export carries the retained event, original provider sources, resource versions, requests, and observation file.

In the received installation, the programme opens the actual inbox, reads the same event, and downloads its observations. It checks the original source and request identities while recording the received workspace's own ID. The received host selects `webhookProjection.enabled:false` for this inspection.

A configured event stage must complete before the parent exports its selected delivery. Other operation phases retain their ordinary source and request history.

## Embedding the helper

`createSDPEventInboxCommissioning` takes the original `workspace`, `selection`, `operationDirectory`, interruption `signal`, durable `request` helper, and `openBrowserContext` / `closeBrowserContext` functions.

Register its returned owner before invoking `select()`, `operate({browser,server})`, or `receive({browser,server})`. Remove it only after `close()` resolves. The helper preserves captured commands and drains its page work, downloads, and contexts before releasing them; failed closure retains the same owner for retry. The parent owns the HTTP host, browser process, workspace, and operation directory.
