# Complete ROZO receiving

## Choose the intended custody action

A **working export** contains the complete selected source, publisher files, runtime and workspace checkpoint for review. It is received read-only. The source owner can continue normal work after the snapshot.

A **handover** pauses recurring capture, drains in-flight and native work, commits the original seal and packs the complete delivery under the existing operator/native-file leases. It is one normal operator request with one original request ID. The sender stays sealed; only the explicitly received copy can be activated.

Both actions carry:

- Complete application, shared Applications/distribution dependencies, source manifest and original browser assets.
- All selected licensed publisher source and source identity.
- Every explicitly selected Common/decoder dependency runtime file.
- Original workspace/origin marker, SQLite checkpoint, raw response objects and callback bytes.
- Current records, all immutable editions, prepared requests, attempts, responses, source observations, audit and original CLI/native request files.
- Immutable reports and their exact JSON/CSV/HTML bytes in the checkpoint.
- The original private configuration and a relocated receiving template that keeps credential environment-variable names.
- DELIVERY.json with every ordinary member's exact bytes and SHA-256.

Secret environment values are not copied into connection files. The receiving owner supplies credentials through its existing private environment. Callback/raw provider bodies and business records are private delivery content.

## Export or hand over from the original operator

Use the Delivery view while the application owns its original lease. It saves the complete request before dispatch and provides the resulting original archive.

For the standalone CLI, first stop the existing Applications/CLI server so one operator owns the workspace:

~~~sh
starforge rozo-payments export \
  --workspace /private/merchant/rozo \
  --config /private/merchant/rozo-connections.json \
  --id merchant-review-001 --request-id export:merchant-review-001 \
  --revision ACTUAL_REVISION --actor "Original operator" \
  --title "Merchant settlement review"
~~~

The explicit custody transfer is:

~~~sh
starforge rozo-payments handover \
  --workspace /private/merchant/rozo \
  --config /private/merchant/rozo-connections.json \
  --id merchant-handover-001 --request-id handover:merchant-001 \
  --revision ACTUAL_REVISION --actor "Original operator" \
  --title "Complete merchant operations handover"
~~~

When source is run from a retained checkout, supply --source-root, --source-manifest and optionally --source-sha256. Source-root is the repository root, while the manifest is the product's INSTALLED_SOURCE.json. Use --python or ROZO_PYTHON when the host's Python executable is not named python3.

The resulting delivery descriptor includes deliveryId, workspaceId, originId, revision, mode, original requestId, archive bytes/SHA-256, manifest SHA-256, name and local path. The native files are:

~~~text
<workspace>/deliveries/<deliveryId>/Rozo_Workspace.zip
<workspace>/deliveries/<deliveryId>/EXPORT.json
<workspace>/deliveries/<deliveryId>/contents/DELIVERY.json
~~~

Download through the original archive button or retain those completed files with their exact hashes.

## Interrupted export and handover

The original seal can be accepted before archive assembly finishes. An error at that point is a pending delivery, not permission to open a new owner or issue another handover. The original request, source manifest and configuration bytes remain its binding.

Resume the same request:

~~~sh
starforge rozo-payments resume --workspace /private/merchant/rozo \
  --config /private/merchant/rozo-connections.json \
  --request-id handover:merchant-001
~~~

Resume retains completed members and the original checkpoint. A different pre-existing member or changed source/configuration stops with an explicit conflict. Restore the original bound source/configuration before continuing; never edit accepted delivery members to make their hashes fit. A subsequent working snapshot is a new explicit export, while the prior accepted snapshot remains retained.

## Receive the exact archive

Review mode:

~~~sh
starforge rozo-payments receive \
  --archive /private/incoming/Rozo_Workspace.zip \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --directory /private/received/merchant-001
~~~

Receiving rejects traversal paths, symlinks, duplicate or unlisted archive members, missing members and changed file hashes. It verifies the complete source declaration and original SQLite workspace/export request. The result returns actual sourceRoot, workspaceDirectory, configuration and cli paths.

The complete extracted layout is:

