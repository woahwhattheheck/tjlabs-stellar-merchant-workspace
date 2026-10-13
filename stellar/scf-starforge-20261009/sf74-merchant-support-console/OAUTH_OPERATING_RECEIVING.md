# OAuth Support source retention and customer receiving

This operator carries an existing Support case into an editable Operating Plan. It selects one original case revision, retains every ancestor of that revision, and keeps the original OAuth files and complete customer handoff alongside a compact descriptor. The existing CaseStore, runtime codecs, atomic artifact writer and state lease perform the work.

The installed `support-operating-plan` command and typed `./merchant/support-operating-source` SDK expose this source route. The ordinary Operating Plan remains editable through its existing model and browser. Its full JSON revision history travels with this companion. The source descriptor records observations and returned artifacts; a human records an operating outcome against the selected evidence.

## Select the actual case and artifacts

Read the original case in the authenticated Support console or its existing client. Select its UUID and complete revision SHA-256. A selected historical revision is valid: the descriptor retains that revision and its ancestors, and separately records the live current revision observed at selection. The two identities may differ.

Choose a new private output directory and a stable source ID. Choose one exact ISO UTC `capturedAt` value for this capture request and retain it for a retry. The timestamp fixes generated report and handoff bytes. It does not replace the original observation times, case times, or returned result times.

Supply `incidentSource` only when the actual source manager selection is available: `{id,configurationRevision}`. The configuration revision is a SHA-256 identity. A case revision cannot substitute for it. Use null when the manager selection was not retained.

Optional native delivery and evidence inputs identify existing private files by complete byte count and SHA-256. Evidence inputs also carry their original role. The exporter reads those exact selected files; it does not download a source or create a result.

```js
import {
  captureOAuthOperatingSource,
  inspectOAuthOperatingSourcePackage,
  receiveOAuthOperatingSource
} from './oauth-operating-source.mjs';

// Values come from the selected original case and returned local files.
const captured = await captureOAuthOperatingSource({
  casesDirectory: originalCasesDirectory,
  caseId: selectedCase.id,
  revision: selectedCase.revision,
  outputDirectory: privateSourceDirectory,
  sourceId: originalSourceId,
  capturedAt: originalCaptureTime,
  incidentSource: selectedIncidentSource ?? null,
  nativeDelivery: selectedCompleteDelivery ?? null,
  evidence: selectedResultFiles, // [{role,file:absolutePath,bytes,sha256}]
  signal
});
```

The installed CLI provides the same capture operation. Use its current `--help` and an exact source request JSON containing these API fields. Keep the original request with its returned `sourceFile`; the file identity is the receiving selection.

## What the complete companion retains

The compact `SOURCE.json` uses `stellar-forge.oauth-support-operating-source.v1`. Its source ID and capture time are explicit. Its case object retains the original UUID, selected revision, observed current revision, creation/update times and all selected ancestors, ordered from the selected revision's parent to the origin. It contains artifact references, not arbitrary case notes or embedded workspace data.

The companion contains:

- Every original selected case metadata file under `case-store/<case-id>/versions/<revision>.json`. Each file's SHA-256 is the original revision itself.
- Every workspace and runtime file referenced by that complete selected chain, deduplicated by its original content identity.
- A snapshot head naming the selected original revision. This head belongs to the immutable companion, not the live original CaseStore.
- Exact `oauth-observation.json` and `oauth-source.json` for each selected OAuth side. Their original whitespace and bytes are retained.
- The original `exportRuntimeHandoff` output, runtime report and HTML, rendered at the retained source capture time.
- Every explicitly supplied result file and optional complete native delivery, selected by bytes and SHA-256.
- `MANIFEST.json`, covering the complete selected artifact inventory and source descriptor.
- A private capture selection used for exact-request recovery. It contains the selected local paths and stays with the private operation.

A mixed runtime case can retain a non-OAuth before or after side in its full original runtime and report. The compact descriptor exposes only actual OAuth sides as OAuth captures; the other side is null. It never relabels another source kind. At least one retained side must be an actual OAuth capture.

Source `actions` project the original report's `source`, `routeId`, `kind` and `action` fields. The complete report remains authoritative for all additional source-specific details. The exporter does not introduce another failure classifier or repair queue.

## Observation fields and missing data

Each OAuth capture retains the original registration ID/label, route ID and two file identities. The original resource, configuration SHA-256, session ID, start/capture time and sequence remain null when the source was unavailable. Collection start and collection completion are separate observed timestamps from the original metadata.

Coverage contains the actual state (`COMPLETE`, `SOURCE_UNAVAILABLE`, `IDENTITY_CHANGED`, or `OBSERVER_INCOMPLETE`), the original window completeness, source error and identity contradiction. Missing observations do not become zero checks. Authentication, authorization, host authority and JWKS measures remain their original stage checks; ordinary enforcement denials retain their original meaning.

The descriptor does not export endpoint credentials. The complete workspace, runtime and handoff are private customer source and may contain customer text. Retain the complete companion using the same authorized customer destination as the original Support case.

