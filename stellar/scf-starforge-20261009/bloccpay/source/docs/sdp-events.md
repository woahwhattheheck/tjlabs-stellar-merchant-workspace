# SDP signed events in the original company workspace

The existing Bloccpay SQLite service now accepts the twelve pinned SDP event types through the same provider webhook endpoint and workspace writer. An accepted event records metadata and a readback selection. Its raw event data never creates a balance, payment, disbursement projection, or ledger entry. The original provider GET and full retained response establish any projected native resource.

## Select the existing endpoint

Add an endpoint to the existing SDP connection's private webhookEndpoints object:

    "original-subscription-id": {
      "secret": "THE_EXISTING_SDP_ORGANIZATION_WEBHOOK_SECRET",
      "tenantId": "THE_ACTUAL_PROVIDER_TENANT_ID",
      "sourceWalletId": "THE_ORIGINAL_DISTRIBUTION_WALLET_ID",
      "origin": "https://YOUR_EXISTING_SDP_BASE",
      "singleTenant": false,
      "toleranceSeconds": 300
    }

The connection still supplies its original provider:"sdp", environment, baseUrl, tenantName, sourceWalletId, token and networkPassphrase. tenantName is the native request header selection; tenantId is the signed event's provider identity. If the connection also declares tenantId, it must equal the endpoint's tenantId. Keep this configuration private.

origin is the canonical complete selected base URL, including any original base path, without a trailing slash. It must equal the existing native connection descriptor's baseUrl. HTTPS is required except for a selected local loopback installation. The endpoint source wallet must equal the native connection source wallet. Omitting tenant_id in an event is accepted only when singleTenant is explicitly true; a present wrong/null tenant is rejected.

The existing server receives POST /webhooks/provider/<connectionAlias>/<subscriptionId>. The direct service entry is workspace.webhook({connectionAlias,subscriptionId,body,headers}). body is the exact raw Buffer. The SDK adapter preserves the original X-SDP-Timestamp and X-SDP-Signature fields and invokes this same entry.

## Verification and durable admission

SDP verification requires one string value for each signature header, compared case-insensitively by header name. Timestamp spelling is an unsigned decimal second value of the original supported extent, with no leading zero except zero. Signature spelling is sha256= followed by 64 lower-case hexadecimal characters. HMAC-SHA256 covers the exact timestamp, a period, then every original body byte. Comparison is constant-time.

The default tolerance is 300 seconds in either direction; the explicit supported range is 0 through 3600 seconds. The receiving clock uses integer seconds. Maximum accepted event body is 5 MiB. The existing strict JSON parser rejects invalid UTF-8, duplicate keys and trailing content and preserves original numeric spellings. The envelope must have schema_version:1, an original event_id, supported event_type, occurred_at, data object, and the bound tenant/source wallet.

Supported events are disbursement.created, approved, rejected, submitted, completed, failed and paused, plus wallet.created, archived, promoted_to_default, membership_granted and membership_revoked. Disbursement events select their exact data.disbursement_id. Wallet events require data.wallet_id to equal source_wallet_id. These are the original provider distribution-wallet events, including membership changes.

Private raw-body, original-header and verified-event files are retained first. Their descriptors are then joined to the event identity, metadata source and immutable readback selection inside one existing BEGIN IMMEDIATE / journal transition. File writes interrupted before that transaction cannot create an accepted event or resource. Concurrent admission rechecks the current row inside that transaction. First admission also rejects a collision with an existing metadata-source ID; it never overwrites a source imported earlier under a user-selected request ID.

The event key contains provider, configured environment, tenant ID, source wallet, full origin and original event ID. It does not depend on arrival time or signature timestamp. The first accepted raw payload owns that event. A duplicate with the same exact body retains its new reception and returns the original event/selection. Another payload under the same event key creates a retained conflict receipt; it never replaces the accepted payload, connection or readback. A new subscription or connection alias delivering identical bytes does not move the original selected readback owner.

Return forms:

- accepted: {accepted:true,id,replayed:false,status:"accepted",eventKey,sourceId,readback}
- duplicate: {accepted:true,id,replayed:true,status:"duplicate",eventKey,sourceId,readback}
- conflict: {accepted:false,id,replayed, status:"conflict",conflictId,eventKey}
- failed signature/scope/envelope: {accepted:false,id,replayed:false,status:"rejected",error}

