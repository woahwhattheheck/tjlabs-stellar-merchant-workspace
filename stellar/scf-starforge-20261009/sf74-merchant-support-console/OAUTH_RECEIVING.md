# OAuth Support — original customer receiving

This component extends the existing SF74 Merchant Support console and its original CaseStore. It receives the OAuth incidents produced by the existing SF93 watcher. The observer, JWT verifier, incident lifecycle, acknowledgment, source store, classifier, customer case store, and portable handoff remain their original implementations.

The complete native entry is the original SF93 programme with this receiving continuation:

```sh
node stellar/scf-starforge-20261009/sf93-seller-support-bundle/oauth-native-programme.mjs \
  --directory /absolute/private/fresh-oauth-native-output \
  --receiving stellar/scf-starforge-20261009/sf74-merchant-support-console/oauth-receiving.mjs \
  --playwright-module /absolute/installed/playwright/index.mjs \
  --browser-executable /absolute/installed/chromium
```

Use the actual reviewed Node, Playwright, Chromium, and output locations selected by the original programme owner. Both browser arguments are required together; omitting both performs the same native API and portable receiving work without claiming browser execution.

The original programme creates its output directory once. Do not rerun it against an existing directory or choose another directory to hide an unknown result. Reconcile the original process, result file, incident state, and retained customer selection first. Before calling the receiver, the producer now retains both complete final source files and a private, immutable receiving context. The retained-only command below continues that same Support request after the producer has ended; it never recreates an OAuth host or restarts a watcher.

## Producer preservation and the retained-only continuation

The complete original producer holds the existing Linux kernel state lease in root/receiving-input, separate from SF93's own transaction and worker leases. That lease remains held through its original verifier, host, watcher, Support receiving and final child cleanup. A cold continuation acquires the same lease. It cannot overlap a live producer or another continuation. The lease uses the maintained merchant-fleet-gateway/state-lease.mjs implementation and releases when the owning descriptor closes or its process ends; it introduces no PID guessing or stale-lock deletion.

After the original watcher has recorded STOPPED and the final complete source has been validated, the producer publishes these private files using the original retainCaseArtifact helper:

| Path beneath the original programme root | Purpose |
| --- | --- |
| receiving-input/oauth-observation.json | The exact original SF93 metadata bytes, including the original file hash and recomputable summary. |
| receiving-input/oauth-source.json | The exact complete original OAuth observation JSON bytes, with the original session, sequence, authority, counters, and minute rows. |
| receiving-input/CONTEXT.json | The complete normalized selection, original merchant/configuration, source origin, selected incident IDs/revisions and capture references, stopped watcher identity, both final file descriptors, producer and receiver source identities, optional browser paths, and original Node identity. |
| receiving-input/lease.lock | The existing kernel lease's persistent lock file. Its presence is not evidence that a process owns it; the maintained acquisition checks the actual kernel lock. |
| oauth-final-source.json | The prior programme's source-only output path, retained as the same complete original bytes for compatibility. |

CONTEXT.json is published only after both full source files and all original selected before/after capture envelopes have been verified. Its bytes, SHA-256 and path are recorded in the original programme's receivingContext result and original-support-inputs-retained phase before receiveOAuthSupport is called. There is no case mutation before this producer input boundary.

The context stores environment variable names already present in the original selected configuration, such as the operator token and notification credential references. It contains no OAuth token, notification secret, private key, environment value, subject list, or tool argument. Source host and issuer addresses remain historical source identity. Their presence does not mean those services are still live.

For an interrupted or failed customer receiving stage, use the exact context path and SHA-256 returned by the original producer:

```sh
node stellar/scf-starforge-20261009/sf93-seller-support-bundle/oauth-receive-context.mjs \
  --context /absolute/private/original-oauth-native-output/receiving-input/CONTEXT.json \
  --expected-context-sha256 ORIGINAL_CONTEXT_SHA256
```

This is a concrete entrypoint into the original receiveOAuthSupport export. It performs these checks before starting its local Support listeners:

1. Acquires the original producer/receiving kernel lease. A still-active owner causes a busy result; the command does not kill or replace that owner.
2. Reads the complete private context and compares its exact SHA-256 with the explicitly selected producer receipt.
3. Verifies the actual producer, context helper and receiver module bytes against the frozen source descriptors, and requires the original selected Node executable/version and browser paths.
4. Reopens the original incident store, acquires its existing worker lease to prevent a new watcher during receiving, and checks the unchanged original stopped-worker/configuration/incident selection.
5. Reads and validates every selected original before/after capture envelope and both complete final source files using the existing SF93 codec.
6. Checks the original producer result's identity and retained completed phase prefix. Its current status may be FAILED, COMPLETED, or the last RUNNING record left by a process that has ended; the held kernel lease, not that text status, establishes current ownership.
7. Imports the exact selected receiver, checks its source again, and calls it with the original paths, IDs, source bytes and browser selection. Its credential environment is an empty object.

The original receiver's runtime inspect/review/export/import APIs consume retained file bytes. Its incident list/profile/prepare APIs consume the original store and capture envelopes. Configuring the named OAuth source does not resolve its credential reference or contact its endpoint. This continuation does not call inspect-oauth, start a watcher, send a webhook, generate a JWT, or open the original source host. The only listeners it starts are its two original, owned Support consoles; both are closed before its receiving result completes.

The original incident store, full application dependency closure, writable private customer directories and optional installed browser must remain present. This context is an input handoff within that retained original installation, not a standalone replacement for the incident store or a promise that a moved installation can use its old absolute paths. If the original incident revisions, stopped-worker identity, capture references, selected configuration, source files or implementation have changed, the command refuses that changed selection. A deliberate correction requires a reviewed continuation; it must not bypass these guards.

Each explicit continuation records a distinct private attempt under root/receiving-continuations/<attempt-id>/:

| File | Meaning |
| --- | --- |
| STARTED.json | Exact context descriptor, original producer-result descriptor/status, original operation, and the retained-only attempt identity. |
| COMPLETE.json | The complete actual original receiver result after its own listeners and cold CaseStore checks have finished. |
| FAILED.json | The observed error when the receiving attempt failed and its failure record could be retained. |

The command never rewrites oauth-native-result.json. A successful retained receiving attempt therefore does not relabel an earlier FAILED or interrupted producer as if it had completed in one invocation. Its receipt binds the actual producer result it observed. Existing root/customer/SELECTION.json, case IDs, saved revisions, generatedAt-bound exports and later case heads remain authoritative under the original receiver's normal recovery logic.

The programme's JavaScript interface also accepts receivingModule, the absolute module path for the function passed as receive. Its CLI supplies the exact --receiving path automatically. A directly imported canonical receiveOAuthSupport function can use its original default module path. A different embedding callback must name the actual module exporting that same receiveOAuthSupport function; the preservation helper will not claim an unrelated function can be resumed from another file.

When no receiver was selected, the original producer still saves both final files and the context with receiver:null. The retained-only command explicitly refuses that context because no receiving continuation was authorized by that original producer invocation.

## What the complete programme operates

The existing native programme runs real JOSE signing and verification, the original MCP HTTP handler, the original protected observation endpoint, its original host callback, and a controlled TLS key dependency. It exercises ordinary enforcement denials separately from a real unavailable key dependency. SF93 opens, acknowledges, and recovers the same incidents from actual source observations and retains their before and after captures. Its recovery uses the real minute boundary and successful original checks.

After the original watcher has stopped and the complete receiving inputs have been saved, the programme calls receiveOAuthSupport while its original service host remains available. The same receiver can also run through the retained-only entrypoint after that host closes. The consumer:

1. Opens the original Support server with an original private incident-source profile and a source CaseStore.
2. Verifies the original named incident source and the exact current console assets.
3. Inspects the complete original OAuth file pair through the actual runtime API.
4. Reads each selected incident and its original capture envelopes through the original SF93 read transaction.
5. Uses the original incident-to-case API to prepare its actual workspace, before/after attachment, metadata, comparison, repair queue, and readable report.
6. Seals a complete retained selection before saving a case.
7. Saves each source case with the original CaseStore API, then exports it through the original runtime export API.
8. Closes the source Support listener and all its original owned controllers.
9. Opens a separate fresh CaseStore through the same Support server, imports each exact exported handoff, and saves it with the same case ID.
10. Rechecks the original comparison and queue through the received runtime API.
11. When requested, opens one owned browser against the actual console and the retained customer HTML report, saving complete screenshot artifacts.
12. Closes that listener, independently reopens both CaseStores, and reproduces the exact original exported handoff and HTML from the received case.

