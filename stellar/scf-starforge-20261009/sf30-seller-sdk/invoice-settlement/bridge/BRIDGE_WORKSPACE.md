# Bridge treasury intake and incident receiving

This component extends the maintained SF30 Invoice & Settlement Workspace. It retains complete Bridge reads and signed delivery bytes, freezes sourced assessment editions, records explicit incident decisions, and carries them through the existing full application/workspace receiving path. It owns no second database or financial ledger.

## Ownership and deployment

The existing invoice workspace keeps its workspace UUID, source records, versioned programmes, request journal, native receiving and export. The Bridge modules live under \`invoice-settlement/bridge/\`. Register every full Bridge source and guide in the current \`invoice-settlement/source-files.json\` before a portable export. Compose that declaration from the maintained current source; preserve Horizon, SDP and other existing registrations. A missing or changed declared dependency stops the original exporter.

The Bloccpay company application, existing SQLite transactions, account setup, scheduler, network listener and financial state remain with their original owners. The optional webhook handler attaches to that existing host. It opens no port. The offline incident report is a portable review desk and generates exact command files for the original operator. It does not claim to have committed a downloaded decision.

The source baseline is the complete Invoice application delivered in Merchant PR1262, merge \`e0ade1d51e695dc55fe40281b0d55bf2994e3472\`. The original native HTTP reader, source.import writer, source-file ranges, complete application manifest, directory export/receive and full history checks are reused directly. The production Bridge endpoint and original developer/customer configuration are supplied by the deployment owner.

## Runtime and configuration

Use the original selected Node runtime, minimum Node 22.16. No npm install or replacement provider SDK is needed. Keep the private Bridge configuration outside every workspace and exported package.

\`examples/private-connection.example.json\` is a clearly labeled template. Replace its environment, baseUrl, network, API key, developer ID, customer IDs and exact customer/virtual-account pairs with the original setup. The base URL includes the API version path, for example the original selected \`/v0/\` path. Production and sandbox must be selected explicitly. HTTP is available only through an explicit \`allowHttp:true\` private connection, for an already authorized local service. The provider authentication header is \`Api-Key\`; a bearer-token configuration is rejected.

The public selection returned by \`bridge.overview\` binds provider, original transport identity, environment, network, endpoint origin/base-path hash, developer, customers and virtual accounts. Save that complete selection unchanged. A \`--selection\` command opens only the historical source interface: no credential and no HTTP client is created, and attempting a new provider read reports \`PRIVATE_CONNECTION_REQUIRED\`.

Other invoice connections/profile use the original configuration loader unchanged. A Bridge connection is supplied separately; it is not inserted into the original invoice provider enum. The existing provider registry therefore retains its original behavior.

## Original command files

The CLI takes a complete retained \`{method,args}\` JSON file. Every state-changing call requires its original UUID requestId and expectedRevision. Persist the exact input before invoking it; reuse that same input when a response is uncertain. The native journal rejects reuse of an ID for changed intent. Its usual replay comparison excludes expectedRevision; preserve the original value on ordinary retries.

Examples below assume private, absolute, existing paths:

\`\`\`sh
node /application/stellar/scf-starforge-20261009/sf30-seller-sdk/invoice-settlement/bridge/cli.mjs methods \
  --workspace /private/invoices --bridge /private-config/bridge.json

node /application/stellar/scf-starforge-20261009/sf30-seller-sdk/invoice-settlement/bridge/cli.mjs invoke \
  --workspace /private/invoices --bridge /private-config/bridge.json \
  --input /private-commands/capture-create.json --output /private-results/capture-create.json
\`\`\`

Output files are create-only. An identical existing output can reopen; a conflicting file is rejected. The output parent must already exist as a real directory. An accepted result remains in the native request journal even if final output fails. If a known result exists when an interruption or close error occurs, the error record includes \`acceptedResult\`; inspect the original request before another action.

Read the current state with \`bridge.overview\` or \`workspace.describe\`. Use \`request.status\` with the exact ID to inspect an accepted command. Read every original source using \`source.read\` and \`source.file\`.

The download command writes complete source bytes after bounded full-range hashing:

\`\`\`sh
node /application/stellar/scf-starforge-20261009/sf30-seller-sdk/invoice-settlement/bridge/cli.mjs download \
  --workspace /private/invoices --selection /private-commands/bridge-public-selection.json \
  --source-id ORIGINAL_SOURCE_UUID --part body --output /private-results/original.body
\`\`\`

Parts are body, request, response, projection and manifest. No source bytes are reconstructed from their display.

## Complete provider intake

Create an immutable capture with \`bridge.capture.create\`:

- \`requestId\`, \`expectedRevision\`;
- \`name\`, \`actor\`, \`note\`;
- \`read\`: a supported original read selection;
- optional \`maxPages\` (default 10,000, finite maximum 100,000);
- optional original \`programmeId\` and \`programmeVersion\`.

Read choices are:
1. \`{kind:"transfers",limit:100,starting_after:null,filters:{}}\`;
2. \`{kind:"transfer",id:"original-transfer-id",filters:{}}\`;
3. \`{kind:"virtualAccountActivities",customerId:"...",virtualAccountId:"...",limit:100,starting_after:null,filters:{}}\`.

Transfer filters are the documented tx_hash, updated_after_ms, updated_before_ms, template_id and state. Millisecond bounds are safe nonnegative integers. The global transfers list has no invented customer query: complete returned pages are saved, cursor integrity includes every original ID, and only the explicitly bound customers enter the projection. Detail and virtual-account reads must match the selected original customer/virtual account.

Virtual-account filters are deposit_id, deposit_ids, tx_hash and the documented event_type; deposit_id and deposit_ids are mutually exclusive. The original array wire format is repeated `deposit_ids[]=id1&deposit_ids[]=id2` parameters, as specified by the [official Virtual Account Activity API](https://apidocs.bridge.xyz/api-reference/virtual-accounts/virtual-account-activity). The retained complete request exposes the actual query sent by the original transport. No forward/newer cursor is synthesized for a historical walk.

Use \`bridge.capture.read\` to inspect the exact selected page and any unfinished admission. Invoke \`bridge.capture.next\` with captureId, requestId and expectedRevision. It performs one original HTTP read at most:

1. Commit a complete immutable page-admission document through original source.import.
2. Read and drain the original HTTP body.
3. Save every raw response byte, status, headers, timing, parse result and original selection in a source record.
4. Commit the next cursor only after the complete response is retained.

A retry with the original page request reuses its admission and already saved response. It does not obtain another response merely to finish the cursor commit. If a crash occurs before any response was saved, the same admitted idempotent GET may be read again; no provider mutation is involved. A recorded HTTP/parse/repeated-ID error leaves a FAILED step, original body and unchanged selected page. A following read needs explicit \`resumeFailure:true\`, a fresh page request ID and the current revision. There is no automatic rate-limit or connection retry. Retry-After is retained as evidence.

A list is complete only after its terminal empty original page. A short nonempty page is followed by its actual last ID. Repeated IDs/cursors or the finite page bound stop completion. The native history stays discoverable through source records and immutable controls; a separate mutable cursor file is unnecessary.

## Money and source interpretation

Monetary values remain decimal strings. Arithmetic normalization uses BigInt coefficients and explicit scale; there is no Number-based monetary conversion. Source currency, destination currency, transfer amount and receipt fee bases remain distinct.

A payment_submitted destination transaction hash is provisional. A payment_processed hash is identified as the provider's final reported destination hash. Neither automatically authorizes a native Stellar settlement link. Missing final hashes, missing currency, unsupported states and unresolved deposit links appear as review findings.

Virtual-account activity IDs, deposit IDs, transfer IDs, customer IDs and client references are separate identities. Provider timestamps and webhook sequence/event IDs are retained. Multiple inconsistent observations remain separate original evidence. The component does not impose a final state by assuming arrival order.

## Signed webhook admission

\`bridge.webhook.receive\` accepts the original rawBodyBase64, exactly one signatureHeader, original publicKeyPem, endpointId, original receivedAtMs, requestId and expectedRevision. An optional freshness window is explicit; defaults are 600,000 milliseconds maximum age and 60,000 milliseconds future skew.

Verification uses the complete original bytes and the endpoint's RSA public key before JSON interpretation. The declared Bridge contract is RSA PKCS#1 v1.5 with SHA-256 over the SHA-256 digest of \`t + "." + rawBody\`, where t is the exact original decimal millisecond token. The header requires one t and one v0 field with canonical padded base64. Full source references and the selected contract are in BRIDGE_PROVIDER_CONTRACT.json.

The strict JSON reader rejects duplicate keys, nonfinite/unsafe integer numbers, malformed UTF-8, unpaired surrogates, trailing bytes and excessive nesting. The v0 event must match the original developer, selected customer and virtual account, category/type and event-object identity.

The original receipt timestamp is frozen once for each delivery attempt. Replaying a stored command checks that same receipt window; it is not silently replaced with wall-clock time. Every valid signed attempt is retained with its raw body, header, key fingerprint, endpoint and verification. A deterministic original source.import request deduplicates the developer/event identity. Identical bytes replay the native event result; changed bytes under the same identity conflict, with the signed attempt retained for review.

Only after both the delivery attempt and event source are durably accepted does the result say \`acknowledge:true\`. It always says \`ledgerAction:"NONE"\`. The caller's existing transaction/effect engine remains responsible for any business change.

\`createBridgeWebhookHandler\` attaches this behavior to an existing HTTP host:

\`\`\`js
const handler = createBridgeWebhookHandler({
  operator, endpointId, publicKeyPem,
  maxBodyBytes: 8 * 1024 * 1024,
  onError: error => originalHost.recordError(error),
});
// The original host routes only its configured webhook path to handler.handle.
// On shutdown: stop that route's admission, await handler.close(), then operator.close().
\`\`\`

The handler requires POST, one original signature header and identity content encoding; no body parsing middleware may consume or rewrite its raw stream first. The existing host owns socket/request timeouts and admission authentication. Accepted request/body/response owners remain tracked through close. The handler opens no server or scheduler and never supplies a financial callback on its own.

## Frozen edition and incident desk

\`bridge.edition.preview\` selects complete retained capture-response and deduplicated webhook-event source IDs, name, canonical UTC asOfDate, note and optional nonnegative pendingHours (default 48). It returns full original observations, incidents and previewSha256.

Inspect this actual preview before \`bridge.edition.save\`, which uses the same exact arguments plus expectedPreviewSha256, requestId and expectedRevision. It is an immutable original source document. A changed source selection or preview hash stops the save.

The edition includes provider failures, original projection findings, exception states, pending-age thresholds or unknown ages, and ambiguous observation ordering. A human assessment timestamp is explicit rather than an implicit current clock.

Record an incident with \`bridge.incident.decide\`, referencing the exact editionId and incidentId, one of ACKNOWLEDGE / INVESTIGATE / EXTERNAL_RESOLUTION_RECORDED, actor, canonical UTC at, note and optional reference. EXTERNAL_RESOLUTION_RECORDED requires the actual external resolution reference. The decision includes the complete original incident and edition hash; it is not a payout, refund, ledger entry or claim that Bridge resolved the case.

\`bridge.report.save\` retains a complete HTML desk for that edition in the existing source table. Download its body and open it on desktop or mobile. It displays the original sources, raw observations, findings and identity. Search/paging preserve the full embedded edition. Its explicit local decision draft is saved in the browser's local storage; errors are visible. Downloading a command locks that draft's exact request UUID and body. Execute the downloaded original command using the original operator, then inspect the native receipt. The desk itself has no network access and does not present local drafts as committed.

The full report is included in the original workspace export because it is an original source body. Its embedded evidence may be private; keep it within the original company's private delivery.

## Complete independent receiving

\`bridge/receiving.mjs\` performs the complete real local course through the existing application:

- retain the complete exact receiving input;
- freeze every Bridge source's original metadata and full body/request/response/projection/manifest hashes plus its original request record;
- export the whole original workspace and registered application at the selected revision;
- inspect every native package member;
- close the producing operator;
- receive the complete original package into an independent directory through the original receiver;
- import and use the received application's own Bridge operator with the public selection only;
- verify every complete Bridge source and original command/result identity;
- re-export and inspect that independently received workspace;
- close the received operator and publish the immutable full result.

It makes zero provider reads and zero financial mutations. The original local workspace export and receive.prepare transitions remain visible in their native journal. The latter pauses original native captures/delivery runs for receiving; no new scheduler or private connection is invented.

Use \`examples/receiving.example.json\` as an explicit template. Replace all UUIDs, paths, public selection and expectedRevision with the original real selection. Five directory roots must be separate, with none nested in another. The output directory is private and contains the immutable input, PREPARED, EXPORTED, RECEIVED, VERIFIED, REEXPORTED and RECEIVING_RESULT records. Source workspaces and received packages remain at their selected original paths.

\`\`\`sh
node /application/stellar/scf-starforge-20261009/sf30-seller-sdk/invoice-settlement/bridge/receiving.mjs run \
  --input /private-commands/bridge-receiving.json
node /application/stellar/scf-starforge-20261009/sf30-seller-sdk/invoice-settlement/bridge/receiving.mjs inspect \
  --input /private-commands/bridge-receiving.json
\`\`\`

Keep that exact input for interruption recovery. Existing original export/receive request IDs are replayed through their maintained journals; the producing revision is not recomputed after a partial export. An already completed course is validated locally without creating a provider client or new export. The final manifest/source hashes and immutable receiving records remain checked. The received application's full history may subsequently advance through its native writer; original receiving provenance remains required.

All source/input/result files are retained. A local CLI process and directory receiver are used; this module does not start a host, browser, application worker or additional ledger. Original portable archive streaming/unpacking commands remain available through the maintained Invoice archive module for physical transfer of the directory package.

## Cancellation and close

Each facade stops its own admission and tracks every accepted operation. Host cancellation aborts only its owned provider read, keeping the original source writer alive long enough to retain the actual drained response. Closing the Bridge operator drains the facade, original accepted passthrough calls, source and then the borrowed Invoice operator. A failed close retains those exact original owners for retry. Failed startup carries bridgeOperator / closeFailedBridgeOperator when cleanup itself needs continuation.

CLI SIGINT, SIGTERM and output-stream errors stop admission, retain the first failure and await the same owners. Full body files, native request records and prior results are not replaced by progress/output failures. The receiving command prints its final outcome after the actual operators close; its original receiving lock remains owned until the callback exits.

## API summary

| Method | Native effect |
|---|---|
| bridge.overview | Read original Bridge source index and selection |
| bridge.capture.create | Save immutable original capture selection |
| bridge.capture.read | Read exact chain, retained cursor and unfinished admission |
| bridge.capture.next | One admitted GET, full original response and cursor commit |
| bridge.webhook.receive | Verify and retain signed attempt plus deduplicated event |
| bridge.edition.preview | Read full sources and calculate an explicit assessment |
| bridge.edition.save | Save exact reviewed immutable edition |
| bridge.edition.read | Read and verify a complete saved edition |
| bridge.incident.decide | Record an explicit sourced operator decision |
| bridge.report.save | Save full portable offline desk as an original source |
| source.read / source.file | Existing full source metadata and ranged bytes |
| request.status | Existing original command/result lookup |
| workspace.export | Existing full source-inclusive application/workspace export |
| package.inspect / package.receive | Existing package validation and independent receive |

## Delivery status

The complete source is authored against the maintained original SDK and primary Bridge contracts. Source parsing and contract checks are reported separately from native execution. A real provider connection, RSA delivery, native full receiving course or browser exercise is not claimed until its actual outcome is recorded by the original execution owner. No Bloccpay private ledger or customer data is fabricated for demonstration.


## Report command basis and completed page recovery

A saved incident report observes workspace revision R and its original source import commits revision R+1. Its exported decision commands therefore start from R+1; the embedded observedRevision remains R. Saving requires the caller's explicit expectedRevision to equal the actual overview, and the unchanged native sourceImport checks that revision under its writer lock. A concurrent change refuses the save. Reopening the same report request reuses the complete original HTML bytes and its original command basis. Later workspace changes require reviewing the current revision through the original workflow; the report never silently rebases an exported request.

A completed capture.next replay reads the exact original capture-step source and replays that same source.import request without another provider read or new source. Both first completion and recovery return the native receipt fields, step and capture; recovery adds the original native replayed marker. The returned capture can show later current progress while the step and native receipt remain the accepted original ones.
