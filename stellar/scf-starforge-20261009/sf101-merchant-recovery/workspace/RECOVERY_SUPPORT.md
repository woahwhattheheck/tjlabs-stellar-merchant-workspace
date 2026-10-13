# Recovery operations in an existing Support case

The SF101 workspace can capture one saved standalone Object recovery request into an existing SF74 Support case. It preserves the byte-exact request, its original reviewed selection, every referenced immutable native evidence file, and the ordered evidence history. The operator chooses the existing case revision and its before or after observation slot.

This is a saved recovery observation. Opening it does not acquire buyer data, inspect current Object state, dispatch a recovery command, evaluate a payment, or send a notification. A failed or interrupted native result remains a failed or interrupted result in Support. The interface shows the actual SF101 attempt count separately from unique evidence files and ordered evidence-history entries.

## Host configuration

Add the optional Support paths to the existing recovery profile. The host selects these paths; browser, CLI attachment, and MCP tool arguments only select profile, original request, case, revision, slot, and transfer IDs.

~~~json
{
  "casesDirectory": "/srv/starforge/private/merchant-cases",
  "caseSourceDirectory": "/srv/starforge/private/case-source-delivery"
}
~~~

These are additional fields inside an existing profile, not a complete replacement configuration. Retain its existing Object declarations, original operations directory, bundle roots and passphrase environment name. The case directory must already exist, be private and canonical, and contain the original Support cases. Its path must not overlap recovery controls or the selected Object source or bundle. The optional source-delivery directory must be the existing original service directory for genuine attached SF49 source editions.

A profile without casesDirectory keeps all existing recovery behavior and does not show the new Support panel. Cases without native source attachments can export without caseSourceDirectory. If a saved case references a native source edition, full export requires the actual original delivery directory and complete native bundle; it does not skip missing attachments.

Launch the existing workspace in the usual way:

~~~sh
starforge merchant-recovery-remote workspace serve \
  --config /srv/starforge/private/recovery-host.json \
  --directory /srv/starforge/private/recovery-workspace
~~~

All following CLI commands attach to that original verified listener. They do not open a second recovery owner.

## Browser workflow

1. In **Send recovery evidence to Support**, choose a saved original Object recovery request. The list shows its saved phase and actual attempt count. A request actively running in this workspace cannot be captured.
2. Choose an existing Support case and its current revision. The refresh and paging controls use the original case store.
3. Choose **Before** or **After**. A populated slot is replaced only in a new case revision; earlier observations remain in the case’s original history.
4. Choose a stable lowercase transfer ID and select **Review complete capture**. The producer freezes the complete original selection and request before publishing the review.
5. Inspect the request digest, evidence inventory, actual native session, original case revision, slot and external backup identity. Confirm that exact displayed review.
6. Select **Save reviewed case**. The original case store compares the selected revision and saves through its existing writer. A concurrent case edit produces the original case conflict instead of replacing that edit.
7. Open the retained transfer again, download its complete Support handoff, or export the whole original case and history. Support’s existing runtime viewer recognizes **RECOVERY_OPERATION** and displays native results and evidence without inventing HTTP traffic counters.

Refreshing the form or selecting another request, case, slot or transfer invalidates its confirmation. A completed frozen review remains a record of its original capture time even when the source request later advances. Use a new transfer ID for a new capture.

The before/after comparison requires the same workspace, profile, request, review and native declaration before interpreting the records as one operation. A later observation must retain the earlier evidence set and original creation identity. Independent operations and different observation kinds remain separate.

## Exact CLI and MCP selections

List existing cases and read the source request:

~~~sh
starforge merchant-recovery-remote workspace support-cases \
  --config /srv/starforge/private/recovery-host.json \
  --directory /srv/starforge/private/recovery-workspace \
  --profile original

starforge merchant-recovery-remote workspace request \
  --config /srv/starforge/private/recovery-host.json \
  --directory /srv/starforge/private/recovery-workspace \
  --profile original --id object-restore-01
~~~

Create a private selection file using the actual returned IDs, hashes and attempt count:

~~~json
{
  "profileId": "original",
  "id": "object-restore-01",
  "transferId": "object-restore-support-01",
  "caseId": "00000000-0000-4000-8000-000000000001",
  "expectedRevision": "ACTUAL_64_HEX_CASE_REVISION",
  "slot": "after",
  "expectedReviewHash": "ACTUAL_ORIGINAL_REQUEST_REVIEW_HASH",
  "afterAttempt": 1
}
~~~

The example UUID, hashes and attempt count are placeholders. The current original request and case supply them.

~~~sh
starforge merchant-recovery-remote workspace support-review \
  --config /srv/starforge/private/recovery-host.json \
  --directory /srv/starforge/private/recovery-workspace \
  --selection /srv/starforge/private/support-selection.json

starforge merchant-recovery-remote workspace support-save \
  --config /srv/starforge/private/recovery-host.json \
  --directory /srv/starforge/private/recovery-workspace \
  --profile original --transfer-id object-restore-support-01 \
  --expected-support-review ACTUAL_REVIEW_SHA256

starforge merchant-recovery-remote workspace support-transfer \
  --config /srv/starforge/private/recovery-host.json \
  --directory /srv/starforge/private/recovery-workspace \
  --profile original --transfer-id object-restore-support-01
~~~

The agent tools use the same listener and schema:

| Tool | Input beyond the configured workspace alias |
| --- | --- |
| merchant_recovery_support_cases | profileId; optional q, offset, limit |
| merchant_recovery_support_transfers | profileId |
| merchant_recovery_support_transfer | profileId, transferId |
| merchant_recovery_support_review | selection with all eight fields shown above |
| merchant_recovery_support_save | profileId, transferId, expectedReviewSha256 |
| merchant_recovery_support_handoff | profileId, transferId |
| merchant_recovery_support_export | profileId, transferId, expectedReviewSha256 |
| merchant_recovery_support_package | profileId, transferId |

The handoff read returns complete content, byte length, SHA-256 and the original case ID/revision. The browser verifies its complete byte/hash identity before downloading it. The whole package is exported to the original private transfer directory and is inspected by the existing source-package engine.

## Interrupted preparation or save

Each transfer stores its original selection, exact request, content-addressed evidence, capture time, original workspace/metadata, full new runtime support text and final review under the existing workspace’s support-transfers directory. The review is published only after all source bytes are retained. Missing or oversized evidence is an error; the producer never truncates it.

If preparation stops before review publication, **Open original transfer** returns its complete frozen selection. Continuing uses that selection and any already-retained original bytes. It cannot silently substitute a later request attempt. If the original source required for the selected capture is no longer available, preserve that transfer and select a new ID for a newly reviewed capture.

Before the case writer is invoked, the exact save selection is retained. A lost save response does not trigger automatic resubmission. Read the same transfer first. On an explicit same-transfer save, the producer follows the original immutable case history and matches the prepared workspace, normalized metadata, complete support text and selected previous revision. If that original save exists behind later edits, its result is returned and the current case head is preserved. A genuinely conflicting case head remains a conflict.

The transfer list reads small immutable review/result metadata and labels saved rows **SAVED_RECORDED**. It does not repeatedly decode every large source capture or claim that each case was freshly reopened. Opening a transfer, saving, downloading or exporting performs the complete source and native case checks. Unreadable retained records are shown as unreadable, not as absent work.

Closing the workspace rejects new work, aborts owned in-progress export stages, drains the complete producer and original source-service operations, and releases its original writer only after that cleanup. A case save already executing remains owned through its returned outcome.

## Complete handover and independent reopening

The small downloadable merchant-support.json uses the existing Support handoff schema. It preserves the exact workspace and runtime support strings, including all original request/evidence bytes in the selected captures.

For the selected case plus its complete original history, use the whole export:

~~~sh
starforge merchant-recovery-remote workspace support-export \
  --config /srv/starforge/private/recovery-host.json \
  --directory /srv/starforge/private/recovery-workspace \
  --profile original --transfer-id object-restore-support-01 \
  --expected-support-review ACTUAL_REVIEW_SHA256
~~~

The result identifies the complete private package directory and manifest SHA-256. Transfer all manifest-declared files and case-source-package.json together. The existing exporter preserves the selected case revision, every captured original case revision, exact request/evidence captures, readable Support report and any actual attached native SF49 source archives. Its generation time and original selection stay fixed across same-package continuation.

Receive on an independent installed application through the maintained Support workflow:

~~~sh
starforge merchant-implementation inspect-package \
  --from /srv/starforge/private/incoming/recovery-support-01 \
  --sha256 ACTUAL_COMPLETE_MANIFEST_SHA256

starforge merchant-implementation receive-package \
  --from /srv/starforge/private/incoming/recovery-support-01 \
  --sha256 ACTUAL_COMPLETE_MANIFEST_SHA256 \
  --out /srv/starforge/private/receiving/recovery-support-01 \
  --cases-dir /srv/starforge/private/received-cases \
  --source-dir /srv/starforge/private/received-sources \
  --request-id receive-recovery-support-01 \
  --actor "Receiving operator"
~~~

Use the actual sender manifest, original receiving ID and the receiver’s private directories. The maintained receiver verifies the complete inventory, imports through the original Support downloader/reopener, preserves the original case history, and records a local receiving case identity. Repeating that same receiving request reopens its retained result while preserving later local case edits. See the adjacent SF74 [complete source-package guide](../../sf74-merchant-support-console/CASE_SOURCE_PACKAGE.md) for the full original transfer and receiving contract.

### Encrypted backup custody

The three text files are recovery-observation.json, recovery-request.json and recovery-evidence.ndjson. Their native bundle descriptor is explicitly EXTERNAL_NATIVE_BUNDLE. A retained path or record digest is not evidence that encrypted files are present in the Support package.

The original encrypted bundle must travel through its actual native backup/source-delivery custody. It is included in a full case-source package only when that case genuinely references a native SF49 source edition whose declared inventory contains those bytes; the existing exporter then requires and verifies that complete archive. This integration does not manufacture a source edition, buyer event, payment, commissioned workorder, restore result or secret. A receiving operator uses the original recovery engine, actual encrypted bytes and owner-authorized secret for any later restore.

## Source packaging

Install the full maintained application. The new workspace/recovery-support.mjs imports the original case store, runtime parser, pure recovery-runtime.mjs, source package engine and source-delivery factory. The browser asset registry includes recovery-support-desk.mjs. An explicit source-selection exporter must follow these literal imports and include both new backend files and the browser asset; copying only model.mjs or the desk is incomplete.

Existing managed snapshot, transfer, fleet, publisher, standalone recovery and Support source-edition flows remain selected through their original engines and identities.