The receiver starts no OAuth host, JWT verifier, source watcher, new incident, acknowledgment, notification, purchase, or paid API operation. The original source programme is the only producer of the incident evidence.

## Exact calling interface

```js
import {receiveOAuthSupport} from './oauth-receiving.mjs';

const received = await receiveOAuthSupport({
  root,                  // original absolute native programme output directory
  incidentDirectory,     // initialized original SF93 store
  incidentIds,           // exact original selected incident IDs
  incidentConfig,        // original watcher configuration
  merchant,              // original configured merchant with id, label, oauth
  selection,             // complete normalized original OAuth source selection
  environment,           // actual existing operator environment; never exported
  sourceOrigin,          // actual original MCP service origin
  sourceFiles,           // the two names mapped to complete Node Buffers
  report,                // original programme report; remains caller-owned
  signal,                // the programme owner's live AbortSignal
  browser: {
    playwrightModule,    // absolute installed module path
    executablePath      // absolute installed Chromium path
  }                      // optional
});
```

The two complete source filenames are oauth-observation.json and oauth-source.json. The metadata and complete original source bytes are parsed and validated by the original SF93 codec. A failed original source is represented by that codec's retained null source and error, never by invented zero counters.

The selected incident configuration must be the original compiled configuration. The source registration must match the merchant ID, resource, and reviewed configuration. The source origin is recorded only as the existing workspace's operator-selected origin. It is not evidence that the retained capture performed an HTTP request for that origin.

The optional browser selection is retained with the original receiving request. The receiver reads the selected installed source files; it never downloads a browser or changes the selected runtime. The caller remains responsible for supplying the complete current repository layout and the original supported dependencies.

## Original identities and case history

A first complete selection assigns one case ID per selected incident. That same case ID is used in the source and received CaseStores. Each store generates its own actual native revision; both revisions are retained in the receipt. A fresh import is not claimed to copy the source store's version timestamps or entire case history.

The portable handoff preserves the exact workspace text, runtime support text, original capture bytes, selected route, human case metadata, original incident identity in the notes, comparison, and readable report. There are no fabricated payment terms, seller diagnostics, question banks, or request counters in the runtime-only workspace.

On continuation, the receiver first checks the exact selected case ID and original content. If a later case head exists, it walks the original history and reads the matching retained version. It never replaces that later head with the earlier import. If the selected version has disappeared, the same ID has unrelated contents, the history changes while it is being read, or a receipt no longer matches its original bytes, receiving stops with an explicit mismatch.

A save uses expectedRevision:null only when the actual original case is absent. The complete save intent is retained first. If the response is lost, this invocation does not automatically repeat the POST. A later invocation reads the original case and its history, adopts a matching committed version, and records that original result.

A stopped original CaseStore writer is reconciled only by its maintained inspectCaseWriter and recoverCaseWriter methods, in the receiver's own source-cases or received-cases directory. The latter creates the original generation-forwarding record only after the recorded writer is positively stopped in the same host and PID namespace. Active, foreign, or unknown owners remain untouched.

## Retained files

All customer outputs are beneath root/customer. They use the original retainCaseArtifact helper, which writes a complete private file, synchronizes it, and publishes it without replacing an existing different file.

| Path | Complete retained contents |
| --- | --- |
| SELECTION.json | The fixed original request, exact source descriptors, incident revisions, assigned case IDs, prepared handoff descriptors, capture references, and workspace identity. |
| incident-sources.json | The original private Support source profile, including the reviewed source alias and environment reference. It contains no credential value. |
| workspace.json | The complete original runtime-only Merchant workspace. |
| observations/ | Both complete original OAuth input files. |
| captures/ | Original SF93 capture envelopes named by their original SHA-256 identities. |
| prepared/ | Complete original incident-to-case API responses, including the original handoff and readable report. |
| intents/ | Exact original source and received CaseStore save requests. |
| receipts/ | Case IDs, actual native revisions, source hashes, selection identity, and original times. |
| exports/ | Exact original handoff JSON, customer HTML, complete report JSON, and their fixed export receipts. |
| source-cases/ | The actual original source CaseStore and its ordinary support subdirectories. |
| received-cases/ | The actual independently received CaseStore and its ordinary support subdirectories. |
| browser/ | Requested complete screenshot artifacts and the completed browser receipt. Partial runs leave content-addressed evidence without replacing a prior image. |
| COMPLETE.json | The original complete receiving result after both listeners are closed and both CaseStores are independently reopened. |

