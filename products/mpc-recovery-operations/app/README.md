# Recovery Operations Workspace

Open recovery-operations.html in a current browser. The complete application operates locally and carries its original public planning baseline. Enter the operating engineer before saving work. The review clock is displayed in UTC.

## Operating workflow

1. In Sources & intake, retain the existing proposal/planning export, actual installation inventory and provider records. Original UTF-8 and binary files retain complete bytes and SHA-256 identities.
2. In Recovery plan, enter actual repositories and workloads, assign repositories, record recovery dependencies, and retain proposed RPO/RTO targets in minutes. Save the complete plan edition. Record the named plan decision when the operating organisation adopts it.
3. In Backup jobs, load a complete CSV, TSV or JSON-array provider export. Explicitly map its identifiers, statuses, recovery point, verification, units and timezone. Preview the mapped records, then import the complete file. The original export and mapping are retained with the records.
4. In Restore programme, record the actual recovered point, incident/exercise reference time, start and service-ready time. Select the exact saved backup version when applicable. Record the observed recovery result and verification. Establish the recurring restore schedule from the selected plan.
5. In Incidents & hurricanes, retain actual incident times, operational triggers, forecast changes and communication observations. The application calculates the relevant review timing. Communications are records of completed work.
6. In Acceptance & handover, record the review against an exact recovery version, retain operational acceptance findings, select the service period, and export the complete handover.
7. Receive workspace.json to create a separate browser workspace with all source editions, plans, records, corrections, decisions and history. Use the Browser workspace selector to return to an earlier branch. The handover ZIP includes the full receiving application and original source files.

## Plan editions and corrections

A saved plan is immutable. A later edition continues the active plan and retains its source references. Workload dependencies are checked as a complete graph before saving. A plan's approval is a named operating decision.

Backup, recovery, incident and hurricane observations retain their earlier versions when corrected. The correction carries the reason and expected prior hash. Acceptance points at the exact recorded recovery version. Reusing a command ID with changed content is rejected; replaying its identical request returns its original result.

An imported file is not an approved installation plan. Published aggregate capacities remain marked planning assumptions. The initial workspace deliberately contains the issued source facts and no customer host inventory or operational results.

## Metrics

RPO is the elapsed time between the retained recovered point and the incident/exercise reference time. RTO is the elapsed time from that reference until service readiness. Execution duration starts when recovery work began. These values use explicit timestamp offsets and remain linked to the exact plan edition.

The restore schedule follows accepted successful recovery observations. Hurricane coverage refers to the selected workload/repository scope and the actual job observations. Incident review retains both communication channels, continuing-update gaps and the written resolution report.

## Full receiving

Use an existing Node.js runtime for CLI operation:

    node cli.mjs summary initial-snapshot.json
    node cli.mjs receive current-workspace.json received-workspace.json
    node cli.mjs review current-workspace.json 2026-10-01T00:00:00Z 2026-10-31T23:59:59Z review.json
    node cli.mjs apply current-workspace.json command.json next-workspace.json

CLI outputs are create-only. The actual command payload API is documented in DOMAIN_GUIDE.md and implemented in domain.mjs. Imported command IDs, timestamps, actors and revisions remain explicit.

Run the complete browser/CLI receiving programme in a dedicated extracted application directory:

    python3 run-receiving.py

It uses existing Node.js and Playwright. It opens every real application section, exports the complete issued-source workspace, receives it in a second browser context, checks mobile layout and retains actual screenshots and receiving results. The initial workspace has no invented backup jobs or recovery outcomes. Actual customer installation commissioning is performed through the normal operating workflow.

## Source and delivery

The source-register.json file links the issued MPC solicitation/addenda and the existing proposal/planner work. The core model, UI, import mapper, styles, CLI and receiving programme are all included in this application download. Original MPC procurement documents remain with their issuer and the original intake page.

This engineering application is distributed under the MIT licence. The embedded SHA-256 implementation retains its upstream MIT notice in domain.mjs.

## Runtime limits

A retained source is limited to 8 MiB, the full source collection to 32 MiB, and the complete operating workspace to 96 MiB. Browser storage capacity varies: export the complete workspace whenever a browser cannot persist it. The immutable source and history are retained in the exported file even when local browser storage is unavailable.


## Original proposal → operating delivery

