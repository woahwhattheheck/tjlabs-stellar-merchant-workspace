# DataCove SensorThings commissioning — operator contract

Operation: DATACOVE-SENSORTHINGS-COMMISSIONING-0C7A-20261012
Company case: datacove-sensorthings-commissioning-20261012
Source integrator and company sender: 0C7A.
Native source/API owner: 0C7A. A complementary builder can own the complete map and commissioning interface in this same component.

## Source and host

Component: stellar/scf-starforge-20261009/sf30-seller-sdk/sensorthings/commissioning/
Canonical repository: woahwhattheheck/tjlabs-stellar-merchant-workspace.
Retained base: 4637b13d528c63ed46631ec9b51418d9137d4c1b.

The application extends the existing SensorThings workspace, writer lease, source editions, byte objects, operation IDs, Desk session and managed application. It does not open a second writer for that workspace. All mutations use the original /api/action envelope:
{operationId, expectedRevision, action, payload}.
operationId is 8–100 letters, digits, underscores or hyphens. Replay preserves the original payload. The response is the original {operationId, reused, result, view}; its view.revision is the next write base.

Native calls use FraunhoferIOSB/FROST-Python-Client 1.1.53 at 9f41f7794725fced63fcb07e6b33dbc1f897f2bc. Its public SensorThingsService.execute(method, url, **kwargs) is the transport authority. Exact JSON body bytes are passed through its data argument because its entity serializer omits explicit null values and reformats source timestamps. The package stays unchanged. Requests retain the source URL, exact sent body, actual response body, selected response headers and source/request identities; authentication values remain in the selected host environment.

DataCove STAM is pinned to 0e414f3441a8773619f242c797fe75e9af3fc04d. Its own Leaflet or OpenLayers bundle supplies map/feature/observation rendering. The native commissioning module owns target operations and reviewed result data. The complete original 660-observation Hamburg source remains categorical; unit conversion, duration and availability are never inferred.

## Operating model

A commissioning project has an immutable ID, label, source records, target versions, mapping versions, plans, reviews, jobs, verification results, delivery packages and history. Each retained source/mapping/plan/job-result is selected by its exact SHA256. Target IDs returned by the server remain typed JSON identifiers, not JavaScript floating-point IDs.

Sources:
- An original accepted SensorThings edition, with its complete raw response/graph closure and existing source review.
- An uploaded CSV source from the existing private Desk inbox. Its exact bytes, encoding, delimiter, row/header selection, field mapping and numeric/string/Boolean/JSON result interpretation are explicit.
- An uploaded SensorThings JSON entity or data-array document with its exact bytes and original definition.

The source record links every selected entity/observation to an original source SHA and JSON pointer or CSV row. Identical repeated occurrences can be consolidated with their complete occurrence list. Conflicting source identities remain a reviewable mapping issue.

Mapping records contain sourceId, targetId, label and configuration:
{
 version: 1,
 namespace: "reviewed-project-name",
 sourceSelection: {streamKeys: [], occurrenceIds: []},
 csv: {encoding: "utf-8", delimiter: ",", headerRow: 1,
       columns: {phenomenonTime: "time", result: "status"},
       resultType: "string", nullToken: null},
 entities: [],
 bindings: [{sourceKey, mode: "create|bind|update", targetIdJson: "exact JSON identifier",
             overrides: {}}],
 markerProperty: "tjlabsCommissioning",
 batchSize: 100
}.
Empty selection arrays select all original records; selected/excluded/conflicting counts remain visible. An edition source ignores the CSV mapping. A CSV source supplies the native entity definitions through entities and selects its Datastream/FeatureOfInterest relationship in the mapping. All authored definitions and overrides are displayed in the plan. A managed provenance marker is an explicit target addition shown in the reviewed payload.

Native entity graph order preserves Locations → Things/Sensors/ObservedProperties/FeaturesOfInterest → Datastreams/MultiDatastreams → HistoricalLocations/Observations. Each relation selects an original source key, a native target identifier or a preceding retained create result. The source IDs and server-generated target IDs remain separate.

## Mutations

All actions below use the existing /api/action envelope and retain their original request ID.

| Action | Payload |
|---|---|
| commissioning.project.create | label, description |
| commissioning.source.edition | projectId, editionId, label |
| commissioning.source.file | projectId, filename, expectedSha256, expectedBytes, label, sourceUrl, license, format |
| commissioning.target.save | projectId, label, serviceUrl, authorizationEnv, allowLoopback, requestTimeoutMs, maxResponseBytes |
| commissioning.target.inspect | projectId, targetId, entities (optional array of {kind,idJson}) |
| commissioning.mapping.save | projectId, sourceId, targetId, label, configuration |
| commissioning.plan.prepare | projectId, mappingId |
| commissioning.plan.review | projectId, planId, decision (accept/revise), actor, note, acknowledgeIssues |
| commissioning.run.start | projectId, planId, reviewId, confirmServiceUrl, acknowledgeWrite |
| commissioning.run.resume | projectId, jobId, confirmServiceUrl and acknowledgeWrite for a received pending job |
| commissioning.run.cancel | projectId, jobId |
| commissioning.run.reconcile | projectId, jobId |
| commissioning.run.resolve | projectId, jobId, stepId, decision (adopt/retry), targetIdJson, actor, note |
| commissioning.run.verify | projectId, jobId |
| commissioning.rollback.prepare | projectId, jobId |
| commissioning.review.record | projectId, jobId, decision, actor, note |
| commissioning.handoff.prepare | projectId, label |
| commissioning.handoff.receive | filename, expectedSha256, expectedBytes |

