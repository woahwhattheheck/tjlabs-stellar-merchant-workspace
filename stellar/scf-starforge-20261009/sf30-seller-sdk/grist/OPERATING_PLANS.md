# Grist Operating Plans

Use **Operating plans** in the existing Grist source workspace to turn retained source work into an editable customer procedure. The original authenticated workspace remains the owner of the source captures, plan store, request journal and publisher. The new panel borrows its HTTP connection and shared controls.

The procedure describes work, inputs, expected results, people, dates, recurrence and staff receiving. It keeps complete saved plan revisions, original source bindings, later source observations and reviewed returned work. Creating, saving, observing or receiving a plan does not contact Grist, execute its command arguments, start a publisher, activate a release or send a payment. Use the original source and publication controls for separately chosen operations.

## Open the existing workspace

Launch the Grist workspace through its existing CLI or Applications entry, using the same private configuration and existing source directory described in WORKSPACE.md. Open its original authenticated URL and select **Operating plans**. There is no additional server, access token, database owner or launch command for this panel.

The original browser keeps the workspace token in its existing session storage. Operating Plans sends requests through the same authenticated client to `POST /api/operating`. It does not receive or retain provider credentials. Source metadata is read from the existing stored documents, discoveries, captures, versions and operations.

A request in either editor locks both sets of normal controls. The two recovery areas retain their own original request identifiers. An active browser request also prevents simultaneous recovery dispatch. If another browser left both a source request and a plan request pending, reconcile them one at a time using the corresponding recovery areas; neither marker is silently discarded.

## Select source and create the procedure

Expand **Create a procedure from retained source**. Choose one of five kinds:

| Kind | Selection |
| --- | --- |
| Document catalogs | A complete retained document table catalog and its original identity |
| Table discoveries | An already inspected table, schema and selection |
| Complete captures | An existing complete source observation |
| Saved source versions | A reviewed retained projection version |
| Original operations | The original operation identity, outcome and safe source metadata |

Each page shows 25 records. **Previous sources** and **Next sources** enumerate the complete retained catalog. Selection persists across pages and kinds. The selected list names every included kind and ID, with an individual Remove action. Inspect the identity and observation disclosure before choosing a record. The original workspace-settings identity appears above the table.

Enter a new stable plan ID using letters, numbers, dots, underscores or hyphens, up to 128 characters. Give the procedure a title, customer, useful outcome, period or recurrence, operating owner, receiving instructions and notes. **Create original procedure** retains the exact selected IDs and authoring input before dispatching one original request. The service binds each selected source record to its original identity and generated operating step.

An empty source selection creates a manual procedure under the same original workspace identity. Add preparation, receiving or other operating steps before saving the next revision. Manual steps have no source binding and start with `selection: null` and an empty `argv`. A source-bound procedure starts from the exact selected saved records; later source observations still require explicit original bound steps.

Creation uses expected procedure version zero. An existing identity is not overwritten. Use **Open** for a saved procedure, or adopt its complete original export.

## Edit useful operating work

The editor shows the original procedure ID, procedure version and saved plan revision. These are different identities: the procedure also retains source captures and returned-review history, while the original plan records authored revisions.

Edit the plan title, customer, useful outcome, period, owner, receiving and notes. Select a step to edit:

- its title, work instructions and required inputs;
- the expected result and responsible operator;
- a real due date or an explicitly blank date;
- recorded status: planned, in-progress, completed or skipped;
- the actual recorded result.

A status is an operator-authored statement. Capturing retained source metadata does not mark a step complete or rewrite its result.

**Add manual step** creates a stable new step ID. **Move earlier** and **Move later** change the next revision's complete ordering. **Remove from next revision** removes the selected step only from the editable revision. Saved revisions and historical source bindings remain. A removed bound step is excluded from the panel's “All retained source bindings” capture scope; existing history is still visible.

The registration and command arguments of an existing step are shown together. **Edit complete command binding** accepts one JSON object containing exactly `selection` and `argv`. Apply that complete pair to the draft, then save the revision. This preserves the relationship between a retained registration and its command text; it does not execute anything. The original server validates the complete registration and all command arguments.

**Save procedure revision** uses the exact draft schema, original plan ID, base plan revision and expected procedure version. The server performs the original atomic plan/request commit. A concurrent change fails with its original conflict result. The editor keeps the unsaved input and request receipt so you can export it and reopen the current saved version deliberately.

## Keep local edits and recover correctly

The panel keeps an editable draft in browser local storage, keyed by the original workspace directory. It includes the authored procedure, stable step IDs and expected version. It contains no provider credential or native table rows. Authored prose, source identities and recipient-entered procedure content may still be private: use the approved browser and machine.

