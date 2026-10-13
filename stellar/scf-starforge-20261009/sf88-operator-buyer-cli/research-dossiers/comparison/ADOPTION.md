# Reviewed returned-comparison adoption

This component extends the original Research dossier. It receives a colleague's complete saved dossier through the existing Returned work workflow, lets an accepting operator select one exact comparison protocol and its dependency graph, and records the accepted selection as ordinary author-side comparison operations. The returned branch remains the original source. The application does not recompute a metric, change the original producer JSON, or attribute a colleague's measurements or judgments to the accepting operator.

## Operate in the existing workspace

Open the dossier's **Comparison** panel and its returned-comparison adoption section. Receive a complete returned dossier through the existing **Returned work** intake first. Adoption selects an existing retained source ID; it does not introduce a separate upload service or database.

1. Select the exact retained return and protocol version. Read its protocol, candidates, runs, judgments, decisions, source editions and full original files.
2. Select the desired records. Selecting a decision includes its judgments, runs and candidates. Selecting a judgment includes its referenced runs and candidate. One adoption covers one original protocol.
3. Choose the target protocol: create a new case, create a new protocol on a selected current case, or reuse an exactly equivalent saved protocol. Specify NEW or EXISTING for every dependency-expanded candidate.
4. Preview the complete plan at the current author revision. Inspect the exact source identity, current and returned questions, source bindings, original and target versions, complete ordered native commands, and the accepting actor, review time and note.
5. Submit that exact reviewed plan. A durable plan is retained before the first native comparison command. The original writer accepts each case, candidate, run, judgment and decision under its original request and revision rules.
6. Receive the saved result and inspect the native mapping and operation receipts. Download the complete adoption report, original returned dossier, and original run and artifact bytes. Export and cold reopen the complete author dossier through the original portable workflow.

Original authorship stays visible in the returned records. The accepting actor belongs to the new native operation and adoption review. It does not replace the original reviewer name or time in an imported judgment or decision. Candidate and protocol definitions retain their complete configuration, criteria, scope and source references.

### Prerequisites and explicit source resolution

The returned dossier must have the same dossier identity and a verified common ancestor with the author dossier. Every native history transition and source blob is validated using the maintained original portable validator before a plan is proposed or accepted.

The selected question must exist in the author dossier and its complete saved value must equal the returned question. Every selected source edition must also exist with its complete original identity and metadata. Missing or differing questions and editions produce actionable ADOPTION_QUESTION_MISSING, ADOPTION_QUESTION_DIFFERENT, ADOPTION_SOURCE_MISSING or ADOPTION_SOURCE_DIFFERENT issues. Resolve them through the original Returned work review, then prepare a new preview. The adopter never rewrites the source edition IDs embedded in producer run JSON.

Reusing an existing protocol requires equality of its complete definition. Reusing a candidate requires equality of its complete definition and the exact selected target protocol. An ID match or a matching display name is insufficient. A new protocol requires an explicit current case head at the initial review. After an interruption, a later head can be selected only in a new reviewed continuation.

A preview with eligible:false has previewSha256:null and cannot be submitted. Its source and plan inspection remain available; the issues describe the unresolved choice. No author mutation occurs during preview.

## Original request and interrupted continuation

The complete reviewed request, including the preview fingerprint, is saved before dispatch. The same request ID may be retried only with the same full body. The store looks up the retained plan before checking the current revision. It likewise recovers an accepted native command before treating a later author revision as a conflict.

A completed plan returns COMPLETE. A plan whose next command can no longer use its original expected revision returns NEEDS_REVIEW with the accepted prefix, exact remaining commands and current/expected revisions. Reading an unstarted retained plan also returns NEEDS_REVIEW; if its next original CAS is still current, replaying the original request continues it without a new review.

If unrelated author work has advanced the dossier, use an explicit continuation:

- create a new request ID and use the current author revision;
- supply continuationOf with the original plan ID;
- enter the accepting actor, review time and note;
- inspect the newly generated preview and accept its exact fingerprint.

The continuation inherits the same original source, selected graph and target intentions. Previously accepted mappings remain fixed. Only the unaccepted commands receive new native request identities and current revision expectations. The old plan becomes SUPERSEDED and points to the sole successor. A completed plan cannot be continued, and a superseded plan cannot be forked.

Transport uncertainty is not evidence that no operation happened. Keep the original pending body and look up its original request before creating anything else. The complete plan is the durable recovery record. Native operations are not deleted or rolled back to make a later retry fit.

## Files and portability

The adoption history retains the complete original returned stream as its native source chunks. Those chunks participate in buffered export, streamed export, size estimation, source validation and cold reopening. The returned branch remains a fully verified native history, including original run and artifact contents.

An initial returned-source intake installs its original blobs in the author store. A cold reopened plan may contain only the complete source chunks and the already accepted native records. If an unaccepted run's individual raw blob is absent, adoption reconstructs it from the verified retained source. If the original raw blob is already present, the normal verified author blob reader is used. A changed existing blob is an error; it is not silently replaced.

The run is submitted through the original run.import writer using its exact original UTF-8 bytes. That writer independently parses the producer contract and installs the original raw and artifact bytes. The artifact list, declared hashes and actual bodies must agree. No field is stripped, truncated, normalized into a new producer file, or used as a substitute for an unavailable original.

JSON and HTML adoption exports include the full source descriptor, reviewed plan, mappings, accepted native receipts and continuation relationship. A source export is the exact complete original returned stream. A complete author export additionally includes the new author operations and all retained adoption history.

