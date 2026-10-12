# CKAN publisher monitoring in the original Support workflow

This extension connects a private CKAN workbench to the existing SF93 incident watcher and SF74 merchant Support workspace. Each observation carries the selected original captures, complete change comparison, decision, candidate and merchant package. The original workbench retains its own writer and publication lifecycle.

## Review and register the real project

Run the matching source edition. The relative import below is from sf93-seller-support-bundle:

~~~js
import {reviewCkanSource} from './ckan-source.mjs';

const reviewed = await reviewCkanSource({
  directory: '/absolute/private/ckan-project',
  maxBytes: 4194304,
  maxFiles: 256,
  maxStateBytes: 2097152,
  timeoutMs: 30000,
  operationAfterSeconds: 300,
  reviewAfterSeconds: 86400,
  publicationAfterSeconds: 3600,
  requirePublication: true
});
const merchant = {id: 'svk-ckan', label: 'SVK capacity publication', ckan: reviewed.ckan};
~~~

Replace the example directory with the actual private workbench. Review the returned original catalogue origin, creation time, selected IDs and complete summary. Add the exact returned ckan object to the existing private stellar-forge.seller-watch-config.v1 document. Preserve peer registrations and notification settings. CKAN, Object and seller endpoint selections are mutually exclusive within one registration.

Optional sourceId, refreshId and publicationId select one related original workflow. Without sourceId, the explicitly selected refresh/publication supplies the source, or the latest source is used. Without refreshId, the latest refresh related to that source is used. An accepted successor is the effective source. Without publicationId, its latest publication is selected. Unrelated or absent explicit IDs fail review. A new workbench with no source can be observed completely with null source/publication fields.

Use the existing CLI and actual observed configuration revision:

~~~sh
node stellar/scf-starforge-20261009/sf93-seller-support-bundle/incident-cli.mjs init \
  --state /absolute/private/incident-store --config /absolute/private/watcher.json

node stellar/scf-starforge-20261009/sf93-seller-support-bundle/incident-cli.mjs configure \
  --state /absolute/private/incident-store --config /absolute/private/watcher.json \
  --config-revision CURRENT_OBSERVED_REVISION
~~~

Initialize only a new store; configure an existing one. The original transaction preserves incidents and notification history and retires changed reviewed bindings. The Support console's named CKAN review delegates reviewCkanSource and returns a draft selection for that same configuration transaction. Original watcher start/stop, acknowledgment and notification delivery remain authoritative.

## Complete original source observation

The collector checks canonical project containment, private directories/files, current owner UID, regular files and stable file identity. It reads:

1. Exact original workbench.json bytes before collection.
2. Original source declarations, selected edition manifests and every retained metadata, DataStore page and CSVW file.
3. The original comparison and input, entire changes.jsonl, entire binary index and saved decision.
4. The selected publication's complete candidate, CSV, dataset configuration and digest-selected original plan with its retained source/capture.
5. Complete merchant packages for that publication, including semantic dictionary, original handlers and relative runtime source.
6. Each selected file again, and the exact original workbench state afterward.

The original readCkanCapture, readCkanRefreshComparison, dataset loader and inspectCkanMerchantPackage validate their respective formats. SQLite plan IDs are distinct from plan-folder UUIDs: the collector locates the unique plan by the original candidate digest. It never opens the mutable publisher database. Historical absolute paths remain in the source bytes; actual reads use selected IDs and project-relative files.

A change during collection yields UNSTABLE coverage. A missing, unreadable, nonprivate or oversized source yields an explicit incomplete observation. Complete immutable comparisons retain all changes, including records beyond a UI page. Their original selectionStatus, scope and interpretation distinguish different query windows from resource-wide deletion.

A saved decision not yet committed to the workbench remains decisionPending. Intentional source withdrawal remains an original decision, preserves prior publication history and excludes the source from required successor publication. Original timestamps determine pending ages.

## Limits and thresholds

| Setting | Default | Accepted range | Meaning |
| --- | ---: | ---: | --- |
| maxBytes | 4 MiB | 1 KiB through 6 MiB minus 64 KiB | Sum of complete selected original file bytes. |
| maxFiles | 256 | 1 through 4096 | Complete selected retained files. |
| maxStateBytes | 2 MiB | 1 KiB through 3 MiB minus 64 KiB | Each original workbench read, separate from maxBytes. |
| timeoutMs | 30000 | 100 through 300000 | Read lifetime, checked between files and native validators. |
| operationAfterSeconds | 300 | 1 through 31536000 | Age of the retained RUNNING operation. |
| reviewAfterSeconds | 86400 | 0 through 31536000 | Age of a ready review awaiting its original decision/application. |
| publicationAfterSeconds | 3600 | 0 through 31536000 | Age of a source awaiting required publication. |
| requirePublication | true | boolean | Also monitor initial publication of an ordinary selected source. |

A zero review/publication threshold makes a real pending condition immediately eligible for the configured failure-poll count.

