# Cross-case implementation operating desk

The implementation portfolio brings saved merchant cases into one operating view. Use it to find unassigned work, overdue tasks, dependencies that are not done, pending source changes and technical or customer receiving that still needs attention. It reads the original case store and applies reviewed operational edits through that same store.

Open **Implementation portfolio** from the existing Merchant Support console. The local page is `/implementation-portfolio`. This guide is also served at `/implementation-portfolio/guide`.

Related original workflows:

- [Implementation and receiving](IMPLEMENTATION.md) — workorder editions, task definitions, dependencies, materials and receiving.
- [Offline implementation review](IMPLEMENTATION_REVIEW.md) — source-bound customer or technical observations returned to the original case.
- [Complete case source packages](CASE_SOURCE_PACKAGE.md) — whole-case export, original files and receiving into another installation.
- [Source bundle operations](SOURCE_BUNDLES.md) — complete source-bearing workorders and their retained input files.

## 1. Start the original application

Use the installed Support application and its existing private case directory. A source installation starts with the original command:

~~~sh
node stellar/scf-starforge-20261009/sf74-merchant-support-console/server.mjs \
  --cases-dir /absolute/private/merchant-cases \
  --port 8784
~~~

Use the actual local URL printed by that server. The portfolio is part of this application and uses the same cases. It does not require a second database, a copied case inventory or another scheduler. A configured private case directory is required.

The header displays the served workspace identity. Browser working state and saved native requests are bound to that identity. If the server at the same address is changed to another case directory, the page stops operations and asks you to reopen it. A recovery from one workspace is not silently attached to another.

## 2. Capture the case selection

Complete the four source controls under **Capture saved case heads**:

| Control | Meaning |
| --- | --- |
| Case search | Original case search over the existing saved inventory. |
| Case status | Exact original case status. Leave it empty to include all matching statuses. |
| Case follow-up through | Includes cases whose original case follow-up date is through the selected date. This is not a task deadline. |
| Report as of | Explicit calendar date used to assess task overdue flags. It does not rewind case history or receiving observations to that date. |

Choose **Capture current case heads**. The original case store scans its case inventory once and retains the observed revision for every selected case. The resulting selection contains its workspace ID, capture time, case query, report date, case summaries, unavailable case IDs and a SHA-256 identity.

Each case revision is immutable. The scan is a sequence of individual case-head observations, not one transaction across all cases. A concurrent operator may save a later revision while the scan is running. The portfolio keeps the actual revision it observed for each case and displays that source identity.

Use **Download selection JSON** to retain this exact selection. **Open saved selection** validates a complete selection from the same workspace through the original service. Do not edit its case IDs, revisions, metadata, query or hash by hand. The native service checks the complete selection hash and reopens each original saved revision.

A new capture replaces the visible selection and clears selected task IDs after confirmation. Operational edit fields remain available. Save or download working-state recovery before replacing a selection if you want to preserve the complete current task group and draft.

### Source coverage

A captured head can become unreadable, or a saved source may fail validation. The desk reports those cases under **Unavailable case sources** and keeps the page diagnostics. It does not substitute a current case, skip a failed source without a record, or claim that an unreadable case has no tasks.

Task pages read the selected immutable revisions. **Load more tasks** continues from the service's exact cursor. An empty page can still have another cursor when cases have no matching tasks; continue until the desk reports that the selected scan has finished. The count on a partial view is only the number of rows loaded so far.

A finished scan with unavailable sources is explicitly identified. The complete report carries the same coverage findings. To repair an unavailable case, use the original case recovery workflow and then reopen the saved selection or make a new capture.

## 3. Find the work that needs attention

Task filters operate inside the selected case inventory. Changing a filter does not recapture current case heads. Choose **Apply task filters** after editing filters; the cursor restarts over the same source selection. The desk prevents a changed filter from continuing a page cursor derived from the previous filter.

| Task filter | Meaning |
| --- | --- |
| Task search | Searches case name, merchant, case owner, plan title, implementation and receiving owners, task ID, task title and task owner. |
| Owner contains | Case-insensitive substring match on the original task owner. |
| Task status | Exact native task status: planned, in_progress, ready, done or retired. |
| Task deadline through | Includes tasks with a nonempty deadline through that date. It is separate from case follow-up. |
| Include retired tasks | Includes tasks with original retired flag or retired status; they are excluded by default. |