**Download editable draft** retains unsaved work, separately from a saved procedure export. **Open editable draft backup** accepts that exact workspace and plan identity only when its base revision and procedure version still match the open saved plan. It never relabels an older draft as a newer edition.

After reopening the browser, **Restore retained browser draft** reopens its original saved plan and compares versions. If the saved plan advanced, the earlier draft is downloaded intact and is not silently applied over the newer work. Reconcile the edits explicitly, using complete saved histories for returned-plan review.

**Reload saved procedure** asks before discarding unsaved edits. Opening or creating another procedure similarly asks before replacing an unsaved retained draft. The source editor's separate draft and source selection stay in its original state.

Browser local storage is a convenience, not a durable backup. It can be disabled, cleared or too small for a large received document. A plan mutation is not sent unless its complete exact request can first be written and read back from browser storage. For an input exceeding browser storage capacity, keep its original file and use the maintained Operating Plans CLI or MCP workflow against the same workspace; do not truncate the procedure or manufacture a second result.

## Retain a source observation

Save authored changes first. Choose either **All retained source bindings** for the current saved steps or **Selected source-bound step**, then choose **Capture current retained observations**.

This reads only the original workspace's retained source. It appends a capture ID and complete identity/observation metadata to the same procedure. The source model keeps original hashes and safe schema, count, reviewer and outcome metadata; native rows, samples and provider credential references remain in the source store. A manual step has no native binding. Explicitly choosing a removed or unavailable binding is rejected.

Open the disclosures for **Retained source bindings**, **Source observations and captures**, and **Saved returned-plan reviews** to inspect the current saved result.

The capture is a separate original request under the expected procedure version. It does not change instructions, progress status or recorded results.

## Complete history and exports

**Complete saved revision history** lists every original plan revision. View any complete saved revision. **Use as editable draft** copies its content into an editable next revision while retaining the current plan ID and current base revision. This does not rewrite the historical record.

Four exports use the original service:

| Export | Intended use |
| --- | --- |
| Complete procedure JSON | Full editable Grist procedure, source bindings, captures, plan history and return records |
| Original operating plan JSON | Complete original generic operating-plan history for staff editing and return |
| Readable Markdown | A staff-facing saved procedure |
| Readable HTML | A standalone readable saved procedure |

The browser verifies each returned content byte count and SHA256 before downloading it. Exports describe the saved edition. Save edits first, or export the editable draft separately. Markdown and HTML are views; retain JSON for editable receiving.

To bring a saved procedure into its permitted original destination, use **Adopt a complete saved procedure** with its complete Grist procedure JSON. Adoption uses the original ID and expected version zero. The native service validates the original binding and history. It does not overwrite an unrelated existing procedure or substitute a new source identity.

## Receive returned work

Open the original saved procedure and save or retain any local unsaved edits. Select a complete returned generic operating plan or complete Grist procedure JSON. The panel retains the full selected object. A complete procedure is sent with its original source origin, bindings, captures and return records; the original service validates that binding and receives its permitted history. A generic plan remains a generic plan. The displayed label reads the nested plan without discarding the complete procedure.

### Identical shared history

**Receive unchanged forward history** asks the original engine to extend the saved history only if every shared revision is identical. It retains any intermediate returned revisions. Divergent edits are rejected, leaving both complete inputs available for review.

### Divergent edits

Enter the reviewing operator and notes, then choose **Compare returned work**. The original engine identifies the shared revision, current revision, returned revision and every changed field or step.

For each row, inspect the shared, current and returned values. The proposed complete value is also shown. A conflicting row needs an explicit reviewed decision:

- **Keep current** retains the destination's value.
- **Take returned** selects the returned value.
- **Use shared original** selects the common ancestor.
- **Custom complete JSON value** supplies an explicit value of the appropriate original type.

An empty decision keeps the engine's automatic choice, or leaves a real conflict unresolved. Record a decision note when useful. Editing a choice, note or custom value invalidates the prior preview. Choose **Compare returned work** again to have the original engine validate the complete decisions.

The original engine groups command arguments with their registration and groups recorded progress, its result and the complete original output files. New reviews show added, removed or changed files together with the work they describe. Named downloads retain the original file bytes. It also detects when work changed on one branch while results changed on the other, requiring a complete step decision. It does not move a completed result onto different instructions silently.

The complete order row must include every retained step exactly once. Source-order choices retain the engine's reviewed complete ordering. A custom order is a JSON array of every selected step ID. Changing step inclusion may require reviewing the order again.