Read-only target inspection and verification create retained native jobs just like write jobs. Target URLs are HTTPS, or explicitly selected loopback HTTP for the reference installation. Credentials are a host environment name. The session token never appears in a target profile, portable package or browser URL query.

Start returns the committed job immediately. The worker reopens the same exact plan and its existing step journal. A terminated caller cannot create a second concurrent native writer: the original workspace lease and a lifetime native target/job lock preserve ownership. Recovery reconciles an already-started write through its retained response or selected target identity. A missing HTTP result is shown as awaiting reconciliation; it is never silently reposted. An explicit retry decision remains part of the same job and request history.

The cancel action records cancellation before signalling the original native process. Completed steps and uncertain in-flight writes remain visible. Resume continues the same job. The operation record distinguishes queued, running, deferred, interrupted, awaiting reconciliation, cancelled, failed and complete. The selected provider Retry-After/not-before value is retained.

A rollback is a separately prepared/reviewed compensating plan: it selects the exact original target identities, original before-images and current target comparison. Bind-only entities are never deleted. Changes outside the original managed set are displayed as conflicts. The operator controls the selected commissioning window.

## Read facade and HTTP

Core module: createCommissioningManager({store, edition, inboxDirectory, environment, runtime}).

Returned methods:
- overview(): compact projects, targets, plans, jobs, exports and counts.
- project(projectId): complete selected project view and history metadata.
- source(sourceId): retained source metadata and mapping hints.
- rows(sourceId, {offset=0,limit=100,mappingId=null}): {sourceId,offset,limit,total,nextOffset,columns,rows,issues}.
- plan(planId, {offset=0,limit=100}): plan identity/summary/issues plus paged steps.
- job(jobId, {offset=0,limit=100}): job identity, current native state, progress, paged step receipts, retained results and verification references.
- fileRecord(id): one exact downloadable immutable file descriptor.
- execute(op, finish): same original core reservation/completion path.
- reconcile(): reconcile already committed native work.
- close(): drain the same manager’s owned workers before the original store closes.

GET routes under /api/commissioning:
schema; view; projects/:id; sources/:id; sources/:id/rows;
plans/:id; jobs/:id; files/:id.
The original Desk server enforces Bearer, exact origin and X-SensorThings-Workspace before this handler. File downloads verify the selected SHA256 and use a held original descriptor. Source/raw/native request/response and report links always identify their saved version.

Each plan row includes stepId, entityKind, sourceKey, sourceRefs, mode, bodyText, relations, targetIdJson, sourceRowCount and issue codes. Each job step includes state, attempt IDs, actual HTTP response identity, target identifier/URL and source-key mapping. Result rows retain original result type and units; numeric comparison uses exact decimal semantics, while source and native wire bytes remain separately retained.

## Full operator interface

Keep the existing clean industrial Desk and its source/import/upload navigation. Add one Commissioning destination with:
1. Sources: original edition or private file intake; exact raw source and complete row/graph review.
2. Mapping and target: editable field/type/time/entity relationships, target profile and native target inspection.
3. Plan review: source-to-target payload, counts, conflicts, authored metadata and explicit write confirmation.
4. Native operation: live saved progress, exact step/request/response review, pause/cancel/resume/reconciliation, verification and compensating-plan review.
5. Receiving and history: immutable source/plan/target results, complete editable bundle, import/reopen and current-versus-earlier edition selection.

The map arm uses original STAM over the selected target/retained result view; it must not expose host credentials or invent another observation engine. Every displayed target/result selection carries its plan/job/verification identity. Navigation back to the original observation Analysis Desk remains available.

## Portable receiving

A completed package carries the selected project/history, all selected original SensorThings edition archives or raw input files, mapping and plan versions, complete native request/response journals, typed target bindings, actual verification results, operator guide and editable source closure. Paths inside the package are relative. Authentication/session values are omitted; source URL and host environment references remain provenance.

Receiving validates the complete package and original native edition archives before adopting the project. It invokes the original source edition importer for those source bytes. Repeated import is idempotent. A compatible newer history advances the same project; an older package preserves later work; divergent project histories require a separate receiving workspace. Received pending job history is available for review and requires an explicit host/target binding before any native execution.

## Current source/business authority

DataCove services: https://datacove.eu/services/
DataCove professional contact: https://datacove.eu/contact/
FROST native client: https://github.com/FraunhoferIOSB/FROST-Python-Client/tree/9f41f7794725fced63fcb07e6b33dbc1f897f2bc
STAM: https://github.com/DataCoveEU/STAM/tree/0e414f3441a8773619f242c797fe75e9af3fc04d
OGC Sensing 1.1: https://docs.ogc.org/is/18-088/18-088.html
Original project TAKE: https://tokenjunkielabs.slack.com/archives/C0BTTA66TK3/p1791815080790189?thread_ts=1791803620.539009

A favorable human response transfers further relationship messages to Bryce. Source integration and customer delivery continue in this one case.
