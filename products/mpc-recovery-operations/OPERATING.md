# Recovery operations: installation and operating guide

This product carries the complete original Recovery Operations Workspace into Stellar Forge Applications. The same recovery model, original proposal calculator and saved source history serve both the browser and agent interface. An operating team can move from proposal assumptions to an actual installation plan, review provider observations and recovery results, continue service work, and hand over a complete editable application.

Product, application kind and command family: **mpc-recovery-operations**.

## 1. Continue the original customer work

Open the existing customer case, Workshare and Installation before commissioning the application. Preserve the agreed commercial scope, phase assignments, funding sources, payment selections and actual effort. The Installation profile supplied with this product describes the complete receiving workflow and its input requirements.

Keep the proposal engineering workshare and the prime's backup service scope explicit. The complete application supports both workflows; its availability does not change the selected commercial agreement. Select actual supplier quotes, service responsibilities and customer decisions in their original records. A blank quote stays visible as a missing amount when the original planner calculates known subtotals.

The included maintained source edition continues the complete MPC recovery application whose original predecessor is Commons commit 5c2962823d313c9bbb1c37c79feb415581c7730d. It retains the same recovery model, planning data, UI, original planner, 64 response items and twelve commissioning steps. The maintained branch receiver incorporates the original launch-preparation and ordered-journal corrections, and its complete embedded-source HTML is regenerated with that receiver. The other 24 original application bodies remain byte-identical. `ADOPTION.json` records both the exact original predecessor and the maintained 26-file source selection; the earlier accepted receiving result remains attributable to its original source. The source register identifies the issued procurement material and the planning inputs. The initial operating inventory is empty so the implementation team can enter the actual installation.

The issuer page, checked on 13 October 2026, lists 15 October 2026 as the proposal deadline and links the original RFP and two addenda. Keep any procurement activity with its original owner and consult the current issuer page before acting on submission details:

- https://www.thempc.org/IT/Rfp2026
- https://www.thempc.org/docs/lit/IT/2026/MPC_Server_Backup_RFP.pdf
- https://www.thempc.org/docs/lit/IT/2026/MPC_Server_Backup_RFP_Addendum1.pdf
- https://www.thempc.org/docs/lit/IT/2026/MPC_Server_Backup_RFP_Addendum2.pdf

The following sections describe the delivered software's behavior. The complete original API reference is app/DOMAIN_GUIDE.md; the original browser and receiving guide is app/README.md.

## 2. Choose the working application and preserve its identity

The managed application uses the maintained Runtime's Node 20 or later and the existing flock storage helper. Its settings are:

| Setting | Selection |
| --- | --- |
| workspaceDirectory | Absolute directory for the actual persistent physical store |
| connectionFile | Optional designated private service connection file |
| port | Optional loopback service port |

The maintained Runtime owns the Node process and Applications manages its start, connection and stop. The first actual loopback port is retained and reused on restart so saved browser requests remain accessible at their original local origin. Keep the connection file private: it belongs with local service configuration, rather than inside a portable business export.

A physical store has its own UUID and canonical directory. Within it, each branch has a local branch identity and holds a complete original portable workspace. Several branches can therefore contain the same portable workspace ID while retaining different saved histories. An operator must select the intended branch when reviewing or changing work.

Create an installation in a new selected directory through the maintained command:

    starforge mpc-recovery-operations create \
      --workspace /absolute/recovery-workspace \
      --id STORE_UUID \
      --title "Recovery operations" \
      --at 2026-10-13T12:00:00.000Z

Use an actual new store UUID and the actual creation time in canonical UTC form, including milliseconds (for example, .000Z). To begin from an existing complete portable snapshot, add:

    --snapshot /absolute/saved-workspace.json

The default creation source is the unchanged issued baseline. Receiving the original complete snapshot carries its original portable identity and history. The new physical store identity identifies where that history is now maintained.

Review the binding for the same physical store:

    starforge mpc-recovery-operations binding \
      --workspace /absolute/recovery-workspace \
      --connection-file /absolute/private/recovery-connection.json

Select this workspace in Applications, start its maintained entry and open the returned browser address. Use the displayed branch selector and operator field before saving business work. Review the selected store and branch after opening a connection; an old browser tab must not silently change its target when another service starts.

The offline command family provides state, branches, branch, command, receive, export, report and request operations using the original complete JSON inputs. Select the actual operation's input through --input and create-only output through --output as appropriate. Use the typed client while the managed service owns the store. Keep the original app/cli.mjs with the source for portable-file operations.

## 3. Retain a complete proposal and source edition