The **Attention** filter has these exact meanings:

| Attention | Saved-source interpretation |
| --- | --- |
| All tasks | No additional attention condition. Other filters still apply. |
| Overdue | An active task not marked done has a deadline earlier than the selected report date. A deadline on the report date is not overdue. |
| Unassigned | An active task has an empty or whitespace-only owner. |
| Blocked by dependencies | At least one saved dependency has a work status other than done. Retiring a dependency does not mark it done. |
| Source changes | The original source has proposed task-definition changes awaiting adoption. |
| Stale receiving | A selected technical or customer observation no longer matches the task's current saved subject. |
| Changes required | A current receiving observation has outcome changes_required. |
| Technical receiving open | No current technical observation has outcome accepted or not_applicable. |
| Customer receiving open | No current customer observation has outcome accepted or not_applicable. |

The service uses the original receiving history, supersession relationships, active workorder edition and original subject comparison. It does not infer acceptance from task status or from a delivery file being present. **Done** records work progress. Technical acceptance and customer acceptance remain separate attributed observations.

The report date controls overdue calculation only. The rows and receiving history come from the listed saved case revision, including observations present in that revision. For a historical operating view, open an actual retained selection with the intended case revisions.

### Inspect a task

Choose its task title to open **Original task and delivery source**. The detail includes:

- Complete task definition and acceptance criteria.
- Original plan, dependencies, source values and pending proposed changes.
- Linked original materials, hashes and available byte metadata.
- Full task receiving history and current summaries.
- Exact case and source references.

The complete raw response is available for inspection. Hashes identify retained original files; they do not imply that the portfolio itself includes those file bytes.

The original **selected revision** link opens that saved revision in the existing case application's earlier-version-as-draft workflow. It is not a separate read-only screenshot. Review the original application’s save controls before making changes there. **Current case** opens the latest original head. **Complete case handoff** opens the existing case package workflow.

Changing portfolio filters does not discard a selected task group. The selection summary makes this explicit; tasks hidden by a new filter can still belong to the proposed one-case edit. Use **Clear selected tasks** to start a different group.

## 4. Review operational edits in one case

Check tasks from one captured case revision. Tasks from different cases cannot be combined into a single portfolio apply. To edit another case, clear the selected task group first.

The desk supports exactly four original operational fields:

| Field | Limit and behavior |
| --- | --- |
| Owner | Up to 200 characters. A checked empty field clears the owner. |
| Deadline | An actual YYYY-MM-DD date. A checked empty field clears the deadline. |
| Status | planned, in_progress, ready, done or retired. |
| Notes | Up to 64,000 characters. A checked empty field clears notes. |

Only checked fields are included in the change input. Unchecked fields retain their saved values. The same checked change applies to each selected task. This is useful for assigning a complete work group, moving its deadline or adding a shared operational note. Use the original case desk when tasks need different definitions or different per-task changes.

The portfolio does not edit task titles, acceptance criteria, dependencies, source-retirement flags, original materials, workorder editions or receiving observations. Use the original implementation workflow for those changes.

Enter the actual **Actor**. Choose **Review selected changes**. The native service opens the selected revision, verifies that it is still the current head and produces complete before/after task objects with a preview hash. It rejects an unchanged edit.

Review all rows and warnings. In particular:

- Setting status to done does not create technical or customer acceptance.
- Setting status to retired removes the task from the default active view.
- A task's separate original retired flag remains unchanged by a status edit.
- A dependency whose status is not done remains unresolved by this edit.

Check the confirmation and choose **Apply through the original case writer**. The browser first saves the full request with its UUID, actor, recorded UTC time, expected original case revision, selected task IDs, changes and preview hash. It then calls the original service.

The service derives one native save_tasks command and uses the original case compare-and-save. A successful edit creates one native implementation event and one case save. It does not issue one unrelated write for each row.

### Concurrent source changes

