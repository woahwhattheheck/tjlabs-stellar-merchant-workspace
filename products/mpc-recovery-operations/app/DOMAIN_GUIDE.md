# MPC recovery operations domain

This module records the customer's actual inventory, source files, backup observations, recovery exercises and operating decisions. It performs no provider calls and sends no notifications. The initial inventory is empty.

## Issued references and planning assumptions

Use the issued Server Backup RFP and Addendum 2:
- https://www.thempc.org/docs/lit/IT/2026/MPC_Server_Backup_RFP.pdf
- https://www.thempc.org/docs/lit/IT/2026/MPC_Server_Backup_RFP_Addendum2.pdf

The 41 TB proposal baseline, up to 25 servers, 30–35 Microsoft 365 users and 24-hour RPO planning expectation are source assumptions. They are not discovered assets, approved service levels or measured results. Addendum questions 1, 4, 6, 9, 19, 20, 26, 28, 30–32, 50, 83, 97 and 100 govern the relevant scope. Formal workload tiers and detailed inventory follow the customer's assessment. Customer approval remains an explicit recorded decision.

The module contains the original MIT js-sha256 1.0.0 implementation and license. It has no imports, filesystem calls, network calls, random IDs or global clock reads. Supply actual IDs, actor names and explicit timestamps.

## Public API

- createWorkspace({id,title,createdAt,assumptions?}) returns a deeply frozen workspace. An assumption is {label,value,source,status:"planning-assumption"}.
- applyCommand(workspace,{id,actor,at,expectedRevision,type,payload}) returns {workspace,result,replayed}. Persist the returned workspace exactly.
- inspectWorkspace(workspace) verifies the complete operation chain and returns identity, revision, SHA, counts and source bytes.
- exportSnapshot(workspace) returns {schema:"mpc.recovery-snapshot.v1",workspace,sha256}.
- receiveSnapshot(snapshot) verifies the outer hash and replays all original commands from the immutable seed. It returns the exact deeply frozen received workspace; it does not invent or reconstruct a different current state.
- overview(workspace,asOf=workspace.updatedAt)
- recoveryOrder(workspace,{planId=workspace.activePlanId}={})
- serviceReview(workspace,{from,to,asOf=to})
- acceptance(workspace,{asOf=workspace.updatedAt,planId=workspace.activePlanId}={})
- restoreDue(workspace,asOf=workspace.updatedAt,{planId=workspace.activePlanId}={})
- hurricaneStatus(workspace,eventId,{asOf=workspace.updatedAt}={})
- incidentStatus(workspace,incidentId,asOf=workspace.updatedAt)
- currentRecord(versionedRecord) returns its current data.
- recordVersion(versionedRecord) returns its current full version.
- canonical(value) gives stable JSON with sorted object keys.
- sha256(value) hashes a string's exact UTF-8 bytes, or canonical JSON for another value.

All time strings require seconds and an explicit timezone. Null means unrecorded. Target and measured RPO/RTO units are minutes; restore intervals are days; sizes are bytes. Use integers for declared targets and intervals. Derived durations can be fractional.

A new command must use the current expectedRevision. Retrying the exact same command ID/body returns the original result even after later edits. Reusing an ID with other arguments fails. Correction commands additionally compare the current record version hash. The module keeps the source command and original result in an immutable hash chain.

The module validates unknown workspace objects by full replay. Engine-owned, deeply frozen create/apply/receive outputs are tracked in a private WeakSet so routine editor saves avoid replaying the entire history. Mutable objects are never trusted through this cache. A page reload must use receiveSnapshot for the retained snapshot, or inspect an unknown full workspace before operating it.

## Workspace collections

All collections are arrays:
- sources: exact immutable source records.
- plans: full plan payload plus createdAt, actor, requestId, sha256.
- approvals: {planId,decision,note,sourceRefs,at,actor,requestId}.
- backups, recoveries, hurricanes, incidents: {id,versions:[{data,sha256,at,actor,requestId,reason,previousSha256}]}.
- acceptanceRecords, acceptanceChecks, restoreSchedules and incidentReports: command payload plus at, actor, requestId.
- communications: command payload plus actor, requestId.
- operations: {command,requestSha256,result,previousSha256,sha256}.

Workspace fields also include schema,id,title,createdAt,updatedAt,revision,activePlanId,assumptions,seed.

## Immutable source files and locations

