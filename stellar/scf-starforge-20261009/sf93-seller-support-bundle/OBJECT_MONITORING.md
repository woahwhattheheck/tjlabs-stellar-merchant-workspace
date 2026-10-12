# Saved Object buyers in the original incident and Support workspace

This extension connects a saved SF88 ObjectSession to the existing SF93 watcher and SF74 merchant case workspace. The operator reviews the original session identity, starts the existing watcher, acknowledges an incident, and opens the complete retained observation in the same Support case. Complete case export and reopen preserve the original native request views and byte checks.

The watcher only reads the saved buyer. It never purchases a chunk, starts an acquisition, assembles an output, finalizes a reservation, releases a payment or changes the buyer's ledger. Existing SF93 notification configuration and delivery controls continue to apply.

## Review the original session

Use the installed edition containing this extension, or run its original incident CLI from the checkout:

```sh
node stellar/scf-starforge-20261009/sf93-seller-support-bundle/incident-cli.mjs review-object \
  --session /absolute/private/original-object-session \
  --max-bytes 1073741824 --max-chunks 1000 --timeout-ms 30000 \
  --financial-after-seconds 300 --output-after-seconds 300
```

The result contains `object`, the exact normalized selection for an SF93 merchant registration, plus the inspected output, original terms, source URL and process observation. Review the original session ID, source intent, configuration SHA-256 and exact `session.json` SHA-256. An ordinary continued acquisition keeps that session binding; selecting a different buyer requires a new explicit configuration review.

The limits are receiving choices. `maxBytes` bounds the complete object size before chunk verification; `maxChunks` bounds the original request count; `timeoutMs` bounds the observation lifetime. The inspector hashes actual saved bytes using its original bounded buffer and checks cancellation between reads. Limits do not lower payment authorization or modify the original buyer. An observation that cannot cover the selected workload remains incomplete.

Each source is one original registration:

```js
const merchant = {
  id: "customer-object",
  label: "Customer data delivery",
  object: reviewedResult.object
};
```

Insert that full returned `object` into the existing private `stellar-forge.seller-watch-config.v1` document. Keep other merchant registrations and notification settings. An Object source cannot also contain seller/ops/delivery endpoint fields. The original watcher supports one to eight sources, including a mix of Object and existing seller sources.

For a new watcher, initialize its original store with that complete configuration. For an existing watcher, use its observed configuration revision:

```sh
node stellar/scf-starforge-20261009/sf93-seller-support-bundle/incident-cli.mjs init \
  --state /absolute/private/incident-store --config /absolute/private/watcher.json

node stellar/scf-starforge-20261009/sf93-seller-support-bundle/incident-cli.mjs configure \
  --state /absolute/private/incident-store --config /absolute/private/watcher.json \
  --config-revision 1
```

The first command is for a new store; the second is for an existing one. Use the actual current revision, not an assumed value. The existing configuration transaction preserves incidents, retires bindings changed by the review and retains already-queued notification destinations.

## Use Merchant support in Applications

Select the original **Merchant support** application, private case directory and incident source profiles. There is one existing console, one incident store and one watcher lease.

The private source profile can make an additional saved buyer selectable in the browser:

```json
{
  "schema": "stellar-forge.support-incident-sources.v1",
  "sources": [
    {
      "id": "operations",
      "label": "Customer operations",
      "directory": "/absolute/private/incident-store",
      "objectSessions": [
        {
          "id": "customer-object",
          "label": "Customer data delivery",
          "directory": "/absolute/private/original-object-session"
        }
      ]
    }
  ]
}
```

These example paths must be replaced by the original private directories. Existing trusted Object registrations in the incident store are also selectable when the console starts. The browser supplies a registered source ID; it cannot turn an arbitrary filesystem path into a new reading capability. New paths are selected through the private startup document or original local CLI, then reviewed by the managed application.

