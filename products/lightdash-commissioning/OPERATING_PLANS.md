# Lightdash customer operating procedures

Turn selected, already-saved commissioning work into a complete customer operating procedure. The original Operating Plans model owns editable steps, registrations, complete revision history and returned-plan comparison. The existing Lightdash workspace remains the source of editions, engineering reviews, native operations and handovers.

Procedure actions read local saved state. They do not execute or refresh dbt, Lightdash, warehouse, preview, query, deployment, content transfer or payment work. Continue those actions through the original commissioning product and its original operation IDs.

## Open the installed project

Start the existing project through its normal preparation and application workflow:

`starforge lightdash-project serve --project /absolute/original/project`

Then start the procedure editor in a separate foreground command:

`starforge lightdash-operating-plan serve --project /absolute/original/project --port 8856`

The original project must have its OPEN session and authenticated Merchant MCP owner. The editor verifies that project/session/workspace identity and borrows its client. It opens a loopback procedure interface; it does not open another commissioning SQLite owner. Stdout reports its actual URL and workspace UUID. The credential remains server-side.

Closing this editor drains its HTTP requests and borrowed client. It leaves the commissioning owner in its original lifecycle. Closing the Merchant owner waits for its tracked procedure calls alongside source/native/packaging calls.

The maintained lightdash-commissioning selection contains the complete product and original discovery source. Preserve the installed manifest and source identity; a loose source checkout is not an installed project.

## Select and author complete work

Open **Create from selected commissioning work**. Enter a stable procedure ID, title, customer, responsible operator and purpose. Select each exact existing source edition, saved engineering review, operation and handover needed by the customer.

The procedure retains the original workspace UUID, installed source commit and original application-manifest SHA256; source edition IDs and source hashes; review/baseline/candidate IDs and source/connection hashes; operation action/edition/request hashes; handover UUIDs; and the actual installed lightdash-project command registration.

Each selected native record gets its own step. Generated instructions describe how to review and use the original product. Progress starts as planned. Existing source, engineering review or archive presence does not establish customer approval, acceptance or completed recipient reopening.

Edit instructions, inputs, expected result, owner, due date and recorded result. Add manual steps, reorder them or remove them in a new revision. A removed bound step remains in history; restore it or make an explicit new source selection before capturing it again. The complete draft JSON editor exposes original argv and registration fields. Editing argv does not execute it.

Saved revisions retain the entire original plan history. Opening a historical revision creates an editable draft against the latest plan revision; saving creates a successor. Browser drafts are retained for the exact procedure version. An older draft is kept separately when the server advances.

## Observe actual commissioning outcomes

Save or reopen the procedure, then choose **Capture selected outcomes** for explicit bound steps.

Capture reads local saved records. It never calls Execute or provider Inspect. It records the workspace revision and UTC read time and explicitly identifies the observation as non-atomic. It preserves every operator-authored instruction, progress state and recorded acceptance.

Source observations retain source identity. Review observations retain original selections and decisions. Operation observations retain action, edition, request hash, saved native state, native-result digest, artifact identities and artifact-manifest identity. Handover observations retain the selected revision, package state and archive bytes/hash when present. Artifact files stay in the original complete commissioning handover and use its existing retained-file protocol.

A saved SUCCEEDED native result is evidence for that operation. It does not automatically complete the customer's entire operating step. FAILED, INTERRUPTED, pending and planned outcomes remain accurately recorded. The operator decides progress after reviewing the evidence.

Each capture has an explicit original ID and appends to the observation history. A received procedure from another workspace keeps its origin UUID: it can be edited and returned, but native capture requires that same original workspace UUID. Adoption does not verify imported observation claims against a provider.

## Save and recover the original request

Procedure versions, original plan revisions and native workspace revisions are distinct:

- expectedVersion selects the full procedure record.
- The OperatingPlan draft's baseRevision selects the latest plan history.
- The native revision is an observed source identity during capture.
- requestId is the UUID for one complete procedure mutation.

The store uses the original filesystem lease and atomic durable-file helper. The procedure and request receipt commit in one replacement. The receipt binds the action, full-input digest, predecessor and resulting procedure versions, plan revision and procedure digest.

