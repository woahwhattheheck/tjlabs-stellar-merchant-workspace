# Continue the original Event workbook through colleague review and native receiving

This following chapter completes a real customer's existing Analysis operation: issue the entire native worksheet proposal, work independently in the producer and reviewer copies, compare the complete returned arrays with the current producer choices, record explicit decisions, apply them through the installed agent, and receive the whole customer delivery. The original receiving parent owns the native client, workspace, process lease, browser and final archive.

Use `workbook-colleague-review.mjs` from this directory, or the installed `/buyer/event-workbook-colleague-course` export. Its functions are callable from the existing parent. They do not create a service, workspace registration, browser context, worker allocation or background poller.

## Original operation and real starting point

The original Mercury receiving operation is `SCF-EVENT-FEED-APPLICATIONS-20261012-F3BE`, in the [existing Mercury customer thread](https://tokenjunkielabs.slack.com/archives/C0BTTA66TK3/p1791741758666059). Its original e61 case, acquired feed, buyer, installed Applications, source-first restore and existing controller remain intact. The current 22B7 publisher course is complementary. The original Analysis receiving owner supplies the actual registered Analysis alias and current customer operation.

The original Applications case does not, by itself, establish an Analysis workspace or an unresolved workbook proposal. Begin this chapter only with a saved native Event Apply action that actually returned `WORKBOOK_COLUMN_CHOICES_REQUIRED`. Receive that entire action through its immutable record descriptor. Do not construct a replacement customer proposal, choose an unrelated source window, alter customer headings to force a demonstration conflict, or infer source identity from filenames. The original customer course first receives/reviews the acquired window and preserves its report/workbook definitions. This chapter starts at that actual worksheet boundary.

The producing operator chooses the real sheet indices, full producer/reviewer edits and final conflict decisions. A genuine overlap appears when both copies changed the same complete worksheet array differently. A review with no overlap remains useful; it must not be turned into artificial customer work merely to increase a conflict count.

## The retained result

All directories are private and all written files use the maintained create-once, exact-byte publisher. A retry accepts identical retained bytes. A changed source, original identity or decision uses a separately selected stage/action rather than overwriting previous work.

| Location | Complete content |
| --- | --- |
| `course.json` | Original Analysis alias, workspace ID, programme and proposal action |
| `proposal-action.record.json`, `proposal-action.json` | Immutable descriptor and all bytes of the real saved native action |
| `original-working.json` | Original complete column choices and history, or the original native proposal with every retained resolved array |
| `assignment-request.json`, `assignment.json` | Attributed assignment controls and full original baseline |
| `producer-issued.json/html`, `reviewer-start.json/html` | Complete independent producer/reviewer copies |
| `stages/<stage_id>/producer-current.json` | Exact bytes received from the current producer |
| `stages/<stage_id>/reviewer-return.json` | Exact complete returned envelope and its original source graph |
| `stages/<stage_id>/staged-working.json/html`, `preview.json` | Full received history and frozen baseline/current/returned comparison |
| `applications/<action_id>/selection.json` | Exact selected stage, attribution, whole-array resolutions and native decision |
| `applications/<action_id>/received-working.json/html` | Complete reconciled work, all carried histories, current unfinished notes and local receiving receipt |
| `applications/<action_id>/original-working-review.json`, `workbook-apply-request.json` | Original typed agent source and stable native request |
| `applications/<action_id>/action-records/<sha>.json` | Entire immutable native Apply snapshots; matching descriptors are adjacent |
| `deliveries/<delivery_id>/` | Original delivery selection, all saved delivery-action snapshots, reviewed index and complete result |
| `deliveries/<delivery_id>/complete/` | Every original indexed delivery file, including the full Analysis workspace archive |

Each emitted HTML also has an exact byte descriptor and the complete retained core/controller/return-model sources. Saved-file reopening checks those bytes in addition to the complete source-bound working review. The original full native product source and controller still travel with the parent receiving package.

A stage is identified by the assignment plus the exact producer and returned byte identities. A later edit produces a new stage, while earlier full sources remain available. The receiving unit is one **whole ordered worksheet array**. Duplicate column names, original report ordinals, reordered fields and extra resolved worksheet arrays remain explicit; the code never infers a per-column merge.

## Parent integration

The existing parent imports this chapter using its current source root. It supplies its existing client and cancellation signal. It must keep its original lease until pending calls are joined; aborting this chapter never grants ownership of the native service or browser.

The examples below use values that the original parent already retained. `selected` is its actual operation selection, not a newly generated demo record:

```js
import {
  prepareEventWorkbookColleagueCourse,
  stageEventWorkbookColleagueReturn,
  prepareEventWorkbookColleagueApply,
  applyEventWorkbookColleagueCourse,
  receiveEventWorkbookColleagueApply,
  startEventWorkbookColleagueDelivery,
  receiveEventWorkbookColleagueDelivery,
  reopenEventWorkbookColleagueCourse
} from './workbook-colleague-review.mjs';

const course = {
  directory: selected.privateFollowingDirectory,
  analysisWorkspace: selected.analysisAlias,
  expectedWorkspaceId: selected.analysisWorkspaceId,
  programme: selected.programme,
  proposalActionId: selected.proposalActionId,
  client: existingNativeEventClient,
  signal: parentAbort.signal
};
```

The native Event client is the maintained `openNativeAnalysisEventsClient` contract: `call(operation, request, {signal})`. The parent may supply that client or the original connection arguments supported by the maintained helpers. Do not persist tokens, capability fragments, private connection URLs or environment values in a course record.

### 1. Retain the real proposal and issue the independent assignment

```js
const assignment = await prepareEventWorkbookColleagueCourse({
  ...course,
  workingPath: selected.originalCompleteWorkingFile,
  assignment: {
    actor: selected.producerName,
    reviewer: selected.reviewerName,
    note: selected.assignmentNote,
    at: selected.assignmentTimestamp
  }
});
```

`workingPath` is optional. When it is supplied, the complete file must match the saved proposal exactly. When absent, the maintained original model constructs the baseline from that proposal and preserves all arrays already present in the native action's `request.columns`, including resolved sheets outside its unresolved list.

The descriptor is saved before receiving the full native action. An interruption resumes that exact descriptor instead of selecting a later snapshot. Once the action and original working file have been retained, the producer-side files can be removed or moved. Repeating preparation without the optional source and assignment controls reconstructs the same saved assignment.

Open `producer-issued.html` and `reviewer-start.html` independently. Both carry their whole sources. The reviewer retains the original workspace lineage but has a separate active assignment and reviewer cache role. The producer's local-issued-assignment list and the reviewer's carried source list remain distinct.

### 2. Work in both real copies and receive the returned review

The operator edits the actual producer copy; the colleague edits the independent reviewer copy. Use **Save complete editable worksheet** to retain unfinished work and **Download complete working review JSON** for the whole producer state. In the reviewer copy, use **Assignments and returned reviews**, record the reviewer identity and return note, and **Download complete returned review**.

A browser download request alone does not prove that the file was saved. Confirm the actual downloaded file and reopen it. The editor deliberately retains its changed-work exit reminder after merely requesting a download.

```js
const stage = await stageEventWorkbookColleagueReturn({
  ...course,
  currentPath: selected.actualProducerCurrentFile,
  returnPath: selected.actualReviewerReturnFile
});
```

The parent records `stage.stage_id`, opens the emitted `staged-working.html`, and inspects the full `preview.json`. It contains every compared array, counts, the exact current digest and all required conflict keys.

If publication was interrupted after both source files reached the stage directory, continuation can use only the retained stage:

```js
const stage = await stageEventWorkbookColleagueReturn({
  ...course,
  stageId: selected.retainedStageId
});
```

The saved `stage.json` and complete files identify the stage even if an interrupted caller did not receive its return value. A missing or changed local file fails directly; it is not silently replaced by an external file with the same name.

### 3. Resolve the exact saved comparison and prepare native Apply

The operator resolves every actual conflict with `keep-current` or `use-returned`. Optional incoming/same-row selections use the same explicit choices. Other unchanged/local arrays follow the original comparison. The complete local receipt preserves the assigned baseline, full reviewer sources and retained original state.

```js
const prepared = await prepareEventWorkbookColleagueApply({
  ...course,
  stageId: stage.stage_id,
  actionId: selected.reviewedApplyActionId,
  reviewSourceId: selected.immutableReviewSourceId,
  decision: {
    resolutions: selected.explicitWorksheetResolutions,
    actor: selected.producerName,
    note: selected.receivingReason,
    at: selected.receivingTimestamp,
    expected_current_digest: selected.reviewedPreview.current_digest
  },
  note: selected.nativeApplyNote
});
```

`selected.reviewedPreview` is the saved preview the operator actually read. The chapter does not recompute a new current digest and silently approve a changed producer file. Stage contents are immutable; a changed current file creates another stage requiring another real review.

The Apply action must differ from the action that produced the unresolved proposal, because it carries a different complete request. It retains the **same original engine operation and review digest**. Every subsequent retry keeps this following Apply action ID and original source ID.

If the retained selection was written but the derived working file or helper preparation was interrupted, resume with the saved course and Apply action ID. The complete selection supplies its original stage, reason, resolutions and timestamp:

```js
await prepareEventWorkbookColleagueApply({
  ...course,
  actionId: selected.reviewedApplyActionId
});
```

The offline review format permits up to 128 MiB. Original native receiving remains **16 MiB for the complete working review and 512 KiB for canonical selected arrays**. The maintained helper enforces those limits before native dispatch. It retains exact parsed original source evidence while deriving normalized columns only for validation; omitted optional defaults never change the identity of the original request.

### 4. Apply and receive the saved native outcome

```js
let applied = await applyEventWorkbookColleagueCourse({
  ...course,
  actionId: selected.reviewedApplyActionId
});
```

This sends the complete review source in the original contiguous 64 KiB transport, verifies its final identity, and invokes the existing typed Event Apply. Native validation checks the exact original proposal, complete column arrays, current workbook definitions, Unicode heading uniqueness and full source-row conversions. The chapter does not replace the original native writer.

A response may be `RUNNING`. The caller uses its existing cancellation-aware event loop to observe the original action:

```js
applied = await receiveEventWorkbookColleagueApply({
  ...course,
  actionId: selected.reviewedApplyActionId
});
```

Use this read-only call after an uncertain Apply reply. If the action is `ERROR` or `INTERRUPTED`, inspect its complete saved error/source first. An explicit continuation uses `applyEventWorkbookColleagueCourse({...course, actionId, resume:true})`; it does not allocate a replacement action or reinterpret its decision. A native current-definition conflict remains the original programme's refresh/review workflow.

Once the exact snapshot says `COMPLETE` with result `APPLIED`, retain `applied.record.sha256`. The accepted engine operation is `applied.action.result.accepted.operation_id`; the result is also checked against the actual workspace, programme and review digest.

On the existing native **Event programmes** page, open the same entry in **Saved actions**. The `#action-state` text identifies the original action. Its **Complete worksheet review retained with this original action** section offers **Download complete saved worksheet review** and **Download editable copy of saved review**. Open both actual downloads and confirm the same full receipt, current/returned sources and extra worksheet arrays. The browser's normal original capability stays in its current page, and is omitted from screenshots/recorded URLs.

### 5. Produce and receive the complete customer delivery

Use a separately retained delivery action ID. It differs from the original accepted engine operation and Apply action. The original engine owns the immutable archive plan and actual workspace snapshot.

```js
const delivery = {
  ...course,
  actionId: selected.reviewedApplyActionId,
  applyRecordSha256: applied.record.sha256,
  deliveryId: selected.followingDeliveryActionId
};

await startEventWorkbookColleagueDelivery(delivery);
let delivered = await receiveEventWorkbookColleagueDelivery(delivery);
```

The start may return `RUNNING`; the receive call observes it without another mutation. Once complete, it verifies the delivery index's actual workspace, accepted original operation and review digest, then calls the maintained retained-file writer for **every indexed file**. It immediately reopens all files offline, including `Event_Analysis_Workspace.zip`, and records the whole result. No archive member is replaced by a prose receipt.

After an uncertain start reply, use the same receive call. If the original delivery action explicitly requires continuation, call the same start with `resume:true` after resolving that original error. Every saved action snapshot has its own immutable descriptor.

### 6. Reopen independently and continue the original restore course

```js
const reopened = await reopenEventWorkbookColleagueCourse({
  ...delivery,
  client: undefined
});
```

This reads only the retained private course directory. It verifies the actual native proposal, original assignment, both stage input byte identities, full frozen preview, attributed reconciliation, original typed Apply source/request, selected immutable Apply outcome, complete delivery action and all indexed files. It also verifies the emitted HTML bytes and their retained editor sources.

The existing parent then uses its original full Analysis archive restore operation. It confirms the restored workspace ID, reopens the same saved programme and action, downloads/reopens the original review, and inspects the whole customer report/workbook. Once the parent's existing Analysis alias points to that actual restored workspace, a **new retained delivery ID** runs the same start/receive course for the preserved accepted engine operation. The original host—not this chapter—owns registration, restore, service lifetime and path selection. The new index separately reports its selected result and workspace programme snapshot.

## Browser and process ownership

The complete [borrowed-browser continuation](WORKBOOK_COLLEAGUE_BROWSER.md) receives the existing Playwright page/context, the actual parent-selected Event programmes URL and the complete course file paths. It uses the original editor controls and Saved actions. It must not launch a second browser, reserve another worker, navigate an unrelated session, synthesize a customer proposal or choose customer edits.

The parent passes its existing abort signal to every native call, stops initiating work on cancellation and awaits in-flight calls before releasing its original lease. This chapter owns only its private output files. It does not close a supplied client, stop the native Analysis service or destroy a supplied browser/context.

The noon local in-app browser reservation was explicitly released by the [owner handoff quoting Bryce at 16:29 UTC on October 13](https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791908979290839). Authorized local browser work may resume while preserving his tabs and saved state. The earlier [16:00 UTC handoff](https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791906463475599) remains historical context; the release applies to that browser reservation only. Keep using the original allocated browser and obey any newer owner direction. The separate 14:00 UTC Upper Savannah burst cutoff does not set a schedule for this SCF operation.

## Producing operator's rendered-product instruction

Before presenting any client/prospect-facing application, demo, report, export or attachment, the producing peer must open/run/render the **exact outgoing version**, look at its actual screens and normally use it as the recipient would. View the actual screenshots you capture. Inspect the presentation/screenshare width and the relevant narrow/mobile width, important controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP success, DOM counts, tests and another worker's approval do not substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output immediately while preserving the real source, workflow and computations. Keep the design plain industrial software: readable tables, clear hierarchy, consistent spacing and restrained controls. Inspection must lead to repairs and delivery; do not expand it into broad test sweeps, another verification product or an approval queue.

For video/audio, use available high-quality generative voice/TTS and useful generative media, and watch/listen to the exact final export for pacing, pronunciation, timing and alignment. Preserve existing spending, voice and attribution controls.

Carry this instruction into the actual parent-operated receiving guide while preserving every other owner control. Reuse already updated copies, leave historical/vendor policies intact, and keep the original operation identity. This creates no service restart, watcher, permission gate or new runtime queue. If the present seat lacks an equipped renderer, join the original equipped receiver with this whole exact source and opening course, inspect its returned actual pixels, and keep substantive engineering moving.