source.import payload:
{id,name,mediaType,encoding,content,bytes,sha256,origin,observedAt}

encoding is "utf8" or canonical padded "base64". bytes and sha256 must match the actual complete content. A file is limited to 8 MiB; retained distinct source records total at most 32 MiB. Original UTF-8 content is not trimmed, normalized, newline-converted or re-encoded with a different BOM policy. Browser TextDecoder must use fatal:true and ignoreBOM:true when the original BOM is retained as content. Binary or non-UTF-8 originals use base64.

SourceRef = {sourceId,locator}, where locator is:
- "whole-file";
- "line:N" or "line:N-M", using one-based actual text lines;
- a JSON pointer ("" for the root or a slash-prefixed pointer with ~0/~1 escaping).

Line/JSON references resolve against the original UTF-8 source. JSON pointers must resolve an existing value. A file title or a claimed SHA without matching raw content is insufficient.

## Plans, dependencies and approvals

plan.save:
{id,title,previousPlanId,note,sourceRefs,repositories,workloads}

previousPlanId must equal the current activePlanId (null for the first plan). Saving creates a new full immutable edition. It never edits the earlier plan.

Repository:
{id,name,location,kind,sourceRefs}
location is "local" or "offsite".

Workload:
{id,name,kind,description,dependencies,repositoryIds,rpoMinutes,rtoMinutes,restoreIntervalDays,sourceRefs}

dependencies and repositoryIds contain actual selected IDs. Every dependency must exist, self-dependencies are rejected and the complete graph must be acyclic. recoveryOrder produces topological order and parallel stages. No server, directory system or Microsoft 365 workload is invented from a published count.

rpoMinutes/rtoMinutes/restoreIntervalDays may be null until agreed. The module never substitutes 24 hours as an approved RPO.

plan.approve:
{planId,decision:"approved"|"withdrawn",note,sourceRefs}

The actor/time are retained from the command. An empty plan cannot be approved. Final acceptance uses explicit approval of the exact immutable plan edition. Recovery metrics also expose whether that approval already existed when the run started; later approval does not rewrite this fact.

## Actual backup observations

backup.import:
{sourceId,rows:[{id,externalId,rawLocator,planId,workloadId,repositoryId,startedAt,completedAt,status,recoveryPoint,complete,verifiedAt,bytes,note}]}

status is "running", "succeeded", "partial" or "failed". completedAt, recoveryPoint, verifiedAt and bytes may be null where appropriate. complete means a complete/full recovery point rather than a mere job-status label. Successful jobs require an actual recovery point. Verification requires a successful completed job. A running job cannot already have completion/verification.

The source is imported first; mapping a CSV/TSV/JSON row does not replace its raw file. A vendor job identity is externalId + workloadId + repositoryId. The same row ID and exact full data is reused; a conflicting ID or the same vendor identity under a different row ID is rejected.

backup.correct:
{id,previousSha256,replacement,reason}

replacement is the full original row shape plus sourceId. It retains the same id/externalId/workloadId/repositoryId, points to actual correcting source evidence and appends a version. Original rows and source files remain present.

Actual observed timestamps may not be in the future relative to the command. Plans and hurricane impact/schedule dates may concern the future.

## Recovery exercises and corrections

recovery.record:
{id,planId,workloadId,repositoryId,backupId,backupSha256,method,recoveryPoint,incidentAt,startedAt,serviceReadyAt,status,verified,note,sourceRefs}

method: "bare-metal", "vm", "file", "application", "m365" or "entra".
status: "running", "succeeded" or "failed".
backupId and backupSha256 are both null or both select an immutable actual backup version. A linked backup must match the plan/workload/repository/recovery point and have completed before the recovery starts.

Chronology is recoveryPoint <= incidentAt <= startedAt <= serviceReadyAt. A running run has null serviceReadyAt and cannot already be verified. A successful run needs serviceReadyAt. A verified run must be successful.

Actual RPO = incidentAt minus recoveryPoint.
Actual RTO = serviceReadyAt minus incidentAt.
Execution time = serviceReadyAt minus startedAt.

recovery.correct uses {id,previousSha256,replacement,reason}. Any correction appends a new version; earlier acceptance decisions remain bound to the specific original version hash and do not silently accept its successor.

Metrics include targetsApprovedAtRun, currentPlanApproved, target values and nullable comparisons. targetsApproved is a compatibility alias for currentPlanApproved. A proposed target is shown as proposed until the plan approval is recorded.