Limits are the maintained native limits: adoption request 2 MiB, complete plan 4 MiB, selection/dependency graph at most 1,000 selected records plus its protocol, and at most 1,000 retained adoption plans. Original run, state, blob, source and portable limits continue to apply. A plan is rejected before its first mutation if it cannot be retained and exported within the original capacity constraints.

## Canonical local API

All methods are returned by openDossierStore(). They use the original dossier, revision, blob and commit authority.

| Method | Purpose |
| --- | --- |
| comparisonAdoptions(id, {revision, offset, limit}) | Saved plan catalogue plus retained return sources |
| comparisonAdoptionSource(id, {sourceId, caseVersionId, section, revision, offset, limit}) | Exact incoming records, source bindings and existing target definitions |
| previewComparisonAdoption(id, request) | Read-only full plan and exact preview fingerprint |
| reviewComparisonAdoption(id, {...request, previewSha256}) | Retain plan and execute/recover its original native commands |
| comparisonAdoption(id, {planId or requestId, revision}) | Exact original result or null |
| comparisonAdoptionFile(id, {sourceId, runId, artifactId, revision}) | Original source run or artifact descriptor and bytes |
| exportComparisonAdoption(id, {planId, revision, format}) | json/html body or source stream |

Read sections are cases, candidates, runs, judgments, decisions and sources. Pages expose items, total, offset, limit, nextOffset and complete. A later page must select the same explicit revision. Each record retains id and versionId; a run's native id and versionId coincide under the original model.

The initial request contains requestId, expectedRevision, actor:{id,name}, reviewedAt, reviewNote, sourceId, caseVersionId, selection, caseTarget and candidateTargets. Selection has candidateVersionIds, runIds, judgmentVersionIds and decisionVersionIds. Targets are NEW_CASE / NEW_PROTOCOL / EXISTING and NEW / EXISTING as appropriate. The canonical normalizer sorts ID arrays and candidate mappings; it does not rewrite source content.

A continuation request contains only requestId, expectedRevision, actor, reviewedAt, reviewNote and continuationOf. It must be previewed independently. Every review request adds previewSha256. The application uses ADOPTION_SCHEMA sf88-research-comparison-adoption/v1.

The authenticated HTTP routes and installed client/tool surfaces call these same methods. No endpoint can install arbitrary foreign comparison events as active author history.

## Complete receiving course

The maintained course is comparison/adoption-receiving.mjs. It uses the original openDossierStore, original receiveComparison training fixture and original portable APIs. It performs actual source intake and author mutations on owned local directories; it does not call a provider, dispatch a paid job, or run a scientific evaluator.

Run the installed complete Research source on a Linux host with Node and flock:

~~~sh
node research-dossiers/comparison/adoption-receiving.mjs \
  --directory /absolute/private/research-adoption-course \
  --operation R103D-RESEARCH-COMPARISON-ADOPTION-20261013 \
  --reviewer "Named receiving operator"
~~~

Use the actual installed path. The operation, directory, reviewer and selected source bytes are fixed by the first saved intent. Resume with those same inputs. The CLI holds the original operation's advisory lock in one foreground child and forwards SIGINT/SIGTERM. It launches no daemon, browser or separate scientific process.

The course:

- creates a clearly labelled training foreign branch using the existing complete comparison receiver;
- exports its actual common ancestor and receives the complete original return in an author copy;
- adopts a decision and its full five-record dependency graph with a separate accepting actor;
- verifies exact original run/artifact bytes, original reviewer attribution, paging, reports and exact request replay;
- exports the actual historical plan-only revision and cold reopens it without unaccepted raw blobs, then resumes through the verified source fallback;
- exports the actual historical two-operation prefix, cold reopens it, adds one explicit unrelated author edit, receives NEEDS_REVIEW, and completes a newly reviewed continuation that preserves both accepted mappings;
- explicitly reuses an equivalent saved protocol and candidate in a second author plan;
- exports and cold reopens the complete continued dossier, verifies every original source byte and exact request replay, and preserves later current heads separately from the pinned receiving generation.

These historical exports are ordinary native snapshots. The course does not fabricate a partial event history or edit native revision files. Every result is pinned to the first accepted native operation generation. A later legitimate author or browser edit does not change the saved course outputs.

Complete files are published with a temporary file, fsync and exclusive link, or the original atomic portable writer. The first completed export is retained; a retry does not regenerate a new exportedAt wire identity. Private directories keep all original requests, plans, files and outcomes together.

The result file is adoption-receiving-result.json. It exposes authorStoreDirectory, dossierId, sourceId, browserSelection, originalRun descriptors, original and continued mappings, pinned revisions, complete output descriptors, and separate receiving directories. The browser selection uses the original complete protocol and an explicit new case to exercise its full closure. It does not replace the first native adoption or its source. The separately retained second foreign protocol is also available for inspection. browserInterrupted names the complete historical NEEDS_REVIEW portable file, original plan/request, two accepted mappings and the remaining three operations. The paired browser can cold open that exact original fixture and complete its own reviewed continuation without changing the native course's accepted result. An intentionally incomplete candidate target selection can demonstrate an eligible:false preview while retaining the complete original source.

### Receiving status and literal inspection

An authored course or successful function-level check is not an actual native receiving result. ADOPTION_BACKEND_RECEIVING_COMPLETE is written only by the operated course after its actual validations.

The final result deliberately leaves literalInspection.status=PENDING. The receiving operator must open and inspect the actual HTML/JSON/CSV reports, original producer/member files, complete returned source and editable received project. The complementary browser course must exercise the real desktop and phone-width controls, durable draft/request recovery, named acceptance, downloads and cold received workspace. Record the actual rendered observations and retained artifacts in the same original operation. Do not report a browser, visual, scientific or customer acceptance merely because the backend finished.