**Apply this complete reviewed return** is available only when the original comparison is ready and matches the current procedure version. It sends the full exact preview review, including both complete histories and all decisions, with a new retained request ID. A changed destination is not overwritten. Preserve the review and reopen current work before a new comparison.

**Download current return review** retains the actual preview or current incoming plan and choices. The complete saved procedure export retains applied return records. Receiving also checks that the current plan contains every complete saved result named by those records. An earlier compatible revision cannot replace the completed work while keeping its completed review.

## Original request recovery

Before every mutation, the browser saves the exact `{method,args}`, UUID, workspace directory, creation time and body SHA256 in its own request record. Only after readback succeeds does it dispatch. The record remains until the original result is reopened successfully.

A lost response does not create a replacement UUID. New pending records retain the immutable source-workspace identity. When recovering an earlier browser record without that identity, the original journal's UUID, Operating Plans kind and complete canonical input digest must match before its destination identity is accepted. The native reader supplies those original fields; received procedures keep their separate original source identity. The recovery area provides:

1. **Read original plan receipt** — query the original global authoring journal by that request ID.
2. **Retry exact retained request** — only when no receipt is visible, replay the identical saved body and UUID after checking again.
3. **Resume original interrupted request** — use the original `/api/resume` operation for a recorded interrupted request.
4. **Acknowledge recorded rejection** — only after a fresh receipt establishes a terminal failure, or a positively rejected input has no journal entry. Pending or uncertain work cannot be dismissed.
5. **Download exact request** — preserve the entire original browser record for the existing operator.

A complete receipt is accepted only for the original Operating Plans operation and selected plan. The journal returns its exact original result even after later saved work. The browser separately reads the current procedure and verifies that it retains the committed plan history. It preserves a newer or unsaved local draft rather than replacing or rebasing it from the older receipt. If reopening or refreshing the saved result fails, the marker stays retained for another receipt read. Any other retained request for the same workspace is reconciled before a new mutation.

These controls do not remove operation locks or infer process closure. They consume the original service's journal and continuation methods.

### Complete working editor and original request recovery

The Operating plans screen retains each window’s complete working editor as a separate browser copy. It keeps the selected original source records and their identity details, creation fields, current saved procedure, editable steps and selected step, unapplied command-binding JSON, complete adoption and returned files, reviewer notes, raw return decisions and original pending requests. Invalid unfinished JSON remains editable and downloadable. A restored editor retains its selected source revision until you explicitly reload or compare current native work. Manual procedures can start with no selected source and receive authored steps in the same editor.

Use **Download complete working editor** at any stage, including a browser-storage failure. **Open complete working editor** validates the original receiving workspace identity and request bodies, downloads the preceding full editor, and opens a separate local copy. **List saved editors** and **Open saved editor as separate copy** provide explicit access to retained windows. Reload reopens this window’s last committed copy and creates a fresh record; concurrent windows do not overwrite one another. Queued atomic writes compare the original saved sequence. If storage conflicts or fails, the complete in-memory download stays available. **Download current return review** produces the same complete reopenable editor, including incomplete custom JSON and the full original returned procedure.

Browser copies and new pending requests bind to the native receiving workspace’s immutable settings SHA-256 and creation time. An adopted procedure keeps its own original source origin. Before retry or resume, the browser reads the receiving workspace identity again. Earlier requests can acquire that identity only from a native journal receipt with the same original request ID, operation kind and canonical complete input hash; an absent unbound request remains preserved for the original operator. Existing exact request bodies and native journal replay semantics are retained. Requests bound to another original workspace remain untouched in browser storage and do not block the current workspace, even when it reuses the same directory; receiving rejects a colliding request ID bound to that other origin.

Complete procedure, plan, Markdown and HTML exports remain the native customer handover. Attached step files remain in drafts and returned plans. The step editor and each return alternative provide direct original-file downloads, including the proposed files, while the complete editor retains their original bytes and metadata.

## Source composition

The panel is `workspace/operating-browser.mjs`, mounted from the existing `workspace/browser.mjs`. The existing `index.html` gains the Operating Plans tab, editor and separate recovery area; `style.css` adds only the panel's layout rules.

The mount borrows:

- `api`: the original authenticated HTTP client;
- `getContext()`: original directory, ready state, normal blocked state and actual active request state;
- `setBlocked(value,{working})`: the shared editor/recovery lock;
- `notice`: the existing operator status region.

The panel never constructs a connection, opens a second source workspace or owns the server lifetime. The original application shutdown, request handling and native operation engine remain in place.

This browser source is authored against the exact current original plan and returned-plan formats. Source syntax and integration checks are reported separately from an actual browser receiving run; this guide does not claim that a new native/provider programme has been executed.