Descriptor hashes establish the selected retained bytes. They do not authenticate an issuer, grant access, substitute for the original JWT verifier, or prove a remote source's trustworthiness.

The first selection is sealed only after all selected original captures and prepared case handoffs are available and validated. No case mutation occurs before that seal. If a source read stops earlier, the next read can select the then-current original incident revision because no case has been published from that incomplete selection.

Once SELECTION.json exists, the same request must match it exactly, including the selected consumer source hash and optional browser paths. A code correction after an interrupted run requires a concrete, reviewed source/selection continuation; it must not silently reinterpret the saved operation under a changed implementation.

## Counter and repair interpretation

Authentication and authorization are original decision checks. One HTTP request can cause several checks, and observation reads may intentionally be excluded. The customer view keeps each stage and exact outcome separate.

The original source summary and oauthConditions are the single authority for failure and recovery. Ordinary INVALID_TOKEN, INSUFFICIENT_SCOPE, and ACCESS_DENIED outcomes remain enforcement observations. They do not create outage incidents or extra repair work. An actual HOST_ERROR means the original host callback threw.

The runtime comparison subtracts cumulative counters only when both captures have the same reviewed source registration, resource, configuration, session, start time, increasing sequence, and monotonic counters. Original capture timestamps may share a millisecond. Separate sessions, incomplete sources, repeated sequence values, missing issuer buckets, or changed identities remain visible without inventing an interval.

Original minute windows remain separate. The summary's window.minutes is the selected duration; the complete native bucket rows are retained in the source file. Overlapping windows are not summed. A healthy key cache with no new key fetch does not need a repair job. UNKNOWN is neither a failure nor proof of recovery.

The exact before-source queue remains a historical source-bound queue even after the after-source recovers. The report names each source. The receiver compares and retains that complete original report; it does not relabel all historical actions as current faults.

## Lifecycle and interruption

The native CLI installs one SIGINT/SIGTERM AbortController before importing the receiving continuation. A stop after that import is checked before starting new work. The programme's separate owner signal remains live when its watcher-specific signal is intentionally stopped before receiving. It checks its maintained kernel lease at phase boundaries. Final cleanup joins all original host/server owners, records the actual cleanup outcome, and releases the producer lease last. The retained-only CLI has its own single cooperative stop controller and releases its worker/receiving leases only after the original receiver has joined its cleanup.

Each Support acquisition is retained as an in-flight promise. A stop during startup waits for the same late listener and closes it through its original close method. Each original close is joined before another Support listener opens. The browser similarly retains its pending browser and context acquisitions, closes late owners, and joins all cleanup.

All HTTP operations use that signal and a bounded deadline. An unacknowledged POST is not replayed in the same invocation. Completed CaseStore writes remain recoverable through their original ID and retained history.

The consumer does not remove original locks, guess another process's identity, create a replacement scheduler, or infer success from a disappeared executor session. A transport disconnect requires reconciliation of the original programme and receipt before continuation.

## Completion evidence and limits

COMPLETED means the executed receiving invocation verified the selected source files, original API/case/export/import path, independent cold read, and exact reproduced customer handoff, with both owned console lifetimes closed. The result records each original incident, both actual case revisions, source capture descriptors, comparison, queue, and saved artifacts.

Browser state is separately COMPLETED or NOT_REQUESTED. When requested, the result records the actual desktop console and customer report screenshots, script errors, and mobile viewport/document widths. Those measurements are observations of the selected render; they are not a certification, accessibility audit, or a claim that every interaction on every device was tested.

Source review and syntax checks alone do not constitute this native completion. The original programme result and root/customer/COMPLETE.json are the actual receiving receipts. If receiving completed in a retained-only continuation, also retain that exact receiving-continuations attempt's COMPLETE.json and its bound producer result; their distinct outcomes must remain visible. Keep credential-bearing private host files and environment values outside customer sharing. Retain the complete application source and original component guides using the existing delivery workflow; this component introduces no separate package or external publication mechanism.