~~~text
DELIVERY.json
RECEIVED_ARCHIVE.json
source/<original repository-relative application paths>
workspace/workspace.json
workspace/RECEIVING.json
workspace/rozo.sqlite3
workspace/cli-requests/...
workspace/native/...
configuration/original.json
configuration/received-template.json
configuration/connections.json
publishers/<original alias>/...
runtimes/<original alias>/...
~~~

Working copies are protected by the receiving marker even if a copied old lease appears free. Read the received state using the returned CLI and workspace paths; do not initialize or manufacture a new workspace over it.

## Activate a sealed handover

Only mode handover supports activation:

~~~sh
starforge rozo-payments receive \
  --archive /private/incoming/Rozo_Workspace.zip \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --directory /private/received/merchant-001 \
  --activate --request-id receive:merchant-001 --actor "Receiving operator"
~~~

This verifies the original seal, records an immutable receiving action with the archive/manifest identity, retains the copied original lease rows in custody, clears only those copied leases and creates the received active-control edition. Workspace ID, origin ID, original business records and original request histories are preserved. The revision advances by the single explicit receiving action. Repeating the same activation returns its original accepted result.

Start the returned CLI with the returned workspace/configuration. Supply the same credential environment-variable names through the receiving host's existing private environment. The old sender remains sealed.

## Maintained native operation

Run the product's exact full native receiving command:

~~~sh
starforge rozo-payments native \
  --directory /private/rozo-native/original-operation \
  --source-root /original/repository \
  --source-manifest /original/repository/stellar/scf-starforge-20261009/sf30-seller-sdk/rozo-payments/INSTALLED_SOURCE.json \
  --chromium /actual/installed/chromium \
  --playwright-module /actual/installed/playwright/index.mjs \
  --python /actual/python3
~~~

The fixed operation is ROZO-MERCHANT-SETTLEMENT-COMMISSIONING-20261012. Always reuse its saved directory after interruption. Native progress retains the original workspace, every request body, source editions and each completed phase. An unavailable browser produces a pending result before working export/handover; supply the actual browser runtime and continue that same directory.

The native flow performs:

1. Receive all original Checkout source; create original profiles/orders in the owned development workspace.
2. Accept a keyed create in the local merchant fixture, lose its response, and recover by original app/order lookup without another create.
3. Capture 106 payments through complete pagination, including failed/expired/refunded states.
4. Receive signed, duplicate, older and conflicting callback bodies while preserving raw bytes and stage meanings.
5. Save source-based correction/fulfilment and immutable reports, compare them and verify every original report file.
6. Exercise recurring catch-up and pause it through original requests.
7. Invoke the actual Checkout publisher quote/create/status/resume code. Recover the deliberately lost create response using actual original invoice/payment IDs.
8. Operate all seven staff views in one real browser context, edit through the actual form, lose the accepted response, reload and recover the same request, inspect history, download originals and capture desktop/mobile views.
9. Export and receive a complete working snapshot, proving it cannot become a writable owner.
10. Drain/seal/export the original handover, close its operator and execute receiving from the extracted application in a separate Node process.
11. Compare all original records, editions, requests, attempts, raw objects, observations, callbacks and audit rows across receiving; permit only the single explicit activation additions.

The fixture is labelled DEVELOPMENT. It preserves original publisher fixture bytes and records the explicit local timestamp/expiry derivations. It makes no real provider payment or signed transaction. Common SDK live operations and deployed Stellar RPC decoding remain separate configured profiles whose actual execution requires their selected native runtimes and account/deployment inputs.

## Completion and portable continuation

The operation writes NATIVE_PROGRESS.json, exact browser progress/downloads/screenshots, RECEIVING_PROCESS.json and NATIVE_COMPLETION.json. The received application writes NATIVE_RECEIVE_RESULT.json and its accepted activation. Source editions, provider fixture and full workspace remain alongside the original operation.

Only NATIVE_COMPLETION.json with all phases and actual separate receiving result is complete. A prepared source packet, grammar pass or pending browser state is a different milestone.

Move a stopped operation as a whole when changing equipped hosts: retain all files and empty directories, original source editions, provider fixture state, SQLite state, native/CLI requests and progress. Preserve original endpoint/case bindings and reconcile the actual old process/lease before continuing. Local and equipped receivers run this same source and operation; do not start a competing job.