Each CKAN companion is at most 8 MiB. The original SF93 capture wrapper is checked against 36 MiB of actual serialized bytes, including base64 expansion, before persistence. Existing Object and endpoint limits stay unchanged. Original capture retention applies to the full wrapper.

Declared sizes are checked before reading, actual sizes during reading, and final encoded sizes before saving. Over-budget sources yield WORKLOAD_LIMIT rather than truncated successful captures. Operators can review a narrower existing selection or increase limits within the format. The normal CKAN workspace export carries complete larger projects.

## Conditions and recovery

Coverage is COMPLETE, UNAVAILABLE, UNSTABLE, WORKLOAD_LIMIT or INVALID_SOURCE. Complete observation describes the read, not the success of the underlying operation.

The summary always contains project, selection, workbench, pending and files objects. Unknown identities are null and collections stay arrays. Full original source/effectiveSource, editions, operation, comparison, decision, publication and merchant manifests remain available. project.identity is a derived hash of original catalogue origin and creation time for incident continuity, not a new native project ID.

| Condition | Original fact that opens it | Healthy recovery |
| --- | --- | --- |
| CKAN_SOURCE_UNAVAILABLE | Incomplete or stale coverage for the failure-poll count. | Fresh complete reads under the reviewed binding. |
| CKAN_IDENTITY_CHANGED | One confirmed changed project identity or selected ID relationship. | Fresh complete reads matching the same reviewed binding. |
| CKAN_SOURCE_INTEGRITY | One confirmed original file, source, candidate, review or semantic contradiction. | Fresh complete reads with source identities intact. |
| CKAN_OPERATION_FAILED | Original FAILED or INTERRUPTED operation. | A later complete read whose latest operation has a different state. |
| CKAN_OPERATION_OVERDUE | Retained RUNNING operation at least the threshold age. | A complete read with a closed operation or age below threshold. |
| CKAN_REVIEW_PENDING | READY original comparison awaiting decision/application after its threshold. | A complete read showing the applied original decision. |
| CKAN_PUBLICATION_PENDING | Accepted or publication-required source lacks an original PUBLISHED successor after its threshold. | A complete read showing original publication or intentional withdrawal. |

Intentional CANCELLED operations remain distinct from failure. RUNNING age describes saved state, not a claim that a host process is hung. A recorded publication is distinct from live seller availability, which remains the existing endpoint source.

A poll is applicable only within 30 seconds of capture time, at most five seconds ahead of the application clock, and strictly later than the previous accepted observation for the same project. Incomplete, stale and repeated observations remain evidence and cannot advance a healthy recovery streak. Identity/integrity contradictions open after one fresh observation; recovery always uses the original configured recovery-poll count. Unknown original timestamps retain an unknown age.

Original incident revisions, acknowledgment, retention, notification binding, retries and owned shutdown apply.

## Portable case contract

CKAN_WORKBENCH has exactly three files:

- ckan-observation.json: registration, normalized selection, read window, full companion hashes and recomputable summary.
- ckan-workbench.json: exact base64 original before/after state bytes, lengths and SHA-256.
- ckan-files.json: complete project-relative original file bytes, roles, lengths and SHA-256.

readCkanObservationFiles(files) checks the three buffers, decodes exact originals and recomputes the summary. Its result is {meta,snapshots,retained,summary}. Binary indexes remain exact base64 and original JSON uses the CKAN exact-number parser.

SF74 inspects, renders, compares, attaches, exports and receives these files without opening the old source path. The complete saved Support case is the portable artifact. Live monitoring after relocation requires a new review of the actual original project on that host.

Compare registration and pinned project selection before comparing current selected source/refresh/publication IDs. Display the entire original comparison, decision and publication alongside their source identities. Keep selection-window interpretation. Chronological follow-up shows the current condition without attributing causation to a particular operator action.

## Whole native receiving

Use the existing complete CKAN project:

1. Review its actual source/publication, register the returned pins in the original incident store, and collect a complete baseline.
2. Where an actual original refresh is READY, select that refresh and a reviewed zero-second review threshold. Open CKAN_REVIEW_PENDING through the configured original failure polls.
3. Acknowledge the incident, prepare and save its original Support case, and inspect the full source/comparison/decision and complete JSONL/index.
4. Apply the decision and publish the successor through the original CKAN workbench. Collect follow-up observations under the same project/refresh binding until original recovery polls complete.
5. Export the complete saved Support case, receive it in a fresh private directory, reopen it and compare capture, decision, candidate, semantics and all file identities.
6. Close the original watcher and Support owner, then preserve the native receiving record and complete case artifact.

APIs: reviewCkanSource(input,{signal?}), collectCkanObservation(merchant,signal), createCkanObservation(input), readCkanObservationFiles(files), and ckanObservationSignals(merchant,observation,now,previous). The whole receiving sequence uses the existing project, incident and customer case engines.
