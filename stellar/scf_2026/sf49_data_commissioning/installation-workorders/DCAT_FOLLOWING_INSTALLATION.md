# Follow a complete catalogue edition in the same Installation

This workflow continues an actual saved Installation. It compares two complete original catalogue workspaces, retains every scope decision and saves the next revision through the original Source Desk and Operations transaction. It preserves the original task, Workshare, fees, assignments, payment selections, checks, observations and unrelated extensions. New catalogue execution, commercial care terms and acceptance observations remain with their original owners.

Source integration and publication do not assert that a native course or actual rendered inspection has run. Use the original equipped DCAT receiving operation; keep its actual project, case, request and output identities.

## Original inputs and identity

Retain the earlier complete preparation **request/result**, the current native installation-show result, both complete .ckanw files, and a current original case JSON. The earlier preparation must identify the earlier archive and scope source still owned by that saved Installation. Both archives must have the same original project creation identity, catalogue origin and source kind; a moved project directory is allowed. Names or similar record contents never establish identity.

Attach the later complete archive through the existing attach-dcat/case DCAT source route and retain its actual source ID. Archives remain limited to 128 MiB each and 256 MiB total original DCAT attachments; the complete native case retains its 320 MiB contract. Ordinary JSON inputs stay within 8 MiB and original case ordinary-source limits. Nothing is shortened to fit. The installed Grant client, configured case-bundle input and complete chunked transfer retain the same 320 MiB whole-case bound. The Applications handoff carries that full case with its original setup in a 432 MiB envelope; ordinary planning JSON remains 32 MiB and ordinary source uploads remain 8 MiB.

In the Catalogue commissioning desk, inspect both complete archives and choose **Following edition**. Pin the earlier and later original inspections. Retain the full earlier preparation as prior-preparation, current native Installation as saved-installation, and current case as case. Enter the later archive's actual case source ID. Prepare the comparison.

## Review the whole change

The comparison includes all 15 original source families: catalogues, migration reviews, releases, acquisition sources and results, correction drafts and every revision, recipient issues/proposals/decisions, semantic profiles/runs/reviews/comparisons and comparison reviews. Record identity includes family, owner where applicable, and original ID. Each row retains its exact before/after record and file hashes; duplicate labels never merge.

Unchanged records carry their prior included/context decision and purpose. Changed or new records require an explicit included/context decision, purpose and reason. Missing records require an explicit missing decision and reason. Missing records are retained in the complete review and earlier archive; they cannot silently become a different later record. Changing even an unchanged record's scope needs a reason.

Only explicitly enabled source and receiving text amendments can change. Payment, task, funded assignments, check observations, Workshare terms and unrelated fields remain byte-equivalent structured values from the original saved Installation.

Download the complete review JSON. Attach those exact bytes as an ordinary source to the same Operations case, retain its actual source ID, and import the now-fresh case JSON. Enter the review source ID and prepare the following Installation. The comparison basis excludes unrelated case-version changes so attaching the exact review does not invalidate the review itself; final native Preview binds the actual current case version.

The desk retains unfinished review text, disabled amendment drafts, earlier comparison drafts and pending original UUID/body. Recovered old results preserve later authored reviews. Selecting new input pins does not relabel old comparison members or redirect their downloads. A failed selected-source read leaves the preceding complete selection intact. Opening a downloaded editor draft preserves a pending original request: another draft must contain that exact pending body, or the operator first continues it or explicitly retains it with the existing new-draft control.

## Prepare and save through the original Source Desk

Export Dcat_Following_Native_Input.json from the completed following preparation. Keep the complete original request/result for the next following cycle.

In the existing Operations case's Source Desk:

1. Create or open a named original source draft; retain the native input file with its exact receiving filename.
2. Choose **Select following Installation** beside Dcat_Following_Native_Input.json. Keep any earlier unfinished draft through the original working-copy controls before changing selection.
3. Use the existing **Prepare** control. The installed native helper reopens both actual case-owned archives, checks every original record/member and the complete source projection, verifies the attached review and recomputes the successor document. It then invokes the original Installation Preview.
4. Inspect the complete report and original native preview. Use **Save next revision of original Installation**. The same Source Desk request transaction verifies the frozen basis again and invokes the original installation.save for the same Installation ID and expected revision.
5. Retain the returned accepted receipt and exact saved revision. Later case or Installation changes require a new deliberate preparation, never a silently refreshed expected version.

No second request registry or writer is introduced. A lost response is reconciled through the original Source Desk request status or exact prepared operation. The original receipt is returned before any repeated CAS or save. Never replace an uncertain request UUID or edit its body.

### Exact native selection and command

The native Source Desk selection is:

~~~json
{
  "schema": "stellar-forge.dcat-installation-following.v1.source-selection",
  "inputFileId": "input-FULL_NATIVE_FILE_SHA256",
  "inputSha256": "FULL_NATIVE_FILE_SHA256"
}
~~~

Use the original selection.save action. Original prepare data retains the installed engine SHA, complete selection SHA and expectedProfiles: {}. Original dcat-following.save data is exactly:

~~~json
{"preparationId":"preparation-FULL_ID","expectedPreviewSha256":"ORIGINAL_NATIVE_PREVIEW_SHA256"}
~~~

The original command envelope retains requestId, expectedRevision of the Source Desk draft, actor, note, action and data. The CLI's prepare-command, execute-prepared, reconcile-prepared and status commands remain available; all terminal operations use the same Workspace lease as the existing server. Do not open a second CLI owner while that server holds the workspace.

## Installed preparation CLI and MCP

Use the existing starforge dcat-installation command and private preparation directory:

~~~sh
starforge dcat-installation following-template \
  --directory "$PREPARATION_DIRECTORY" --request "$TEMPLATE_UUID" \
  --before-inspection "$BEFORE_INSPECTION_UUID" --after-inspection "$AFTER_INSPECTION_UUID" \
  --prior-preparation "$PRIOR_PREPARATION_FILE_ID" --installation "$SAVED_INSTALLATION_FILE_ID" \
  --case "$CURRENT_CASE_FILE_ID" --after-archive-source "$LATER_CASE_SOURCE_ID"

starforge dcat-installation following-prepare \
  --directory "$PREPARATION_DIRECTORY" --request "$PREPARE_UUID" \
  --before-inspection "$BEFORE_INSPECTION_UUID" --after-inspection "$AFTER_INSPECTION_UUID" \
  --prior-preparation "$PRIOR_PREPARATION_FILE_ID" --installation "$SAVED_INSTALLATION_FILE_ID" \
  --case "$FRESH_CASE_FILE_ID" --after-archive-source "$LATER_CASE_SOURCE_ID" \
  --review "$REVIEW_FILE_ID" --review-source "$REVIEW_CASE_SOURCE_ID"
~~~

Import exact files first with existing import --kind prior-preparation|saved-installation|following-review|case|archive, original UUID and expected SHA. Page all original request/file results and use complete hash-bound export.

The installed merchant_ckan_dcat_installation_following_template and _following_prepare tools use the same named preparation root, file IDs and original UUIDs. HTTP routes are /api/following-template and /api/following-prepare, under the original authenticated loopback listener. Preparation results use type: "prepare", mode: "following"; this distinction is retained when recovering a pending request. No MCP action fabricates or automatically approves Installation checks.

## Whole receiving and cold reopen

The original dcat-installation-receive course now accepts following preparations. In addition to its original input, provide:

~~~json
{
  "receivingPriorCatalogDirectory": "/private/received-earlier-catalogue",
  "sourceDeskDraftId": "source-desk-ORIGINAL_ID",
  "sourceDeskPreparationId": "preparation-ORIGINAL_ID",
  "sourceDeskSaveRequestId": "ORIGINAL_ACCEPTED_SAVE_REQUEST"
}
~~~

