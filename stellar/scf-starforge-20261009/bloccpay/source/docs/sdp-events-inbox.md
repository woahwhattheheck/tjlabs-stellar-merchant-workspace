# Signed SDP event inbox and explicit readback recovery

The SDP event inbox is an operator page in the existing Bloccpay company host. It reads the company's original SQLite webhook, operation, request, source and resource-version records. An accepted signature selects a native resource GET; the event payload never supplies a balance, a payment result or a financial projection.

Open **SDP event inbox** in the existing navigation, or open `/sdp-events` on the same host. The original operator token is required. The inbox uses the existing authenticated company HTTP routes and the same workspace identity. It does not receive or store provider credentials.

## Installation and source composition

The complete additive leaves are:

- `web/sdp-events.html`
- `web/sdp-events.css`
- `web/sdp-events.mjs`
- `docs/sdp-events-inbox.md`

Apply the two exact guarded source joins delivered with this contribution. The server join adds only four static routes: `/sdp-events`, `/sdp-events.html`, `/sdp-events.mjs` and `/sdp-events.css`. The navigation join adds the new link immediately before the existing Export & receive control. These joins preserve the separately owned Bridge assets, page, service and server lifecycle correction. Their before strings remain unique after the Bridge joins.

The module imports the unchanged `canonical`, `textHash` and `fileHash` functions from the original `web/journal.mjs`, which in turn uses the original `web/sha256.mjs`. It owns a separate IndexedDB database for this inbox; importing these pure functions does not open or close the main operator's journal.

The host must include the complete SDP event backend successor, including `lib/webhooks.mjs`, the reviewed `lib/workspace.mjs` event and explicit reconciliation branches, and the original native distribution-wallet GET readback addition. The normal application source manifest must inventory these new leaves and all composed host/navigation postimages. Serve the complete selected application through the original company runtime; this page has no independent host or dependency installer.

## Read a retained event

1. Open the inbox with the existing operator token. A token from an original startup link can be supplied in its URL fragment; after retaining it in session storage, the page removes that fragment from browser history. The token is never copied to the request journal or downloaded event view.
2. Refresh the retained workspace. The page reads the original bootstrap, follows every webhook and request list cursor to completion, then displays the SDP rows in pages of 50.
3. Filter by event ID, event type, local webhook ID, status, connection or readback status.
4. Open an event. The page reads the complete original webhook row, the initial operation if it exists, its retained reconciliation operation, all associated sources and all referenced native resource versions before adopting the new detail view.
5. Inspect the frozen tenant, source wallet, origin and native GET selection, reception history, conflicts, operation state and original request history.

The event table includes rejected deliveries and conflicting payloads. A conflict links to its original accepted event; the accepted event links back to its conflict rows. Rejected or conflicting events have no recovery command controls. They remain inspectable original evidence.

Source cards distinguish complete and incomplete response bodies. An HTTP response, a valid signature and an accepted command receipt each describe a different part of the workflow. A readback is complete only when the original backend has checked the selected operation, full response and matching resource version.

## Choose a recovery deliberately

The page offers the following original commands according to the currently retained state.

| Selected state | Inbox action | Original command | Provider activity |
| --- | --- | --- | --- |
| Accepted event with no initial operation | Prepare first resource read | `webhook.project` | May issue the event's selected GET |
| Initial operation PREPARED or DISPATCHING | Prepare original read continuation | `webhook.project` | Uses the original operation and dispatch identities; native uncertainty rules apply |
| Terminal initial observation with incomplete event readback | Prepare explicit reconciliation GET | `operation.reconcile` | One newly selected read-only GET through the original native readback mechanism |
| Original operation has a retained reconciliation | Prepare adoption of retained reconciliation | `webhook.reconcile` | Reads and adopts the existing reconciliation; no provider request |
| Readback COMPLETE | Inspect and download | Original read routes | No provider request |

A reconciliation GET never recreates the original disbursement, uploads instructions, starts a payment or changes a wallet. The selected read actions are exactly `sdp.disbursement.get` and `sdp.distribution-wallet.get`. The company native writer retains their original connection and resource constraints. Wallet events require the same wallet in `source_wallet_id` and `data.wallet_id`.

The explicit GET and its adoption are separate operator actions. After a successful reconciliation, refresh and choose **Prepare adoption of retained reconciliation**. That action verifies the already-retained response sources and native versions. If the explicit GET also fails, its original request, operation and source remain visible. A further provider read requires another explicit selection.

Preparing an action reads the current event and workspace revision and creates an exact command proposal. Inspect its method, original webhook or operation ID, request ID and expected revision. This proposal is not a dispatched command. **Discard unsubmitted selection** affects only this proposal.

**Retain & run this exact request** first commits the full command to IndexedDB. Only after that transaction completes does the page call the original command endpoint. If local storage cannot retain the request, no command is dispatched.

## Interrupted requests and accepted-result custody

Each local row retains:

- original workspace ID, event ID and original operation ID;
- exact method, arguments, request ID and expected revision;
- the canonical command SHA256;
- local attempt times and state;
- the complete accepted native receipt or original failure.

Before a dispatch or retry, the page reads the same original native request ID. A COMPLETE native request is adopted locally. A FAILED request remains rejected. A running request uses its unchanged original body and ID. An absent request may be dispatched with that same retained body.

A network error, unreadable response, authentication failure or cancellation leaves an unfinished original request. The inbox does not create a replacement key for that uncertainty. Use **Reconcile / continue this exact request** in Original recovery requests. A new recovery is blocked while this workspace has unfinished local work.

The page can unlock a revision-conflicted request only after the original native request lookup proves it was never admitted. It retains the rejected row. Refresh and explicitly prepare a new command against the newly observed revision; the old row and key are preserved. A changed native method, arguments, expected revision or accepted receipt is a conflict, not permission to replace local history.

A native result is placed in an in-memory known-result map before its browser-storage publication. If that publication fails, the accepted result remains in the same live page and blocks a replacement action. Retrying the request or closing the inbox retries that same result publication. Older storage reads and transitions cannot overwrite an already-known COMPLETE result.

The dedicated browser database is `bloccpay-sdp-events-browser`, with one `requests` store. A read-write transaction checks for another unfinished request before admitting a new ID. Rows are scoped by the original workspace ID even when multiple company workspaces are opened on the same origin. The host remains the authority for concurrent requests, revision conflicts and dispatch identity.

Local browser storage is necessary to recover a tab before a request has appeared on the host. Keep the same browser profile and workspace when resolving interrupted work. Accepted host requests, operation sources and webhook history remain in the original company export independently of this page.

## Original observations and downloads

The inbox uses only the existing authenticated routes:

| Route | Purpose |
| --- | --- |
| `GET /api/bootstrap` | Current workspace identity, revision and original connection descriptions |
| `GET /api/list` | Complete native webhook and request pagination |
| `GET /api/item` | Original webhook, operation, source, version or request |
| `GET /api/file/<id>` | A native public file selected by its exact file identity |
| `POST /api/command` | The exact retained recovery command |

**Download source observation** returns the native public source file. **Download original response** appears only when the native producer exposed a downloadable public response. Both downloads verify the complete body SHA256 against the selected hash and the host's content-hash header before offering the file.

Signed raw bodies, signature headers, private exchanges and credentials are not exposed through a new download route. Their retained originals remain in the existing private company delivery under its original export rules.

**Download event and readback record** creates an explicitly labelled `bloccpay.sdp-event-view.v1` JSON view of the selected public event, operations, sources, versions and request history. It is a readable joined observation, not the original signed request body or a replacement for the private export. The full source records identify its originals.

Object URLs remain owned by the inbox until its actual close. Downloads do not delete or rewrite any native source.

## Receiving and historical workspaces

Use the existing company's complete Export & receive workflow after closing the inbox. The original exporter carries the SQLite journal, requests, operations, webhooks, immutable files and source/runtime closure. The existing receiver validates the delivery and establishes its new workspace identity.

A received workspace can display the historical SDP event, source and reconciliation rows. Its previous command receipts still identify their original workspace; the inbox does not rewrite those identities or rebind old browser requests to the received workspace. Local browser requests are filtered by the current exact workspace ID.

Receiving does not supply provider credentials or authorize dispatch. Any new read requires the original company's explicit connection and dispatch configuration, and the retained source scope must still match. Historical inspection and original public-file downloads use the received evidence without making a provider request.

## Close and retry the same owner

**Close inbox & return** waits for the inbox's close operation before navigating back to the original operator. During close, new work is rejected, existing fetches are aborted, and all admitted task promises remain owned through response-body settlement. The page then durably retains any known accepted results, saves its selected view, releases its object URLs and closes its own IndexedDB connection.

A failed retention or cleanup leaves the same owner available for another close call. A separate successful-closure flag is set only after all those operations finish. The main company journal is not closed by this page.

For the existing browser receiving programme:

```js
window.bloccpaySDPEvents.observe()
// { workspaceId, eventId, active, knownResults, closing, closed }

await window.bloccpaySDPEvents.close()
// { state: 'CLOSED', workspaceId }
```

A `closed: true` observation follows completed cleanup. The programme should await close before closing the browser context or exporting its profile. Browser window termination cannot itself prove a completed IndexedDB publication.

## Validation and execution status

This source contribution is checked against the complete original company31 server, request writer, public record/file routes, native operation states and the reviewed SDP event source2. The full ESM is parsed with the retained original Acorn parser; static DOM IDs and both exact composition guards are checked. Those checks do not claim that a browser or provider request ran.

The parent owns the one complete company native course, actual runtime selection and final publication. Its signed-event course exercises the original SDK delegate, raw HMAC ingress, duplicate/conflicting events, native readback, explicit reconciliation, independent receiving and cold reopen. This page adds the operator workflow over those same records and commands. No additional financial engine, mutation route or background provider polling is introduced.
