# Return an edited Zotero project to its original author

This workflow belongs to the existing Zotero library workspace. An author prepares a complete project handover; a receiving customer edits an independent copy and returns a complete project or workspace packet. The original author compares that return with the shared original and current local work, saves explicit choices, and applies one new native project revision.

Original captures, Zotero item keys, collection scope, project history and returned bytes remain retained. This workflow does not write to the remote Zotero library. Linked Research dossiers continue through the existing Research handoff and its separate reviewed-return engine.

## Open the original customer case

Use the existing installed product and private connection from [MERCHANT_SETUP.md](MERCHANT_SETUP.md) or [the complete operating entry](../../../../products/zotero/OPERATING.md). Reopen the original workspace; do not initialize a replacement. The existing OSF receiving programme retains the completed group 479248 library at version 11212, its 58 source responses and original project. Those prior completed results are distinct from this new returned-project course.

In the browser, open **Returned projects**. Select the exact original saved project. The selector includes every saved project from the native paginated record reader. No project is changed by opening the page.

## Give the customer a complete project

Select **Prepare complete project handover**, then **Download prepared project handover**. Preparation saves an immutable project-delivery record against the exact selected project revision and original request UUID. The download includes the dedicated original source and complete project history required to identify a common base.

The receiving customer continues in its independently received original workspace. It can edit item selections, classifications, decision notes and findings using Projects, then prepare and download its complete project handover. A complete whole-workspace export is also accepted as returned source. Retain the initial shared edition and earlier histories; numeric revision equality alone does not establish common ancestry.

A newly prepared handover is a new explicit action. If its response is lost, use **Resume original request** before preparing another. The same UUID reopens the saved result.

## Retain the complete returned source

In the original workspace, select the customer's complete JSON under **Retain the customer’s returned source**. Choose **Retain complete returned source**.

The native reader accepts the dedicated project packet or original whole-workspace packet, up to the existing 256 MiB whole-transfer capacity. It retains all original bytes, their SHA-256 and source lineage before returning a project-return record. Browser session storage retains only the source filename, byte count, digest, selected native IDs, review choices and exact pending request. It does not duplicate the complete source packet.

If intake's answer is lost, select the original file again and choose **Resume original request**. The browser checks its full byte count and SHA-256 before replaying the same UUID and project selection. A changed file is not substituted. An interrupted or invalid source does not silently overwrite the original project.

## Compare and save choices

Choose the retained return. **Exact comparison** displays:

- The shared original project revision, exact hash and native ancestry basis.
- The complete current local project revision and hash.
- The returned project revision and hash.
- Original library and edition identities, status, changed values and unresolved conflicts.

The source reader locates a shared base by exact retained record identity. Two branches can have different revision 3 values, so revision numbers are labels, not proof of common ancestry. Previously applied return ancestry remains available for subsequent review.

Changed title, description, scope, item decisions and findings appear as complete shared/local/returned values. Expand a value to read its full original text or structure. The table pages 40 changed rows at a time; pagination does not trim the saved native comparison. The full preview digest binds the entire comparison. Unchanged rows are omitted only from the changed-values view.

For conflicts, select **Keep current local**, **Use returned value** or **Use shared original**. Nonconflicting rows show their automatic selection. Save all reviewed choices with a meaningful review note. A partial save retains reviewed work while leaving the project unchanged. Inspect each issue reported by the native reader; a changed source edition or missing common ancestor requires source resolution, not an invented match.

The working copy keeps choices across pages and page navigation. **Download review working copy** exports all selected IDs, choices, note, original pending request and rejected-request history. **Open selected working copy** restores it only into its exact original workspace. It never imports a second customer project or overwrites native records. The source packet remains independently downloadable from the native return.

If the comparison changed since the previous review, the old choices are retained for inspection in the working copy; they are not silently applied to a new comparison. Review the current full values again. Definite native stale rejections retain their exact unsuccessful UUID/input as rejected; unknown/network failures remain pending and resumable.

## Apply and continue

**Apply reviewed return as a new project revision** is enabled only after the native return reports a complete, valid REVIEWED comparison and the current browser choices/note match that saved review. The request carries the exact return revision, local project revision and new preview digest returned after review saving.

The native journal applies the reviewed candidate atomically with its original request identity. It preserves earlier local work, full returned history and the reviewed return record. A local edit after preview produces a definite pre-write rejection; reopen the same return and review the current comparison. If the response is uncertain, resume the original request.

After apply, **Open current saved project** continues ordinary project editing. Research delivery remains explicit through the existing project-to-dossier workflow. **Download original returned bytes**, **Download saved review** and **Complete return history** remain available. Export the complete workspace through Receiving for independent continuation; this includes the original source, retained returns and their saved decisions.

## CLI course

All paths below are actual absolute private paths. Commands attach to the same existing connection and use the same native API. Use each retained request UUID for an interrupted retry; a new UUID denotes a new explicit action. Never replace pending input merely to make a retry pass.

Prepare and download a complete original project:

~~~sh
starforge zotero project-handover \
  --connection /private/original/connection.json \
  --project ORIGINAL_PROJECT_ID --project-revision ORIGINAL_REVISION \
  --request-id ORIGINAL_PREPARE_UUID \
  --out /private/delivery/original-project.json
~~~

On the independently received customer workspace, use its connection and actual current project revision to prepare the returned project with the same command. Then retain its entire file in the original author's workspace:

~~~sh
starforge zotero return-import \
  --connection /private/original/connection.json \
  --project ORIGINAL_PROJECT_ID \
  --file /private/incoming/customer-project.json \
  --request-id ORIGINAL_INTAKE_UUID \
  --out /private/review/intake-result.json

starforge zotero return-preview \
  --connection /private/original/connection.json \
  --id RETURN_ID --offset 0 --limit 100 \
  --out /private/review/comparison-page-000.json
~~~

Follow nextOffset until null. Keep the same full previewSha256 and original local/return revisions while reviewing. Each row has a stable native id. A choices file maps those actual row IDs to local, returned or base; do not invent IDs. An empty object leaves all unresolved conflicts unresolved.

~~~json
{
  "ACTUAL_NATIVE_ROW_ID": "returned"
}
~~~

Save the complete reviewed choices and full UTF-8 note:

~~~sh
starforge zotero return-review \
  --connection /private/original/connection.json --id RETURN_ID \
  --revision CURRENT_RETURN_REVISION \
  --project-revision CURRENT_LOCAL_PROJECT_REVISION \
  --preview-sha256 EXACT_CURRENT_PREVIEW_SHA256 \
  --choices-file /private/review/choices.json \
  --note-file /private/review/reviewer-note.txt \
  --request-id ORIGINAL_REVIEW_UUID \
  --out /private/review/saved-review.json
~~~

Read return-preview again after saving. The saved return has a new revision and preview digest. Apply only its actual ready REVIEWED result:

~~~sh
starforge zotero return-apply \
  --connection /private/original/connection.json --id RETURN_ID \
  --revision SAVED_RETURN_REVISION \
  --project-revision EXACT_CURRENT_LOCAL_REVISION \
  --preview-sha256 SAVED_REVIEW_PREVIEW_SHA256 \
  --request-id ORIGINAL_APPLY_UUID \
  --out /private/review/applied-result.json

starforge zotero return-download \
  --connection /private/original/connection.json --id RETURN_ID \
  --role source --out /private/review/original-return.json

starforge zotero return-download \
  --connection /private/original/connection.json --id RETURN_ID \
  --out /private/review/complete-saved-return.json
~~~

Output files use the original atomic no-overwrite helper. An identical retry reuses exact bytes; a different result requires a new intended output filename. The source and saved return remain separate files. Native input files are read completely within their declared limits. No source content is clipped to fit a log or report.

## Same-case receiving course

Continue the original SCF-ZOTERO-LIBRARY-RESEARCH-DELIVERY-20261012 operation and its current equipped owner. Use the retained actual library/project, source archive and current installed application. Do not reacquire the OSF catalogue or start another native job.

1. Prepare the actual original project handover and retain its immutable bytes/identity.
2. Receive the project through the original named receiving path. In that child, make a source-supported decision-note or finding edit. Independently edit a different original local field, then prepare the complete customer return.
3. Import that return into the original project. Inspect the actual base/local/returned comparison and all source files. Save and reopen a partial review before completing it.
4. Exercise one real divergent field by choosing its exact intended side. Save the complete review, re-read its native revision/digest, and apply it once. Replay the same saved UUID and confirm the same result without another project revision.
5. Retain an actual pre-write stale review by changing the original project after preview; reopen the same return and inspect current values. Preserve the rejected request and all previous choices. Continue through the normal reviewed apply.
6. Download and open the complete prepared handover, original returned source, saved review/history and whole workspace. Independently receive and reopen the entire result, including original Research linkage and all saved return history.
7. Operate the exact outgoing browser at desktop and narrow widths: no-project state, source-selection error, populated comparison, expanded long values, paging, partial choices, stale rejection, pending-request recovery, complete downloads and reopen. Return actual images and full native results to the original case. Producing authors inspect the images themselves and repair the exact selected source.

Source review and isolated source execution do not establish completed native or rendered customer delivery. Keep the actual returned host/process/source/result identities distinct from prepared source.

## Rendered product inspection — complete owner instruction

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Before calling any customer/prospect-facing application, website, dashboard, demo, report, presentation or export ready, open/run/render the exact outgoing version, look at the rendered screen or its actual screenshots, and operate the important user controls. Inspect the actual screenshare width and narrow/mobile width where relevant, populated/empty/loading/error states, downloads/exports and reopening. Capturing screenshots without viewing them is insufficient. Code review, DOM counts, HTTP 200, unit checks and another worker's approval do not replace seeing the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk; do not run broad suites or build a verification product.

Include this complete instruction in delegated assignments and the active owner-controlled policy, boot, build and receiving guidance those workers actually read. Preserve all other owner controls and original operation identities. Leave historical records and third-party/vendor policies intact. Do not force restarts, create watchers or revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.