In Proposal & capacity, receive the actual saved JSON from the original proposal workspace. The application retains the entire original file and shows the complete response register, acceptance programme, assumptions and supplier input schedule. Select another retained proposal to compare its complete saved fields.

Open the original planner to change planning inputs. Its calculation includes independent retained chains, incremental or differential restore points, independent archive copies, temporary full-copy workspace, reserved space and the declared transfer cadence. The model uses decimal TB and Gbit/s. Its four-year cost schedule keeps each year and missing quote line visible.

Record measured storage and transfer factors when they become available. Keep the original measurement file, its units, period and selected scenario with the resulting proposal edition. The original planner's calculations and preserved assumptions can then be reproduced from the complete saved case.

Download and retain the full proposal case before closing the planner. Receive a later edition into the operating workspace without replacing the earlier file. Use **Use for next plan edition** to link the selected proposal to the installation design. This control preserves current inventory and any unsaved design draft.

In Sources & intake, import the actual inventory, measurements, provider files and decisions. Retain:

- Original file name, media type, encoding and full content.
- Exact bytes, SHA-256 identity, origin and observation time.
- Exact source references for the records derived from that file.

A source reference selects the whole file, an actual one-based line or line range, or an existing JSON pointer. Binary files and text that cannot be preserved as valid UTF-8 use their complete base64 representation. Ordinary text retains its original newlines and byte-order mark where present.

The operating model allows 8 MiB per retained source and 32 MiB for the distinct source collection. Its complete canonical workspace, including operation history, is limited to 96 MiB and 5,000 commands. Review these limits against the entire intended installation population. On a capacity rejection, keep the previous complete workspace and the original incoming file.

## 4. Save the actual installation plan

In Recovery plan, enter actual repositories and protected workloads from the authorized inventory. Each repository has its selected identity, name, kind, local/offsite location and source references. Each workload identifies its repositories, dependencies, proposed recovery targets and recurring interval.

The software verifies the complete dependency graph. Every selected dependency must exist; a workload cannot depend on itself; a cycle is rejected. The recovery order view provides the resulting order and groups that can proceed in parallel.

RPO and RTO targets use minutes. Restore intervals use days. An unrecorded target remains null. Published aggregate planning inputs do not create actual hosts, protected objects or approved targets.

Save the entire plan edition. It retains the previous plan ID, original sources, actor and timestamp. A later design change creates another complete edition rather than modifying the earlier one. Review the whole plan before recording the named approval decision for that exact edition.

Approval is part of the operating record. Recovery views show both current plan approval and whether the selected targets were already approved when a recovery began. A later decision does not alter the earlier chronology.

## 5. Receive complete provider exports

In Backup jobs, load the complete selected CSV, TSV or JSON-array provider export. The import mapper preserves the original file while allowing explicit interpretation of the provider's fields.

Review the mappings for:

| Meaning | Required attention |
| --- | --- |
| Row and vendor identity | Preserve the original identity and its workload/repository scope |
| Plan, workload and repository | Select the actual saved installation records |
| Start and completion | Preserve full event timestamps and explicit timezone |
| Status | Distinguish running, succeeded, partial and failed |
| Recovery point | Preserve the actual recoverable point time |
| Completeness and verification | Record the actual whole-point and verification observations |
| Size | Convert declared units to retained bytes explicitly |
| Source position | Keep the exact original row locator |
| Note | Retain relevant provider context |

Preview the complete mapped population before committing. The source and mapping stay with the resulting records. Failed, partial and running observations belong in the operating review alongside completed jobs.

A successful job requires its actual recovery point. Verification relates to an actual successful completed job. The model rejects impossible chronology, such as a running job with an already recorded completion, and observations dated after their recording command.

The stable vendor identity combines the external job identity, workload and repository. An identical retry reuses the same row. Conflicting identities or a duplicate vendor identity under another row ID require explicit review.

To correct a record, retain the actual correcting source, complete replacement row, reason and expected current record hash. The correction appends a new version. Earlier data and its original source remain available.

## 6. Record a recovery and compare the actual result

In Restore programme, select the exact plan, workload and repository. Where a recovery uses a recorded backup, select its exact immutable version. The linked backup must match the selected scope and recovery point and must have completed before the recovery starts.

Record the actual method: bare metal, virtual machine, file, application, Microsoft 365 or Entra configuration. Retain the recovery point, incident or exercise reference time, recovery start, usable-service time, observed status, verification and source evidence.

The application computes three separate durations:

| Result | Calculation |
| --- | --- |
| Actual RPO | Incident/exercise reference time minus retained recovery point |
| Actual RTO | Service-ready time minus incident/exercise reference time |
| Execution time | Service-ready time minus recovery start |

All event timestamps require seconds and a timezone offset. Derived durations may be fractional. A running recovery has no service-ready time; a verified recovery must have succeeded. Preserve an unsuccessful attempt and record the later recovery as its own actual work.

Compare the measured RPO and RTO with the selected plan targets. Review both the measurements and approval chronology. Correction uses the full replacement, reason and expected current version hash; it does not silently revise the result that an earlier reviewer accepted.

## 7. Accept the exact recovery version and schedule the next exercise

Acceptance & handover links a recovery decision to the exact run version reviewed. The selected accepted recovery must be successful and verified. A manual acceptance decision preserves the measured target comparisons.

The readiness view assembles the approved plan, local and offsite recovery evidence for its workloads, the required recovery methods and the five operating criteria: monitoring, reporting, administrative access, training and deficiency closeout. Each criterion retains its source evidence and latest decision while preserving earlier findings.

Use the original proposal's twelve-step programme to connect assessment, measurement, design, administration, protection, recovery, monitoring, training and service handover. Record the actual outcome of each activity in the customer Installation as the work occurs.

Create a restore schedule for the exact plan and workload. Set its interval and first due time from the agreed programme. A later schedule has its own identity. The software can also use the plan interval after a qualifying accepted recovery; it does not invent an initial due date.

The due view distinguishes unscheduled, due and upcoming work. A failed-target or unapproved exercise does not reset the successful restore date. Review the whole due list when planning the next service period.

## 8. Operate incident and hurricane follow-through

In Incidents & hurricanes, record actual operational observations and retain the original evidence. The review clock is explicit so historical reporting can be reproduced.

For a hurricane record, select the plan, expected impact, actual customer trigger and received time. Coverage reviews every selected workload and both repository locations against complete, successful and verified job observations. The view separates job completion and verification from the later time at which a source file was imported.

Review the actual timing and the displayed coverage gaps. A changed forecast or corrected trigger belongs in a later version with its reason. A complete source import does not rewrite the historical event time.

For an incident, retain the selected plan, nature of the incident, occurrence, detection, service-loss scope, significance, expected duration, status and actual restoration time. Review the displayed applicable communication timing.

Record completed email, telephone and status communications with recipient, actual timestamp, summary and source references. The communications record makes the original action reviewable. Preserve the nature, impact, corrective work and estimated restoration in the incident detail and communication summary.

Continuing status updates and material changes remain visible until restoration. After restoration, record the cause, impact, corrective actions and measures against recurrence in the written incident report. The report is linked to the selected incident version. A later incident correction requires review of whether that version's written report remains complete.

## 9. Review the full service period

Select explicit from, to and as-of timestamps, including timezone. The service review uses the retained workspace at that selected review time.

Review complete backup populations and their statuses, recovery observations and targets, recurring restore work, approval and acceptance findings, hurricane coverage and incident follow-through. Resolve actual operating discrepancies through the normal correction or new-decision workflow so the report remains reproducible.

Export the complete report and full workspace. Preserve the selected reporting period with the original customer service record. Keep actual provider monitoring and support ownership with the selected operating team; the application supplies their shared records, review and handover.

## 10. Continue safely after an interruption or a conflicting edit

Every original domain command carries an ID, actor, timestamp, expected revision, type and complete payload. Preserve that entire envelope before a send.

Retrying the identical command ID and body returns its original result even after later edits. Reusing the ID with different content is rejected. A genuinely later decision receives a new command identity and the currently reviewed revision.

The managed interface adds the physical store and local branch scope. A request identifies storeId, storeDirectory and branchId, with the reviewed portable workspaceId, revision and snapshotSha256 where the operation requires an expected state. Preserve these selected identities with the request.

Opening a managed page reads the actual current selected branch. Use **Recover original request** when a saved request has an uncertain response; it resolves that original request and reopens the selected branch while retaining current editor contents. The existing explicit discard-and-reload control lets the operator choose when to abandon a draft.

A stale tab or client must review the newly saved edition before changing its expected revision. Keep its unsaved form so the operator can decide what to retain. The original offline application saves branch changes in one IndexedDB transaction against the reviewed revision and snapshot hash.

Portable receiving creates a distinct branch even when the file has the same portable workspace ID as another branch. Switch branches explicitly. An older incoming export must not replace later saved history in the original branch.

In the offline browser, unsaved forms are held separately for each branch during the current tab session. Reopening a branch restores that form and its original revision basis. Closing the tab ends that in-memory draft retention, so save or export important work before closing it.