If another writer advances the case after capture or review, the original revision check can reject the edit. The browser retains the exact request and rejection. Reconcile it as described below before preparing another request for that same case. Capture the current case, inspect the actual changes, and create a fresh preview.

Do not change the body associated with a saved request UUID. Do not replace its expected revision with the current revision and call it a retry. A genuine retry uses the entire original body unchanged.

The completed receipt reports the original operation and may expose a later current case revision on replay. The initial captured portfolio remains pinned to its earlier case revisions. Make a new capture when you want to inspect the latest result.

## 5. Recover after a lost response

**Saved requests and working-state recovery** lists retained requests for the current workspace. An unresolved request blocks a new mutation for that same case. Other cases remain available under their own revision checks. Reading sources, inspecting details and downloading evidence remain separate from that mutation.

Each saved request contains its complete body and SHA-256 identity. The browser validates the returned workspace, request UUID, input hash, native command hash, case identity and selected task IDs before accepting a completion.

| Action | Result |
| --- | --- |
| Read original status | Reconciles the exact saved request against the original case event history. |
| Retry same original request | Sends the same complete body and UUID. Original native replay prevents an additional event for the same operation. |
| Download exact request | Saves the complete retained browser request record, including original input and any receipt/error. |
| Reconcile rejected request | Available for a complete recognized native rejection. It checks the same exact native status before allowing the rejected request to be archived. |

A network error, malformed reply, response with a different identity or browser receipt-write failure remains uncertain. The browser keeps the saved original request. It does not infer that the server failed merely because no usable response reached the page.

A native **NOT_STARTED** result means the original service found no completed event for that exact request. It permits retrying that same request. It is not permission to adopt a different request body under the same UUID.

A complete native rejection followed by matching NOT_STARTED can be archived as rejected. Its full body and error remain in history. If status instead finds completion, the desk retains that completion.

Downloading the retained selection, exact request or working-state recovery, restoring recovery, and reloading locally saved working state do not require the Support server to remain online. Native status, retries and source reads still verify the actual served workspace before calling its service.

If the browser already retained a completed receipt, a stale tab cannot downgrade it to pending or uncertain. Refresh saved requests to see the current local record. Native state remains authoritative even if browser storage is cleared.

## 6. Working drafts and browser storage

The browser saves its selection, filters, selected task group and operational edit fields in IndexedDB. The working record uses a compare-and-save revision. Two tabs cannot silently overwrite each other’s working state.

If another tab saves first, the page preserves the visible draft, flags the conflict and blocks a new apply. Use **Download working-state recovery** before choosing **Reload saved working state**. Reload explicitly replaces the visible draft with the stored version.

If IndexedDB cannot be opened, source reads and downloads remain available. The page warns that edits are held in memory. Native apply is disabled because the original request cannot be durably saved before dispatch. The native CLI can be used with explicit input and output files.

A working-state save failure also preserves the visible draft. The leave-page warning covers unsaved filter, capture and edit fields even when no tasks are selected. Download recovery before closing the page. Do not treat a browser quota or storage error as evidence that a previously sent native operation did not complete.

### Recovery JSON

**Download working-state recovery** includes:

- Original workspace identity.
- Complete captured case selection.
- Current filter and operational edit fields.
- Selected task IDs and their original case revision.
- Saved native request bodies, receipts and failures.

The recovery file limit is 64 MiB. If a full history exceeds it, download individual request records and the selection separately. Keep a saved working-state recovery whenever local browser storage is unavailable.

**Restore working-state recovery** accepts a recovery from the same original workspace. It validates request input hashes and preserves existing request identities. It never overwrites an existing UUID with a different body. Imported request receipts require native status reconciliation before they can be treated as complete.

The recovery JSON is an operator-state backup, not a whole-case package. It contains source references and operational notes, which may be private. Share it according to the original case’s intended recipients.

## 7. Export the complete operating report

After applying task filters, use **Download complete report JSON** or **Download complete report HTML**. The service walks the same pinned selection until its cursor is exhausted, independently of how many pages the browser has loaded.

The report includes selected case summaries, exact revisions, matching task rows, task/receiving distinctions, query, source selection and unavailable-case coverage. The browser verifies the complete returned text against the service’s byte count and SHA-256 before downloading it.

