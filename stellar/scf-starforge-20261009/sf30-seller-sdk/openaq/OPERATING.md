# Operating a complete OpenAQ study

## Original project and private inputs

Use one initialized private project (0700) and private regular JSON input/config files (0600). Configuration is immutable. Select the customer/team, purpose, optional API environment/account reference and optional independently owned DuckDB customer before initialization.

The browser provides all project stages. The CLI uses the same domain operations; it adds no independent store. Installed command names below can also be run as node cli.mjs from the complete original source tree.

## Capture and saved monitoring plans

Archive input includes requestId plus the exact plan and metadata context objects:

~~~json
{
  "requestId": "ONE_ACTUAL_UUID",
  "plan": {
    "mode": "archive",
    "locationId": 2178,
    "label": "Del Norte — May 3, 2022",
    "purpose": "Review the original local-day source observations.",
    "sensorIds": [],
    "dates": ["2022-05-03"],
    "maxRows": 250000
  },
  "context": {}
}
~~~

Replace context with the complete examples/archive-context.json object or your actual reviewed source context. It includes kind, observedAt, note, location and named HTTPS sources. A sensor filter selects projected rows but retains the entire original archive response.

API plans replace dates with resolution (measurements, hours or days), datetimeFrom and datetimeTo with explicit offsets, pageSize up to 1000 and maxPages up to 1000. The plan requires selected sensorIds and a positive period no longer than 366 days. API metadata comes from actual responses; the key is only a host environment reference.

A source capture is published only after the full selected archive/page set is complete. Page/row bounds fail the full capture rather than emitting a shortened accepted table.

To save a reusable study, study.save accepts id, expectedRevision (null for a new study), name, purpose and plan. It returns version/revision. A capture may include study:{id,revision}; the exact retained plan/revision is checked before dispatch. Revising a future study plan does not edit an earlier capture.

## One original request and its recovery

~~~sh
starforge openaq action --connection /absolute/private/study/connection.json --action capture --input /absolute/private/capture.json
starforge openaq read --connection /absolute/private/study/connection.json --action operation --input /absolute/private/id.json
starforge openaq resume --connection /absolute/private/study/connection.json --request ORIGINAL_UUID
~~~

The ID read file is {"id":"ORIGINAL_UUID"}. Read action request for the complete reviewed input and earlier attempts. Repeating action with the same UUID and identical payload reads the original operation. A changed payload under that UUID is refused. A new capture UUID explicitly records another source edition.

After a lost response, read the same operation first. If it is absent, send the exact retained request. For a saved FAILED or INTERRUPTED outcome, explicitly resume the same UUID. Completed GET receipts reopen without HTTP; incomplete original GETs may be retried with earlier attempts retained. No payment, provider write or customer mutation is inferred safe to repeat.

The browser saves UUID/input before sending and provides an Operations reconciliation action. Its server record owns the outcome. Background polling does not start a new capture.

Offline run opens the same native lock and waits:

~~~sh
starforge openaq run --workspace /absolute/private/study --action capture --input /absolute/private/capture.json
~~~

It refuses a second live project owner. Use online resume or the programmatic workspace.resume for a saved interrupted request; repeating offline run alone does not silently resume an old failed operation.

## Source review and report

Review fields are captureId, captureSha256, reviewer, decision (accepted, revise, context_only), note, attribution, rightsBasis, rightsSources (HTTPS list) and allowDerivedDelivery Boolean. Review is bound to the exact completed capture.

Reports allow accepted or context-only source reviews. Dataset publication and selected outward project delivery require accepted derived delivery. Retained restrictive license flags are not silently overwritten.

Report input contains matching captureIds/reviewIds arrays, title, purpose, reviewer, note, includeMean and excludeFlagged. Series remain separate by capture, station, sensor, parameter, unit, resolution and interval. Source-flagged exclusion affects only numeric summaries; all rows remain in the retained source.

Report outputs are machine-readable report.json and self-contained printable report.html. Browser printing can produce a local PDF; the application retains HTML as its original report artifact.

## Original publisher and merchant release