Use actual returned values and independent private directories. The course exports every member of both original archives, receives both projects through the maintained catalogue receiver, and cold-reopens their original models. It exports/imports the whole selected Installation case through the existing native importer and verifies the fixed saved edition and all source attachments.

The ordinary case ZIP does **not** contain Source Desk tables. Therefore the course also invokes the original Source Desk's following-custody command. It reuses the maintained Source Desk receiving SQLite backup and typed logical-database identity, preserving every original table: all source drafts/revisions, original file bytes, preparations, native requests/results and complete Operations history.

~~~sh
python3 "$SOURCE_DESK_CLI" --workspace "$ORIGINAL_WORKSPACE" \
  --case "$CASE_ID" --out "$PRIVATE_OUTPUT/Original_Following_Custody.json" \
  following-custody --draft "$SOURCE_DRAFT_ID" --preparation "$SOURCE_PREPARATION_ID" \
  --save-request-id "$ORIGINAL_ACCEPTED_SAVE_REQUEST" \
  --directory "$PRIVATE_OUTPUT/following-custody"
~~~

The complete complete-workspace.sqlite3 snapshot is private and contains the whole selected workspace, including any other retained cases; choose its recipient accordingly. Its copied workspace/planning.sqlite3 is cold-opened through the original Workspace/Operations/SourceDesk and verifies the exact historical preparation, original accepted request, saved successor and both full archives. The snapshot does not copy a running process, browser session or provider credential configuration. Use the installed original application and documented runtime at the recipient.

The first snapshot survives a crash before its receipt. A same-custody retry validates and keeps the original snapshot; later valid edits in the received workspace are preserved. It never overwrites a different receiving workspace or advances an original mutation. Preserve the complete custody directory, case ZIP, both catalogue projects/archives, preparation directory, original editor working-copy exports and installed source together. Do not distribute the case ZIP alone as the full editable preparation.

The course's browser arm belongs to the same maintained browser runner and original receiving operation. It must use the following panel, exact original inputs and reviewed body, both archive/member downloads, desktop/narrow states, full editor export/reopen and retained original request recovery. A source-only result is not browser completion.

## Complete standing producer and attachment rule

Before calling any client/prospect-facing app, website, dashboard, demo, report, presentation or export ready, the producing peer must actually open/run/render the exact outgoing version, LOOK at the actual screen or real screenshots, and operate important controls. Check screenshare and relevant narrow/mobile widths; populated, empty, loading and error states; downloads/exports and reopening. Capturing unseen screenshots is insufficient. Repair ugly, broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized product. Code review, DOM counts, HTTP 200, tests or peer approval cannot replace seeing the product.

ALL ATTACHMENTS count: literally open, view, play and use final HTML, PDF, report, slides, spreadsheet, map, image, video, audio, archive and project as a recipient; extract archives and open contained deliverables and working projects. Tests/checklists/captured-only screenshots are no substitute. Use available high-quality generative media and natural voice generation/TTS for videos; avoid robotic default voices. Watch/listen to final media for pronunciation, pacing, timing and audio alignment.

Keep building and fixing. Use plain industrial design: readable tables, hierarchy, consistent typography/spacing, restrained controls, useful labels and responsive layouts, preserving real workflows, data and computation. Reviews lead to repairs and do not replace implementation/integration or become endless rechecking. Use focused validation, not broad suites or a separate verification product. Empty scientific Workspace images are not completed-product acceptance.

Persist this complete rule in active owned consumed instructions and build/receiving guides, including every child assignment and its all-attachments/final-media clarification. Preserve other owners, historical evidence and vendor policies. Do not force restarts, add watchers or revive owner-stopped work. Continue original scientific, source, runtime, archive, browser and receiver owners. The Ecosystem October 13 10 EDT/14 UTC cutoff applies to that project only; it does not expire this standing rule. Canonical machine policy remains under its original owner. Rule revision: rendered-product-inspection-20261013-all-attachments-v1.

The current source delivery does not assert actual native or rendered acceptance. Preserve this qualification until the original equipped operator has used the exact final edition and opened the complete outgoing attachments.