The full report limit is 64 MiB. An oversized report fails with an explicit error; it is never silently truncated. Narrow the case capture or task filters and export again.

The HTML is a standalone printable operating report. It does not contain the original source archives or every material. Use the original **Complete case handoff** workflow when another operator needs the actual case, files, saved history and receiving capability.

## 8. Native CLI

The installed command is:

~~~sh
starforge merchant-implementation-portfolio ACTION \
  --cases-dir /absolute/private/merchant-cases \
  --input /absolute/requests/input.json \
  --out /absolute/results/output.json
~~~

Supported actions are capture, page, detail, preview, apply, status and export. Use `starforge merchant-implementation-portfolio --help` for the installed command help.

All actions require a complete input JSON file and an explicit output path. Output is create-only or verified compatible exact existing output. The CLI never silently replaces an unrelated file.

The CLI uses the original private-file reader. Keep the input and output as regular files owned by the operating user, with owner-only permissions (for example, `chmod 600 /absolute/requests/input.json` on a POSIX host). Its output writer creates private files and refuses symlink inputs or output replacements. Keep input and output filenames distinct.

Inputs are the original service input shapes below. Values in angle brackets are placeholders; use actual retained case UUIDs, full revisions, task IDs, source selection and hashes.

### Capture

~~~json
{
  "q": "",
  "status": "",
  "dueOn": "",
  "asOf": "2026-10-13"
}
~~~

~~~sh
starforge merchant-implementation-portfolio capture \
  --cases-dir /absolute/private/merchant-cases \
  --input /absolute/requests/capture.json \
  --out /absolute/results/selection.json
~~~

The output is the complete selection. To page or export, put that complete JSON object into the input's selection property. There is no separate --selection flag or implicit file reference.

### Page

~~~json
{
  "selection": "<replace this string with the complete captured JSON object>",
  "query": {
    "q": "",
    "owner": "",
    "status": "",
    "attention": "overdue",
    "dueOn": "",
    "includeRetired": false
  },
  "cursor": null,
  "limit": 100
}
~~~

Use the returned nextCursor unchanged for the next page. Stop when it is null. Retain unavailable findings and case summaries from every page. A page with zero matching rows can still have a next cursor.

### Detail

~~~json
{
  "caseId": "<original-case-uuid>",
  "revision": "<full-selected-case-sha256>",
  "taskId": "<original-task-id>",
  "asOf": "2026-10-13"
}
~~~

The complete detail retains task definition, source changes, plan, materials and receiving history at that revision.

### Preview

~~~json
{
  "caseId": "<original-case-uuid>",
  "expectedRevision": "<full-current-case-sha256>",
  "taskIds": ["<original-task-id>"],
  "changes": {
    "owner": "Actual responsible operator",
    "dueOn": "2026-10-20",
    "status": "in_progress",
    "notes": "Actual operating note"
  }
}
~~~

Omit each field that should remain unchanged. Do not send all four merely because the example includes them. Keep the complete returned preview and its previewSha256.

### Apply and status

Both actions use the same full original JSON input:

~~~json
{
  "caseId": "<original-case-uuid>",
  "expectedRevision": "<full-reviewed-case-sha256>",
  "taskIds": ["<original-task-id>"],
  "changes": {
    "owner": "Actual responsible operator"
  },
  "previewSha256": "<full-native-preview-sha256>",
  "requestId": "<new-uuid-v4>",
  "actor": "Actual operator applying the change",
  "recordedAt": "2026-10-13T12:00:00.000Z"
}
~~~

Generate and save the actual UUID and UTC operation time once before applying. The illustrated time is not a recommended observation time. A retry and status query must read the same input file unchanged.

~~~sh
starforge merchant-implementation-portfolio apply \
  --cases-dir /absolute/private/merchant-cases \
  --input /absolute/requests/reviewed-apply.json \
  --out /absolute/results/original-apply-receipt.json

starforge merchant-implementation-portfolio status \
  --cases-dir /absolute/private/merchant-cases \
  --input /absolute/requests/reviewed-apply.json \
  --out /absolute/results/original-status-receipt.json