## Acceptance and recurring restores

acceptance.record:
{id,runId,runSha256,decision:"accepted"|"rejected",note,sourceRefs}

Acceptance of a recovery requires an actual verified successful run. Final readiness additionally requires approved plan targets and measurements meeting them. A manual acceptance record does not erase failed target measurements.

acceptance.check:
{id,planId,criterion,decision:"accepted"|"rejected",note,sourceRefs}

criterion is "monitoring", "reporting", "administrative-access", "training" or "deficiency-closeout". Retained source evidence is required. The latest decision for a criterion applies; earlier decisions remain in history.

The final readiness view requires a nonempty approved plan, local and offsite accepted recovery evidence for each workload, bare-metal recovery, Microsoft 365 and Entra configuration recovery, and all five acceptance criteria. "READY_FOR_FINAL_REVIEW" is an evidence result, not a substitute for the customer's final contractual sign-off. Missing evidence remains explicit.

restoreSchedule.save:
{id,planId,workloadId,intervalDays,firstDueAt,note,sourceRefs}

Use a new schedule ID for edits. The latest schedule for the exact plan/workload applies. If none exists, the plan's interval can be used after a qualifying accepted recovery; it does not invent a first due date. Unapproved or failed-target exercises do not reset the successful restore due date. Due views distinguish UNSCHEDULED, DUE and UPCOMING.

## Hurricanes

hurricane.record:
{id,name,planId,expectedImpactAt,mpcTriggeredAt,noticeReceivedAt,note,sourceRefs}

The MPC IT trigger precedes or equals its actual receipt, which precedes or equals expected impact. The cutoff is 24 hours before impact. Sufficient notice is evaluated from receipt of the trigger. No implicit weather warning or global clock initiates a job.

Coverage considers complete, successful, verified jobs started after receipt, completed and verified by the cutoff, for both local and offsite repositories of every workload. Actual completedAt and verifiedAt determine historical coverage; evidenceAcquiredAt is displayed separately so a later import of genuine historical job records is not mistaken for late job completion.

SHORT_NOTICE remains distinct from COVERED and INCOMPLETE. It does not invent compliance or hide missing coverage. hurricane.correct uses the normal explicit correction payload.

## Incident communications and written follow-through

incident.record:
{id,planId,title,occurredAt,detectedAt,remoteServiceLoss,status,restoredAt,note,sourceRefs,significant?,expectedOver24Hours?}

significant and expectedOver24Hours default false when omitted and are stored explicitly. status is "open" or "restored"; a restored record needs an actual restoration timestamp. incident.correct uses the normal explicit correction payload.

communication.record:
{id,incidentId,channel:"email"|"telephone"|"status-update",at,recipient,summary,sourceRefs}

Record actual communication only. Required notification needs both email and telephone records. Remote backup/access loss is immediate on discovery. A significant incident has the 24-hour awareness limit. A material outage expected to exceed 24 hours is notified on awareness/expectation with an outer limit of 24 hours from unavailability; the shortest applicable period governs. The view does not silently turn immediate into 24 hours.

Continuing qualifying incidents expose at-most-24-hour status-update gaps until restoration. Material changes also require an update regardless of the next deadline. The operating engineer records the nature, affected services, discovery, impact, corrective actions and estimated restoration in the incident detail and communication summary.

incidentReport.record:
{id,incidentId,cause,impact,correctiveActions,recurrenceMeasures,sourceRefs}

This follows recorded restoration and requires complete retained source evidence. The engine stores the selected incidentSha256 with the report; a later incident correction cannot silently reuse that report as the corrected version's final written report. Until it exists, the view keeps the written post-incident report requirement open.

## Receiving and limits

Export the complete snapshot, including every original source byte, plan edition, operation, correction and result. Reopen it with receiveSnapshot. The module validates all source byte hashes and every deterministic command/result/state transition.

Maximums are 5,000 commands and 96 MiB for the entire canonical workspace, including duplicate raw payloads retained in history. Capacity rejection occurs before the new workspace is returned. Keep the previous complete workspace intact on any error.

The module does not export cloud credentials or manipulate vendor repositories. End-of-contract transfer, account handoff and secure-deletion confirmation remain real operational obligations with their own source evidence. A JSON export alone does not claim those actions occurred.