For conflicts, id is the original accepted event; conflictId names the separate conflicting observation. Rejected/conflicting rows cannot be projected. The public metadata source contains no signature or raw body and always has versionIds:[] and ledgerAction:"NONE". Full signed originals remain private receiving evidence. Existing connection and endpoint secrets participate in redaction.

## Native readback

Invoke the existing company request writer:

    await workspace.command({
      requestId: originalStableRequestId,
      expectedRevision: workspace.describe().workspace.revision,
      method: "webhook.project",
      args: {webhookId: receipt.id},
      signal
    })

The original webhook.reconcile spelling remains supported and retains its existing Bridge behavior. The current server's automatic reconciliation therefore also selects the new SDP branch without changing its ingress route.

The accepted event freezes these original native actions:

| Event family | Original native action | Native selector |
| --- | --- | --- |
| disbursement.* | sdp.disbursement.get | params.id = data.disbursement_id |
| wallet.* | sdp.distribution-wallet.get | params.id = data.wallet_id |

The event holds one deterministic operation ID and dispatch ID before any provider access. Projecting reopens its original connection, selection hash, raw/verified files and metadata source. The existing prepareOperation and dispatchOperation create and retain the actual GET request, full exchange, classification and resource versions. The request is checked as a read-only GET for the exact action, input and original connection.

Before any resource projection, the source must contain exactly the selected native kind and ID. A disbursement must also report the bound source_wallet_id. An unexpected body remains as an original source with a projection error; it cannot update the resource table. No event payload is passed to projectResource.

A completed native read sets the event status PROJECTED and readback.status COMPLETE, recording its original operation, source and version IDs. A rejected, uncertain, incomplete or mismatched response leaves READBACK_INCOMPLETE with the same original operation. Repeating projection reuses that operation and never schedules another GET for a terminal uncertain/rejected outcome. Recover an incomplete observation through the original company's explicit operation reconciliation workflow:

1. Read the event's retained readback.operationId. Submit operation.reconcile for that exact operation under one explicitly selected new request ID and the current workspace revision. This prepares and dispatches the original read-only GET as a separate, retained reconciliation operation.
2. The reconciliation copies the original event constraint: event ID, selection hash, original action and resource ID, wallet, source scope and connection. The same full-response validation runs before any resource projection.
3. After the reconciliation completes, submit webhook.reconcile for the original webhookId under a new explicitly selected request ID and the current revision. The event reads the original operation's saved reconciliation association, validates its complete operation/source/version identities, and adopts that observation. This step dispatches neither GET.
4. If that reconciliation is uncertain, incomplete or rejected, the event remains incomplete with both original and observed operation IDs. Another provider observation requires another explicit operation.reconcile request; there is no automatic retry loop.

Both disbursement GET and distribution-wallet GET support this same-resource readback through the original native readbackFor selector. readback.operationId remains the initial operation; readback.observedOperationId names the observation actually used, and readback.reconciliation retains the original reconciliation receipt. Replaying a completed command's unchanged request ID returns its original stored result; use the new explicit webhook.reconcile request when adopting a later reconciliation.

An interruption during local files or lease acquisition may leave the same admitted SDP projection command RUNNING with its recorded error. Retrying its unchanged request ID and body resumes its frozen owners. This narrow rule covers storage/descriptor limits, stop signals and original lease contention. Scope, signature, identity and domain preconditions stay FAILED. The outer request, event guard, operation guard and exact native request remain distinct original owners; no retry creates a replacement event or provider mutation.

## Receiving and operation

The normal company workspace snapshot/export includes event rows, conflict receipts, original sources, selections, original request history and resource readbacks. Existing private-file handling applies to signed originals and credentials. Restored workspaces retain the prior event identities and native observations; original receiving rules still disable provider mutation dispatch. A retained complete event can be inspected locally.

The Bridge verifier and Bridge event projection path are preserved unchanged. This integration adds no replacement accounting store, webhook server, token source or scheduler.

Source verification: complete modified ESM bodies are parsed and exact predecessor/replacement guards are retained. Actual native results must be reported from the selected company course; source verification alone does not claim a provider request or runtime result.

Pinned provider basis: stellar/stellar-disbursement-platform-backend at 4330f131e8a2638a10767ec8db50a98f22672a61. The original distribution wallet service emits wallet.* with data.wallet_id; the existing company catalogue supplies both native GET operations.