~~~

If stdout or the response is lost, rerun apply with the same input and output path. The CLI reconciles the original operation before handling an existing output. It can retain the first valid historical receipt even when the original case later advanced and a fresh replay result reports a newer current case or replayed:true. The retained output is identified explicitly; its old bytes and hash are preserved. An unrelated output file is a conflict.

Do not fabricate a new UUID to recover an uncertain accepted request. First reconcile its original complete input.

### Export

~~~json
{
  "selection": "<replace this string with the complete captured JSON object>",
  "query": {
    "q": "",
    "owner": "",
    "status": "",
    "attention": "all",
    "dueOn": "",
    "includeRetired": false
  },
  "format": "html"
}
~~~

~~~sh
starforge merchant-implementation-portfolio export \
  --cases-dir /absolute/private/merchant-cases \
  --input /absolute/requests/report.json \
  --out /absolute/results/implementation-report.html
~~~

The export output is the complete report body, not the HTTP metadata wrapper. Choose format json for the full machine-readable report.

## 9. HTTP and integration contract

The original local host exposes GET `/api/implementation-portfolio/config` and POST capture, page, detail, preview, apply, status and export under the same base path.

POST bodies must be complete same-origin JSON. The host owns cancellation signals. The configuration reports actual workspace identity, supported task statuses and attention filters, the 16 MiB selection limit and 64 MiB request/report limits.

The local static assets are:

| URL | Source |
| --- | --- |
| /implementation-portfolio | implementation-portfolio.html |
| /implementation-portfolio/app.mjs | implementation-portfolio.mjs |
| /implementation-portfolio/style.css | implementation-portfolio.css |
| /implementation-portfolio/model.mjs | implementation-portfolio-model.mjs |
| /implementation-portfolio/guide | IMPLEMENTATION_PORTFOLIO.md |

Every case edit reaches the original native commissioning command and case store. The desk does not add an alternate history, acceptance engine or case migration format. Original host shutdown waits for accepted service operations before closing their source dependencies.

## 10. Full operational receiving

To transfer actual implementation work to another operator:

1. Open the selected original case or current case deliberately.
2. Use its complete case package workflow to export the original source, files and saved history.
3. Receive that complete package through the installed original receiver.
4. Open the received local case and inspect its actual local case identity and retained history.
5. Capture a new portfolio selection from the receiving workspace.
6. Use the new workspace’s actual case UUIDs and revisions for subsequent edits.

A selection or pending request from the source workspace continues to identify that original workspace. Do not rewrite it to pretend it belongs to the receiving installation. The received case's original history remains available through the native case package, while new local portfolio operations use the receiving workspace's identity.

For a delivered application, inspect the actual browser at desktop and narrow widths using saved real cases. Exercise capture, partial paging, complete report, source detail, one native preview/apply, same-request recovery and whole-case receiving on the original admitted programme. Preserve actual output and process receipts. Source parsing and this operating guide do not by themselves establish that a customer operated or accepted the application.


## 11. Continue the completed original case through the full receiving course

The complete installed course is `tools/receive_implementation_portfolio.mjs` under this Support component. It follows the existing completed Support receiving operation. It does not create an unrelated demonstration case or require a second concurrently running owner.

Use the actual completed original workspace, its selected input and the current owner's existing Node/Chromium/Python installation. The course requires:

- Original `implementation-operation.json` with status COMPLETED and every original resource-release result closed.
- Original `original-input.json`, whose operator.name supplies the actual actor.
- The original received case in `receiver-cases`, with its actual final exported revision.
- Complete installed source and a complete source map whose entries match every actual file.
- A separate private output directory outside both the original workspace and source tree.
- The already installed Playwright module directory, Chromium executable and Python executable.

The original owner should select an actual active task with a current receiving observation for the source-change comparison. Retain the selected task IDs and explicit reviewed edit values in the input. Do not invent an accepted task, rewrite the original case UUID or replace the original participant with a demonstration name.

### Exact command