| Project operation | Exact important fields / result |
|---|---|
| publication.prepare | captureId, sourceReviewId. Request UUID becomes native extraction run ID. Nested publication is the original run record. |
| publication.inspect (read) | Source pair, runId, query. Original candidate and query contract remain authoritative. |
| publication.review | Source pair, runId, reviewer, note; initialize:true for new target, otherwise expectedSnapshot and integer expectedRevision. Returned native review is result.data.review.id. |
| publication.publish | Source pair, runId, publicationReviewId from that actual native review. |
| publication.recover | Same source pair and runId after uncertain native publication. |
| release.prepare | Published source pair/runId, actual public origin, path, payment declaration. Returns an original SF82 prepared package. |
| release.stage | Saved preparationId, operator id/label and original runtime settings. Returns an original SF82 staged release. |

A later dataset refresh requires the original running target's current snapshot/revision and unchanged query contract. Use the returned native state; a completed wrapper result is not automatically PUBLISHED.

Payment fields are the original SF30 scheme, network, asset, amount, payTo and optional maxTimeoutSeconds. Supply real public seller terms; no wallet secrets or fabricated recipient are accepted. Preparing/staging does not pay or start a seller. The project's original release-store is used by Merchant Releases for inspect, activation, supervision, stop and rollback.

## Original local customer

Use the browser's **Open full original customer workflow** button. It opens the project-owned original receiving browser; the selected DuckDB customer service retains its independent owner.

customer.start takes the source pair, kind and original arguments. For kind prepare:

~~~json
{
  "runId": "PUBLISHED_RUN_UUID",
  "reviewId": "ORIGINAL_PUBLISHER_REVIEW_UUID",
  "candidateDigest": "EXACT_CANDIDATE_DIGEST",
  "query": "limit=100",
  "reviewer": "Named receiving operator",
  "note": "Actual selected customer purpose"
}
~~~

The outer request UUID is passed to the original receiver. Continue the returned original deliveryId with kind continue and arguments:{deliveryId}; the native receiver follows every selected page. The original customer UI assists source mapping, import, saved query/analysis, report and collection/package operations. Typed calls use kind customer with the original operation and arguments; package uses the original package inputs.

Read customer.status, customer.operation or customer.read. customer.resume names the original operationId. Inspect the nested native state even if the outer wrapper completed. A local import/report is not a Stellar payment receipt.

## Full project export, transfer and receiving

Export chooses captureIds, matching accepted reviewIds and reportIds. Every included report must have all of its selected sources in the delivery. The result returns file, bytes, sha256, manifestSha256 and original source IDs. It contains complete original response bytes/receipts, projected rows, metadata, reviews and reports.

Download through the existing retained-transfer engine:

~~~sh
starforge openaq download --connection /absolute/private/study/connection.json --export EXPORT_UUID --directory /absolute/private/project-transfer
~~~

Rerun the same export/directory command after interruption. Native read handles, full file identity, offsets, private checkpoints, hashing and final no-replace publication are owned by the original retained-download implementation.

Receive the original archive into another project:

~~~sh
starforge openaq receive --workspace /absolute/private/received-study --config /absolute/private/receiving-project.json --archive /absolute/private/project-transfer/OpenAQ_Project_EXPORT_UUID.tgz --sha256 ORIGINAL_ARCHIVE_SHA256 --request RECEIVING_UUID
starforge openaq serve --workspace /absolute/private/received-study --port 0
~~~

The original Frictionless receiver checks the complete bundle; the project checks every selected logical member and source capture identity. A resumed receiving operation uses its original UUID/input. Reopening also rechecks the copied selected members. Different bytes under an existing ID are refused. The receiving config is local to the recipient; no provider credential or old connection token is copied.

The browser supports full archive upload with the sender's exact digest. Prefer a separately initialized receiving project. CLI downloading avoids buffering a large artifact in browser memory.

## Shutdown and complete history

Applications Stop or SIGTERM closes only the original host's listener and project. Accepted work drains; owned source/export can pause; original publisher/customer handles close independently. Agent disconnect does not own that process.

Reopen the same project after interruption, inspect the original ID and explicitly resume if appropriate. Exact-ID reads cover the full history; visible paging does not impose a retention limit.

Selected scientific/source delivery is the complete project archive. Existing merchant/customer backup commands remain authoritative for their independent operating state; a copy of a live private directory is not promoted to a complete backup.