In **Watcher registration and notification settings**, select the registered Object, choose its observation limits and age thresholds, and click **Inspect saved Object**. The server reads the original buyer and checks the watcher configuration revision again after inspection. Changing the selection, limits or configuration invalidates that review.

Click **Add or replace source in draft**, inspect the resulting full configuration, then **Apply configuration**. Applying retains the exact reviewed Object identity and uses the original configuration revision check. It does not start a buyer. **Start watcher here** starts the existing SF93 watcher; **Stop this watcher** drains only the watcher owned by that console. Closing the console aborts its in-progress Object reads and drains its owned watcher.

The existing `support-console` command remains the direct startup path:

```sh
node stellar/scf-starforge-20261009/sf74-merchant-support-console/server.mjs \
  --cases-dir /absolute/private/cases \
  --incident-sources /absolute/private/incident-sources.json
```

A temporarily unavailable original Object remains an observable source condition. The managed selection binds its reviewed path and the original incident configuration; it does not initialize a replacement buyer to make startup succeed.

## What an observation establishes

One observation contains a complete native accounting view before verification, the original byte-verifying Object report, and a complete accounting view afterward. Every page and every original request entry is retained. Each before/after accounting page also binds the exact original session-file SHA-256, so a changed snapshot or saved selection cannot hide behind unchanged payment terms. Accounting changes across those reads produce `CHANGED_DURING_READ`; missing data, a deadline or a workload limit cannot be interpreted as a recovered payment or completed output.

| Field | Meaning |
| --- | --- |
| Finalized requests | Current per-request native `FINALIZED` or `IDEMPOTENT_FINALIZED` view recorded by the original job. It is a request count, not a monetary sum or a new ledger query. |
| Unresolved views | Other current attempted-request outcomes, including `NOT_FINALIZED`. Earlier `lastFinalized` remains history and cannot clear the current condition. |
| Not attempted | Original `NOT_ATTEMPTED` outcome. No attempted payment is inferred. |
| No payment required | Original `NO_PAYMENT_REQUIRED` outcome. It remains distinct from finalized paid requests. |
| Verified complete output | The original report verified every saved chunk and the complete object digest under the exact original session, configuration, ranges, snapshot, evidence and terms. |
| Process observation | Original lock/process information at inspection. It is separate from payment and output state. |
| Assembly receipt | Original recorded assembly history. The external assembled file is not revalidated by this watcher. |

The native `actualAtomicUnits`, receipt, completion time, request SHA-256, view status and earlier finalization data remain available per request. Their complete values are preserved. The monitor does not guess a currency, sum heterogeneous amounts or turn maximum authorizations into charges.

A poll applies only an observation captured within 30 seconds of application time, at most five seconds ahead of that clock, and later than the previous accepted capture for the same session. A slow source in the same sweep can therefore make an earlier capture stale. That complete old packet remains available as evidence, but it cannot advance a healthy streak, replace the last successful native observation or clear an incident.

A successful observation of an incomplete Object is a complete observation with incomplete output. It is not a successful delivery. A complete Object read during a changing accounting view remains unconfirmed for monitoring recovery until a coherent observation is available.

## Incident conditions and timing

| Existing watcher condition | Opens when | Clears through |
| --- | --- | --- |
| `OBJECT_SOURCE_UNAVAILABLE` | The source cannot supply a complete bounded observation for the configured failure-poll count. | Complete coherent observations under the original binding for the configured recovery-poll count. |
| `OBJECT_IDENTITY_CHANGED` | One confirmed mismatch in the selected manifest/configuration/intent or native binding. | Complete coherent observations matching the same reviewed binding. |
| `OBJECT_OUTPUT_INTEGRITY` | One confirmed native digest, range, snapshot, evidence or terms integrity failure. | Complete coherent observations without that integrity contradiction. |
| `OBJECT_FINANCIAL_UNRESOLVED` | A current unresolved request is at least `financialAfterSeconds` old for the configured failure-poll count. | Current coherent request views no longer satisfy the condition. |
| `OBJECT_FINALIZED_OUTPUT_INCOMPLETE` | A currently finalized request is at least `outputAfterSeconds` old while the selected object's output remains incomplete, for the configured failure-poll count. | Coherent verified complete output, or a coherent current financial view that no longer satisfies the condition. |