~~~sh
node /absolute/source/stellar/scf-starforge-20261009/sf74-merchant-support-console/tools/receive_implementation_portfolio.mjs \
  --source /absolute/source \
  --source-map /absolute/input/complete-source-map.json \
  --baseline-workspace /absolute/completed-original-support \
  --workspace /absolute/separate-portfolio-continuation \
  --input /absolute/input/portfolio-native-input.json \
  --modules /absolute/existing/node_modules \
  --browser /absolute/existing/chromium \
  --python /absolute/existing/python
~~~

The input is an original reviewed operation record with schema `stellar-forge.implementation-portfolio-native-input.v1`. Its fields are:

| Field | Original source |
| --- | --- |
| operationId | The owning programme's retained following-operation identifier. |
| baselineOperationId | Exact completed original journal operationId. |
| baselineCaseId | Exact original journal receivedCase.id. |
| baselineRevision | Original finalExport.caseRevision, or steps.final_complete_native_delivery.revision when that original result uses the alternate field. |
| actor | Exact original-input.operator.name. |
| asOf | Actual selected YYYY-MM-DD report date. |
| taskIds | Nonempty, distinct active task IDs from the original saved implementation. |
| changes | Reviewed owner/dueOn/status/notes change set for the browser operation. |
| followupChanges | A further actual operational change set for current-case conflict and recovery. |
| definitionPatch | One selected task's id plus an explicitly reviewed changed title or acceptance value. |
| receiverChanges | A real later owner/dueOn/status/notes change made in the fresh received case before replaying the original receive. |

The definitionPatch is used by the course through the existing original implementation command to make receiving-currentness observable. It is not an additional portfolio editing capability. The selected task must already have an actual current technical or customer observation in the completed original case. The initial and follow-up changes keep its work status active for that comparison.

### Complete course behavior

The same programme:

1. Exports the complete original case and receives two independent local copies through the native package receiver, retaining the original source and history.
2. Captures both actual saved case heads, walks their complete pinned task pages, opens real task/material/receiving detail and operates the browser at desktop and narrow widths.
3. Applies a reviewed change through the actual browser after retaining the request. It deliberately drops a real accepted response, then reopens the same browser profile, reconciles the exact original request and verifies one original event.
4. Confirms the independent second received case remains unchanged. It preserves the first native CLI apply receipt.
5. Makes the explicitly selected definition change through the original native writer, observes the stale preview rejection and earlier receiving subject, and performs the fresh follow-up operation.
6. Replays the first original request after those later edits and verifies that native replay does not overwrite them.
7. Exports complete JSON and HTML reports, opens the actual report at narrow and desktop widths, and reopens the first CLI receipt without replacing its original bytes.
8. Exports the complete final case, receives it through the original receiver, edits that received local case, repeats the exact earlier receive and verifies the later local edit and full readable history remain intact.

The course retains its exact source selection, original input, original request bodies, completed results, screenshots, output identities and final received case in the separate continuation directory. Its primary journal is `implementation-portfolio-operation.json`. The original case and source directories remain selected inputs.

### Owning process and recovery

The course creates an exclusive `active-owner.json` for its actual process. If a previous owner record remains, the maintained outer programme must reconcile that exact process before recovery. Do not remove a live owner's record or start a parallel copy to bypass it.

On continuation, keep the same operation ID, complete reviewed input, source map, original baseline and existing Node/modules/browser/Python paths. The course retains the original browser origin and server port so the persistent profile reopens the same browser storage. The programme retains request bodies before each operation and reuses their original responses or request IDs. Completed-stage recovery verifies its retained artifact files before skipping that stage. A completed-operation reopen verifies the full reports, screenshots, inputs, original and received packages, retained native source members and selected historical case bodies. Later current case edits remain intact. A failure remains attached to its stage and source. Follow the actual original owner’s recovery path rather than manufacturing a new case, request or output directory.

Before claiming completion, inspect the recorded native output, actual desktop and narrow screenshots, full reports and complete case packages. Open the screenshots and look at the rendered controls and text; a screenshot path is not a visual review. Open every outgoing artifact and original attachment, operate the selected product and reopen the fresh receiver. The following course remains part of the already accepted native programme; source publication alone is not execution or customer acceptance.