The Proposal & capacity section receives the complete saved JSON from the original MPC proposal workspace. Its unchanged eight-file source is included in `proposal/`, pinned to Commons `34aafb8b181e7e4a8fa21f05cd5c27707abe73ca`. The original capacity/transfer calculator remains byte-identical (SHA-256 `58493e4e4339ba0bbc662fb75fee62cd7ceb0af4bdc79e0736d1a8aebd6ff7e0`).

Import the saved proposal case; the application retains its exact original bytes and shows all 64 response items, all 12 proposal acceptance steps, complete assumptions, supplier quote inputs and four-year known subtotals. Select another retained case to compare all saved fields. Download the original planner to revise planning inputs; save and receive its new edition without replacing any earlier source.

Use **Use for next plan edition** to link the complete proposal to the installation design. Existing inventory is preserved, including an unsaved current draft. Add the actual repositories and workloads, agree their targets and record the plan decision in the operating workflow. Proposal acceptance notes remain attached to their source; operational acceptance is recorded against actual recovery runs and procedures.

The CLI supports the same exact intake:

```sh
node cli.mjs proposal current-workspace.json saved-proposal-case.json next-workspace.json "Operating engineer"
```

The full native programme opens the original planner, saves an explicit 0.85-throughput planning edition with capacity and service-report response decisions, reopens it and exports its complete report/CSV. It then receives that exact case in the operations application, creates its source-linked installation design, saves the complete handover/application/workspace, and receives the actual downloaded application in a separate browser context. All nine operating sections and six phone-width views are included. Every output stays in the same receiving operation.

The HTML packages the complete application source internally and loads its own compressed source locally. It requires a modern browser with gzip DecompressionStream. Application/handover downloads strip the temporary runtime script before saving so each received copy starts exactly once.

## Receiving on an existing Chromium installation

Set `MPC_CHROMIUM_EXECUTABLE` to the existing compatible Chromium or Chrome for Testing executable when Playwright's standard cache is empty. The native programme keeps the original operation and starting time, retains previous attempts, and reuses the completed CLI receiving result after comparing its full workspace. Its operating lock is advisory and releases when the process ends. The delivery archive contains complete source, saved cases and reports; browser screenshots stay local for layout review. Reopening a completed delivery returns its original archive receipt.


## Independent browser workspaces and concurrent editing

Each saved browser workspace has a local branch ID independent of the portable workspace ID. Receiving a complete portable file always creates a separate branch. It preserves the current branch, including later saved history, even when both files carry the same portable workspace ID. Select **Browser workspace → Open selected workspace** to move between the original and received branches. The selected branch and revision remain visible.

Browser records use IndexedDB. A save verifies the exact branch ID, portable workspace ID, reviewed revision and complete snapshot SHA-256 within the same read/write transaction that commits the next edition. If another tab has saved first, the original form remains available and the conflicting save is rejected. Use **Discard form and reload saved edition** when you choose to abandon that form and review the current branch. Source imports, receiving and application downloads retain their selected branch and reviewed snapshot before waiting for file or decompression work.

On first open, the application validates the exact prior `mpc-recovery-operations.v1` localStorage value, copies it into its own branch, and commits the migration marker with that branch in one transaction. The original localStorage bytes are preserved. Reopening the application reuses that migration; it does not create another branch from unchanged legacy bytes. No original workspace is silently replaced by an issued baseline.

Unsaved forms are remembered separately for each branch during the current tab session. Returning to a branch restores its form and original revision basis. If another tab advanced that branch, the remembered form cannot overwrite the newer edition. Unsaved forms are not a substitute for saving or exporting work; closing the tab ends this in-memory draft retention.

### Delivery edition history

The original receiving operation completed on 2026-10-13 at 06:22:58.773 UTC (session 11912): the unchanged proposal planner exercised its 64 responses and 12 acceptance steps, the operating application completed all nine desktop sections and three downloads, a fresh browser received revision 4, and all six mobile views completed. Its 33-member archive is 654,095 bytes, SHA-256 `c6ca635c06acb75c34792de9b62c73094f59c51140ac218b58274a03715ff8a7`.

The branch-storage edition adds independent browser copies and transactional save checks. The later receiving programme below operates those exact controls and the exported application. The earlier completed archive remains the accepted result for its original source edition. This successor carries the complete new programme; its browser execution must be reported from its own result rather than inferred from the earlier completion.