Unknown or invalid original timestamps remain unknown. The capture time is not substituted as a payment attempt time. A known aged request can open a condition even when another request's timestamp is unavailable; the unknown request cannot establish that all requests are below threshold. Future timestamps beyond the read tolerance do not provide an invented age.

Confirmed identity/integrity contradictions open immediately; the configured recovery-poll count still protects closure. The existing SF93 incident revision, acknowledgment, retention, notification queue, retry and cancellation semantics apply. Notification bodies use the original condition counts and source labels; the complete private capture is kept in the original incident store.

## Continue the incident in a Support case

Open the incident, review its before/follow-up Object facts and acknowledge who is handling it. The case handoff uses the **captured source ID**, not a new request or a new purchase. The source is represented as its original GET acquisition and explicitly mapped to the current case inputs.

Choose **Prepare incident case**. The existing server rereads the immutable capture files and validates their complete contents before building the original merchant support handoff. Review and download that handoff, then choose **Open prepared case** and save the case. The original source remains in the case rather than being replaced by a screenshot or a summary.

The Runtime support section also accepts the three original Object observation files directly:

- `object-observation.json`: reviewed selection, observation window, complete source hashes and recomputable summary.
- `object-report.json`: full original native Object report, or an explicit unavailable report.
- `object-accounting.json`: full before/after paginated native views, including unresolved current outcomes and earlier history.

Select **Saved Object buyer observation**, inspect all three files together and attach them to the chosen case position. Each file is bounded at 2 MB. A source too large for that format produces an explicit incomplete observation; it is never silently truncated into a successful capture.

The case presents current financial outcomes, verified output, process information, age thresholds, all original request entries, exact source identities and the native terms. A different case network/recipient or saved case scope remains visible as a mapping issue. A before/after comparison requires the same full reviewed Object selection and chronological observations. It does not subtract financial totals or claim a particular operator action caused recovery.

Use the existing complete Support handoff and saved-case exports. Fresh receiving can validate and review the three captured files without opening the old buyer path. Those paths are historical source lineage in the portable case. Live watching after relocation requires separately registering the actual original saved session at its supported location.

## Native API join

All console routes retain the original loopback/session-origin restrictions. The only new route is:

```
POST /api/incidents/:sourceId/inspect-object
```

Input is `{objectSourceId, expectedConfigRevision, maxBytes?, maxChunks?, timeoutMs?, financialAfterSeconds?, outputAfterSeconds?}`. It returns the exact original read-only review plus source ID and configuration revision. It neither writes the registration nor starts a watcher.

The existing configure/start/stop/ack/notify/case routes remain authoritative. The runtime inspect/review/export/import routes recognize `OBJECT_SESSION` through the three complete files, without adding a second case store or financial engine.

Source interfaces:

- `object-session.mjs: inspectObjectSession(directory, {signal?, maxBytes?, maxChunks?})` retains its original default behavior and adds bounded/cancellable read options, exact session-file SHA-256 and original attempt timestamps. The original read-only accounting pages also retain that session-file SHA-256.
- `object-source.mjs: reviewObjectSource(input, {signal?})` provides the explicit receiving review.
- `object-source.mjs: collectObjectObservation(merchant, signal)` supplies the existing SF93 sweep.
- `object-observation.mjs` validates and recomputes complete file observations and condition inputs.
- `object-runtime.mjs` renders those existing captures in SF74; it opens no source path and invokes no buyer.

This is source implementation and operating guidance. A particular customer, installed release or notification is complete only when its original native receiving result establishes that outcome.