The original browser migration preserves the complete earlier localStorage bytes and records the new branch and migration marker together. Later opens reuse the migration rather than repeating it.

## 11. Use the same saved work from an agent

The typed interface is MpcRecoveryClient or createMpcRecoveryClient. The agent configuration family is mpcRecovery, its connection input is mpcRecoveryConnection, and tool names use merchant_mpc_recovery_.

Use the returned state and branch records to select the actual current target. Send original-model commands and complete receiving inputs through the maintained client. The service maintains the same source files, model history, corrections and reports used by the browser.

For each mutation, retain the complete original request. After a lost response, recover the saved request/result before issuing a new mutation. Read the whole returned report or exported workspace; a visible page or table filter selects a view of that work.

[The managed store and HTTP reference](STORE_HTTP.md) lists every route, full method shape, request lookup, source-byte download and frozen history paging contract. History pages carry the selected snapshot identity; continue until nextOffset is null, preserving complete operation records.

The exact maintained client and tool declarations accompany this product. app/DOMAIN_GUIDE.md describes the original command payloads and result meanings. Their records remain ordinary source-backed business data rather than a separate agent-only history.

## 12. Export, independently receive and continue

Use the complete workspace export to retain all source bytes, plan editions, operations, results, corrections and decisions. The original receiving model validates the outer snapshot identity and replays the full operation chain.

Download the complete application and handover from the original interface. The application archive includes all original source files and the selected workspace. The standalone HTML includes its own compressed source and requires a modern browser with gzip DecompressionStream support.

Open the actual downloaded application in a fresh browser context. Receive the exported workspace, review its selected identity and full history, and create a legitimate later edition. Reopen it and confirm that the later work remains present. Receive the earlier export again as a separate branch and verify both histories.

Inspect all nine application sections at the working desktop width and at 390 pixels. Review complete tables, source intake, operator and branch controls, plan/correction forms, downloads and the displayed results. Retain the actual receiving observations with the original Installation.

The original portable CLI also supports full-file work from the complete extracted app directory:

    node cli.mjs summary initial-snapshot.json
    node cli.mjs receive current-workspace.json received-workspace.json
    node cli.mjs apply current-workspace.json command.json next-workspace.json
    node cli.mjs review current-workspace.json \
      2026-10-01T00:00:00Z 2026-10-31T23:59:59Z review.json

Outputs are create-only. Select actual paths and reporting dates for the operation being performed.

## 13. Retain the completed original programme and continue its successor

The original native receiving session 11912 completed on 13 October 2026 at 06:22:58.773 UTC. It operated the original planner and all 64 response items and twelve acceptance steps; the operating application covered all nine desktop sections, three downloads, a fresh received workspace at revision 4 and six mobile views.

Its accepted archive is 654,095 bytes with SHA-256:

    c6ca635c06acb75c34792de9b62c73094f59c51140ac218b58274a03715ff8a7

The later branch course continues from that exact archive. Its source adds independent browser copies, preserved drafts, transactional stale-tab rejection, reopened branches and receiving of the actual downloaded application. Preserve the earlier accepted result and the later course's own result.

Run the original branch programme from the complete extracted app source with an existing compatible Chromium and Playwright installation:

    MPC_CHROMIUM_EXECUTABLE=/absolute/path/to/existing/chromium \
    python3 run-receiving.py --browser-branches \
      --accepted-archive /absolute/path/to/MPC_Recovery_Complete_Receiving_20261013.zip

This original browser programme uses Python for supervision. The managed product service itself uses the Runtime's Node process.

The course retains its original source selection, input identity, completed actions and results. Its journal and original owned browser group permit recovery after interruption. Resume that existing operation; do not recreate completed plan saves to replace a lost observation.

The branch delivery retains both full workspace exports, actual downloaded application and handover, original input/archive identity, full receiving result, source and real screenshots. Once complete, reopening the same operation validates and returns the saved delivery. Record the successor's observed outcome from its own returned result.

## 14. Complete the customer handover and continue service

Review the customer Installation against the twelve work-order stages and actual saved outputs. Preserve unresolved implementation work with its operating owner and selected source; record a completed stage from the actual customer observation.

Hand over the complete source, selected application, full portable workspace, plan decisions, provider mappings, service-period report, recurring restore schedule, incident procedure and receiving instructions. Keep the account and credential handoff with its selected administrative process.

Continue future observations and service periods in the same maintained history. A changed installation begins with the complete new source and plan edition, followed by the actual operating work and its review.