## Receiving the independent browser branches

The explicit branch course starts from the complete workspace inside the previously accepted archive. It preserves that archive and the original default receiving programme. Select an existing Playwright installation and compatible Chromium, then run from the complete extracted application directory:

```sh
MPC_CHROMIUM_EXECUTABLE=/absolute/path/to/existing/chromium \
python3 run-receiving.py --browser-branches \
  --accepted-archive /absolute/path/to/MPC_Recovery_Complete_Receiving_20261013.zip
```

The required original archive is exactly 654,095 bytes with SHA-256 `c6ca635c06acb75c34792de9b62c73094f59c51140ac218b58274a03715ff8a7`. Its original retained location is `/workspace/scratch/9b238a12a516/mpc-recovery-complete-receiving-20261013/MPC_Recovery_Complete_Receiving_20261013.zip`; its saved identity is `libfile_a0a1c7a3371881919796ea791ec25ffc`, version 0. A moved copy is accepted only when its complete bytes match. The receiver finds the unique original browser-workspace member and validates its portable snapshot and full operating history.

This course uses the actual operating controls to:

1. Migrate the exact earlier browser value into IndexedDB while retaining every original localStorage byte.
2. Receive a separate branch with the same portable workspace ID, retain distinct local branch identities, and switch between two unsaved plan drafts.
3. Save a labelled receiving-exercise plan edition in each branch. These edits retain the actual accepted plan and source; they do not introduce customer hosts, backup results or recovery outcomes.
4. Open a second real tab against the original branch, save in the first tab, and receive the actual stale-tab rejection while preserving its unsaved form. The engineer's explicit discard/reload then receives the saved edition.
5. Close and reopen the browser, recover both branch editions, export both full workspaces, and verify the original legacy bytes remain unchanged.
6. Review all nine operating sections at desktop and 390-pixel widths, retaining the real screenshots and horizontal-layout checks.
7. Download the complete handover and application archives. Receive the actual downloaded HTML in a fresh independent browser profile, receive both exported workspaces, and verify full-history round trips. The downloaded application's branch toolbar must occur once and its operator, receive and export controls must be usable.

Application export removes generated branch controls and temporary runtime scripts before saving the standalone HTML. It also removes only the temporary control locks introduced by an in-progress operation; genuinely disabled form controls retain their intended state.

### Original-operation custody

The course retains its input, complete selected source, first action results, exact exports and result journal under `receiving-branches/`. It uses the original `complete-receiving.lock`, inherited by the Node receiver. The browser's dedicated profile and retained launch identity include actual process identity, boot, PID namespace and private process group. Reentry checks the original owned group and closes only that group. A missing launch identity, a changed host/namespace, a changed source selection, conflicting retained bytes or an unresolved browser outcome stops for explicit reconciliation.

Completed action results are reused. When an original plan save is acknowledged but its stale-tab proof was lost, the receiver stops rather than adding another plan edition to recreate evidence. The fixed local origin is `http://127.0.0.1:18741/`; a conflicting listener must be resolved before the same operation continues.

The receiver closes each browser before opening the next profile and independently closes its local server. SIGTERM and SIGINT join the same shutdown promise: an in-flight launch settles its original process receipt, then the complete owned browser group and HTTP server close. Launch admission is bounded so the existing Python owner's termination grace covers that cleanup. A successful result requires both resource closures, complete artifact hashes and the selected source identity. Once COMPLETE, reentry validates and reuses the completed files without reopening the browser.

### Complete branch delivery

The explicit mode writes `MPC_Recovery_Branches_Receiving_20261013.zip` and its `receiving-branches/delivery-result.json` receipt. The deterministic archive includes all 26 application source files, the accepted input and its original archive identity, source selection, complete receiving result, both branch exports, downloaded application/handover outputs and real screenshots. Browser profiles and private process-control records are excluded. The complete archive recipe is retained before publication; an interrupted archive publication can be recovered only by exact reconstruction from that same recipe.

The no-argument `python3 run-receiving.py` entry retains the original receiving behavior. Its completed 11912 archive and receipt are separate from the new branch course. Publishing this source or verifying its syntax does not claim that the new native course has completed.