Retrying the same UUID and complete input returns the original immutable receipt. Changed input under that UUID is rejected. The latest current procedure is returned separately, so later edits are never represented as the earlier result.

The browser saves the complete request before dispatch. **Continue original request** resends those exact bytes after a lost response. Other edits remain disabled while it is pending. A browser storage failure before dispatch leaves the edit unsent. Download the request before transferring recovery to another operator session.

**Retain and set aside** keeps the unresolved request in browser history and stops automatic retry. Reopen server work before another edit. This does not cancel or reverse an already-saved mutation. Original version checks still reject stale successors.

The complete stored record limit is 24 MiB, including history and receipts. The editor accepts 28 MiB requests and this Merchant provider accepts 32 MiB. Complete oversized input is rejected; no history or observation is truncated.

## Receive and review returned work

**Complete procedure JSON** includes all plan revisions, original bindings, capture history and completed return reviews. **Original plan JSON** is the unchanged complete OperatingPlan schema for the existing editor. Readable HTML renders that plan; Markdown also appends the native observations. Retain complete procedure JSON when carrying the additional commissioning evidence.

On another connected editor:

1. Select the complete procedure JSON.
2. Choose **Adopt complete procedure**. Its original ID and source UUID remain intact in the receiving control workspace. Existing IDs cannot be overwritten.
3. Edit explicit instructions and progress; save ordinary original plan revisions.
4. Export the complete procedure or original plan for return.

At the origin, open the saved procedure and select the returned file. **Receive extending plan history** uses the original prefix-history receive function. It accepts matching history or a compatible successor and rejects divergence. A complete procedure return also checks the identical original source bindings and preserves compatible complete capture/return-review histories. Divergent native-observation histories are retained as separate source files for explicit inspection; they are never merged by inference.

For divergent changes, open **Review a diverged customer plan**. Enter a stable review ID, actual reviewer and note. The original engine compares shared history, compatible changes, conflicts and complete step order. Supply explicit decisions using the exact keys returned by that comparison:

`[{"key":"/notes","decision":{"take":"incoming","note":"Reviewed recipient instructions."}}]`

Original choices are current, incoming, base or custom. Order decisions follow the original comparison schema. Recompare after changing reviewer or decisions. Apply the complete ready review returned by that comparison.

Application checks the current plan and procedure version. The full original review and resulting history commit together. If the destination advances, retain the old review and prepare another comparison against its current full history.

## CLI and typed SDK

`starforge lightdash-operating-plan call --project /absolute/project --request /absolute/request.json --output /absolute/result.json`

The complete request envelope is `{"method":"create","args":{...}}`. Mutations require planId, requestId and expectedVersion. New create/adopt requests use version zero. Create also requires title and selection containing all four arrays: editions, reviews, operations, handovers. Read source first for real IDs; retain the exact file before dispatch.

Read methods: source, list, read, request, return_preview.
Mutation methods: create, adopt, save, capture, receive, return_apply.
This command exposes no native execution method.

`starforge lightdash-operating-plan export --project /absolute/project --id PROCEDURE_ID --format json --output /absolute/procedure.json`

Output files use create-only or exact-byte reuse. Unrelated existing files are retained and rejected. If output persistence fails after a mutation, reconcile its same original request.

The existing typed client adds operatingSource, operatingList, operatingRead, operatingCreate, operatingAdopt, operatingSave, operatingCapture, operatingReceive, operatingReturnPreview, operatingReturnApply, operatingExport and operatingRequest. Each maps to its merchant_lightdash_operating_* tool on the same authenticated client.

Pure model exports are at ./products/lightdash/operating-plans. The editor server export is ./products/lightdash/operating-server. Both compose original APIs; neither is an execution engine.

## Complete source and handover boundary

New source lives under products/lightdash-commissioning. The original 38-file business/lightdash-commissioning-workspace-20261012 application is unchanged. Its source lineage, operation identities, process custody and complete handover/archive contracts remain original.

Procedure records live under the existing project's control directory in operating-plans. Export their complete JSON separately when distributing an earlier immutable commissioning handover: that package may predate these procedure records. Preserve the full procedure and original native handover together when the recipient needs both editable work instructions and artifact bytes.

No customer contact, enrollment, provider job, signing or payment occurs through this integration.