## Evidence and recorded outcomes

Evidence is an array of `{id,role,artifact}`. Built-in entries identify the selected original case metadata, each retained OAuth source file, and the actual generated Support report/handoff/HTML. Supplied result files retain their selected original role and exact byte identity. A stable role/path ID allows the browser and CLI to display choices without inventing an execution state.

The ordinary plan adapter records `result:{summary,evidenceIds}`. A completed step requires at least one ID present in the selected source. The operator chooses evidence relevant to the work and records the actual outcome; having a descriptor or report is not an automatic service-completion assertion. Later results may come from the same selected case or a later original case edition whose verified ancestry includes it.

Keep the complete source descriptor that supplied a recorded result. The original plan revision retains the selected source ID, case identity and chosen artifact references. The complete native receiver verifies the case lineage that the pure plan model uses for its recording guard.

## Inspect and receive

Inspection requires an external selected identity for `SOURCE.json`. This avoids treating a mutable filename as the receiving authority.

```js
const inspected = await inspectOAuthOperatingSourcePackage({
  directory: privateSourceDirectory,
  expectedSource: captured.sourceFile,
  signal
});

const received = await receiveOAuthOperatingSource({
  sourceDirectory: privateSourceDirectory,
  destination: freshPrivateReceivingDirectory,
  expectedSource: captured.sourceFile,
  signal
});
```

Inspection checks the manifest, all exact artifact bytes, complete revision ancestry and original metadata/workspace/runtime relations. It calls the original CaseStore reader for every selected revision. It decodes and validates the original runtime, reproduces both OAuth file pairs, rerenders the original report/handoff/HTML at the retained time, and runs the original handoff import. Every selected manifest member must belong to that complete source. Extra declared members or mismatching references reject.

Receiving copies only the verified complete selection through the original immutable artifact writer. The destination holds a separate state lease, so a competing owner cannot write the same receiving operation. The result returns `source`, `sourceFile`, `manifestFile`, `caseSnapshotDirectory`, `selectedRevision`, `reused` and an exact `receiptFile`. The receipt states `FULL_ORIGINAL_CASE_HISTORY_AND_ARTIFACTS` and `liveCaseHeadChanged:false`.

The received CaseStore directory is an immutable original-layout snapshot. It lets the recipient reopen all selected versions with the ordinary CaseStore reader. To continue the live customer case, import the retained Support handoff through the existing console, inspect the customer's current case revision, and use its original compare-and-save operation. An older received source never overwrites a later live head.

Receive the ordinary Operating Plan through `receiveOperatingPlan` or the existing browser intake. It verifies the full shared revision prefix, keeps a later local head and rejects divergent histories. Keep the companion beside that full editable plan; the compact descriptor is not a replacement for its native case data.

## Exact-request continuation

A capture output directory belongs to one complete selected request: original source directory, case UUID/revision, source ID, fixed capture time, incident source and exact optional file selections. Existing matching source bytes are adopted through the original atomic writer. A changed request rejects instead of reusing an earlier output.

The exporter freezes the observed source head before copying and retains selected immutable versions. A later original case save does not alter that selection. If the source has become unavailable before missing selected members were retained, preserve the partial output and restore access to those exact originals.

A completed capture can be verified and returned from its retained companion without rereading the producer. The receiving operation similarly freezes `SOURCE.json` bytes/hash in its private request. Exact already copied members are adopted; conflicting bytes reject. If the complete manifest was retained before acknowledgement was lost, the receiver verifies the destination and finishes its receipt without requiring the sender directory. Repeating a completed receipt returns the same source and manifest with `reused:true`.

The maintained state lease releases when its owning process exits or crashes. This module does not guess a PID, remove another owner's lock, start a background scheduler or replay an OAuth producer. Aborts are checked between bounded file reads, original case versions and each write; the lease closes in `finally`. The original artifact writer preserves completed files and cleans its ordinary staging on a handled interruption. Any unreturned native invocation remains an ownership/reconciliation task before another invocation.

## Limits and runtime

Use the maintained Node runtime and Linux `flock` required by the original state lease. This source-only route does not require JOSE tokens, an OAuth host, Playwright, Chromium or a new Support listener. The full installed application still needs its existing source closure for the original CaseStore and runtime parsers.

The compact descriptor and complete manifest each have a 32 MiB limit. The complete package has a 4 GiB selected-content limit, 100,000 selected case revisions and 310,000 file entries. Individual original case workspaces, runtime data and handoffs keep their existing limits. Optional external result/delivery files are limited to 512 MiB each, and there can be at most 1,000 explicitly supplied evidence inputs. Empty external files are not accepted as a result artifact. Limit failures preserve complete originals and never shorten a history or silently omit selected evidence.

This module's source inspection and syntax checks are separate from the original live OAuth acceptance programme. Actual native source capture/receiving receipts are produced only by the selected customer's execution. The existing OAuth programme, its retained receiving continuation and customer artifacts remain the authority for host/watch/case acceptance.
