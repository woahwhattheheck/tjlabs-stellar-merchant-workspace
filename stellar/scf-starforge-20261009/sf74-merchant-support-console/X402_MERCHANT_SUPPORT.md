# Merchant payment and delivery support

Use the existing Merchant Support console to monitor a running x402api merchant, retain an operational incident, assign the next action and deliver the complete before/after Support case.

The merchant remains the owner of its orders, signatures, receipts and fulfillment. The monitor reads its authenticated operational snapshot. The existing SF93 watcher owns incident acknowledgment and notification history; the existing SF74 CaseStore owns customer case revisions and portable handovers.

## Open the workflow

1. Start the original merchant through its existing application or server command, using its existing private workspace and operator credential.
2. Review that owner's observation endpoint with the command below.
3. Register the reviewed identity in the original incident store or the Support console's private source configuration.
4. Open **Incidents**, inspect the registered merchant and apply the reviewed selection to the existing watcher draft.
5. Start the existing watcher. Review its complete source coverage and separate receipt/output counts.
6. Open an actual incident, record the responsible operator and next action, then use the existing **Prepare case** action.
7. Retain a later original capture, review the outcome and download the readable report and complete Support handoff.
8. Open the complete handoff as a new case in the receiving console. Its original sources, hashes, notes and before/after mapping travel together.

A healthy merchant can also be reviewed by attaching its original two-file observation in **Runtime support**. Use an actual retained incident when demonstrating the incident-to-case path.

## Review the actual merchant

The new native route is:

    GET http://127.0.0.1:ACTUAL_PORT/api/observation

It uses the merchant server's existing Bearer operator authentication and origin policy. Use the actual port. The collector accepts only that exact IPv4 loopback route, with no redirect, user information, query or fragment.

    node stellar/scf-starforge-20261009/sf93-seller-support-bundle/incident-cli.mjs \
      review-x402 \
      --endpoint http://127.0.0.1:ACTUAL_PORT/api/observation \
      --token-env MERCHANT_OPERATOR_TOKEN \
      --timeout-ms 5000 \
      --payment-after-seconds 300 \
      --output-after-seconds 300

The command returns a reviewed x402 selection containing the actual store ID, tenant ID, resource version ID and configuration SHA-256. Keep that returned selection intact. Credential values stay in the existing process environment; source files and customer handovers carry only the environment-variable name.

The request runs one bounded GET. The endpoint reads the original live owner's SQLite transaction synchronously and releases it before responding. It does not open another MerchantStore, start another owner, call an upstream payment API, invoke reconciliation or run fulfillment.

### Watcher registration

Add one merchant entry to an existing private SF93 configuration:

    {
      "id": "merchant-payments",
      "label": "Merchant payment and delivery",
      "x402": {
        "endpoint": "http://127.0.0.1:ACTUAL_PORT/api/observation",
        "tokenEnv": "MERCHANT_OPERATOR_TOKEN",
        "storeId": "COPY_FROM_REVIEW",
        "tenantId": "COPY_FROM_REVIEW",
        "resourceVersionId": "COPY_FROM_REVIEW",
        "configurationSha256": "COPY_FROM_REVIEW",
        "timeoutMs": 5000,
        "paymentAfterSeconds": 300,
        "outputAfterSeconds": 300
      }
    }

This illustrates the fields. The original review supplies the required UUIDs and digest.

Keep the existing poll, debounce, recovery and retention settings. A merchant selects exactly one observation kind; x402 cannot share an entry with seller, Object, CKAN or OAuth settings.

The existing commands remain:

    support-watch configure --state PRIVATE_STORE --config PRIVATE_CONFIG --config-revision CURRENT_REVISION
    support-watch run --state PRIVATE_STORE
    support-watch status --state PRIVATE_STORE --details

When invoking source directly, substitute the full incident-cli.mjs path for support-watch.

### Named source in the Support console

The private incidentSources file can declare x402Merchants on an existing incident-source entry:

    "x402Merchants": [
      {
        "id": "merchant-payments",
        "label": "Merchant payment and delivery",
        "x402": { "...": "the complete actual reviewed selection above" }
      }
    ]

Existing merchants[].x402 registrations also populate the named list, including after the original incident-store recovery flow. The managed Application selection retains these exact registered identities.

The browser selects a registered alias. It can adjust timeout and age thresholds, then inspect the original source. It cannot supply another endpoint or a credential value. Inspection rechecks the watcher revision and original merchant identity after the read. Editing a field or receiving a late response invalidates the earlier review. **Add or replace source in draft** edits only the current configuration draft; the existing Apply action commits it.

## Read the operational evidence

Each accepted snapshot has complete bounded metadata from the original store:

- Every order's original identity, state, frozen rail terms, charge-request descriptor, recorded receipt-verification result and safe error code.
- Every retained order-history transition, sequence, timestamp, selected state and original row digest.
- Every provider-exchange descriptor, HTTP status, completeness flag, size, digest and safe error code.
- Every webhook descriptor, delivery ID, state and safe recorded error.
- Every fulfillment's original payment/order binding, attempt, state, returned-byte descriptor and saved-result descriptor.
- The live owner-runtime identity, store identity, source configuration digest and snapshot times.

Source BLOBs, wallet signatures, bearer tokens, webhook bodies, provider response bodies and result bytes are excluded. Their descriptors remain available where the original schema retains them. The endpoint is an operational metadata export; the merchant's complete portable workspace preserves the original payloads.

Both original capture files are required:

| File | Contents |
| --- | --- |
| x402-observation.json | Reviewed registration, collector times, exact source byte count/SHA-256 and recomputed operational summary. |
| x402-source.json | Exact merchant snapshot JSON bytes, or JSON null with an explicit failed-read reason in the metadata. |

Each file is limited to 8 MiB. The endpoint additionally limits total projected rows to 100,000 and measures rows before accumulating them. If the complete projection exceeds either bound, it reports a workload limit. Select an appropriately sized operational workspace with its owner or extend the native source contract explicitly.

The existing SF93 capture wrapper allows up to 36 MiB including base64 overhead. Its retention budget still applies. An unavailable source or exhausted capture storage remains visible.

Latest incident-list status keeps compact counts and source identity. Full order rows remain in the immutable capture and are paged in the incident detail and Support case. Complete exported HTML includes all original order rows.

## Keep receipts and output distinct

**Recorded verified receipt** means the original merchant retained successful verification of the receipt's Ed25519 signature, independently pinned key, payment identity and frozen terms. The monitor does not re-run that verification or query a ledger.

**Recorded complete result** means the original fulfillment is marked COMPLETE and retains both a returned-byte descriptor and a saved-result descriptor. The adjacent contradiction checks identify any disagreement in payment identity, byte count or SHA-256. The monitor does not reopen or hash the customer result file.

A provider HTTP 200, a settlement-related order state or a finalized event alone does not establish a verified receipt. A verified receipt alone does not establish delivered output. Counts remain order counts; amounts on different assets or networks are never added together.

A fulfillment can be complete just before the owner commits the order's COMPLETE projection. That short state is shown as **Order projection pending**.

## Interpret age and incidents

Unresolved age begins at the original transition that starts the current unresolved episode. The classifier replays the retained original state, signature and receipt markers. Successful charge creation returns an unsigned order to AWAITING_PAYMENT and ends the earlier charge episode. If authorization is supplied later, its original retained signature begins the new unresolved episode. Repeated original retries preserve that episode's first timestamp.

Output-wait age begins at the original retained receipt-verification transition. Poll times, updated_at values and owner restarts do not replace the original start. Missing or future timestamps produce unknown age.

| Condition | Operator action |
| --- | --- |
| Source unavailable | Check the registered owner, environment reference, read deadline and complete source coverage. Retain the failed capture. |
| Identity changed | Have the original merchant owner review the store, tenant, resource version and configuration before updating the registration. |
| Payment unresolved | Reconcile the existing order and original provider history through its merchant owner, retaining the same payment identity. |
| Verified receipt awaiting output | Inspect the original fulfillment and resume its existing delivery/recovery operation. |
| Fulfillment interrupted | Inspect its original owner-runtime and reconciliation record; keep the original fulfillment identity. |
| Result contradiction | Reconcile receipt/payment bindings and the recorded returned/result descriptors before accepting completion. |
| Authority rejected | Review the original receipt/signature or term-binding failure. Keep its verification requirements in force. |

A later verified receipt can resolve an earlier authority rejection. The original rejected webhook remains in the full history and rejection-record count.

Source reads honor an original Retry-After deadline and reject redirects. Missing, stale, changed or incomplete source data cannot produce a healthy recovery poll. Each accepted poll retains the count and canonical SHA-256 of its complete immutable history and exchange prefixes in the watcher checkpoint. A later source must preserve those original rows before it can establish recovery; preserving only the final history row is insufficient. Earlier watcher checkpoints keep their original last-row boundary and acquire complete prefix witnesses on the next accepted observation. The original capture files, summaries and v1 handoff format stay unchanged.

The existing SF93 model owns failure streaks, recovery streaks, acknowledgment, notification queues, reminders and shutdown. Configure its original notification destination only when its operator has authorized delivery.

## Deliver and receive a customer case

For an actual incident, the existing **Prepare case** action attaches its original before/after capture files. Select the registered source's GET mapping in the existing case. Record the affected order, owner, next action, follow-up and explanatory notes using the original case editor.

The comparison requires matching reviewed source selection, chronological complete captures and preservation of earlier immutable history/exchange rows. It shows changed original order views with receipt and result outcomes independently. A difference in observations does not establish that a particular repair caused it.

Use **Download readable support report** for the complete frozen HTML report. Use **Download complete support handoff** for the original stellar-forge.merchant-support-handoff.v1 packet. Its existing workspace/runtime formats, source hashes and metadata remain unchanged.

Receiving uses the existing **Open handoff as new case** action and original CaseStore. Retain a stable receiving case ID for any automated consumer and reconcile a committed matching write before repeating it. A later edited case keeps its own history.

The original support-watch snapshot, receive-snapshot and Recovery controls also carry the new capture kind with all original files. Pending notification delivery remains held under the existing recovery policy until explicitly reconciled.

## Source and operating closure

The merchant native API, original SF93 collector/codec and watcher joins, existing SF74 runtime parser/compare/export, Incident registration, Runtime Support intake, managed selection and browser assets form one source edition.

The x402 merchant contribution exports the native observation API and original incident source/codec. The distribution's existing SF93/SF74 components include their complete original source and assets.

An original-source acceptance run uses the actual owner endpoint and retained workspace. Record the source revision, actual source identity, capture bytes/hashes, original incident/case IDs, unchanged payment/fulfillment counts, original handoff digest and cold received case. Source parsing establishes syntax only. A customer/browser run is complete only when those actual results have been retained.
