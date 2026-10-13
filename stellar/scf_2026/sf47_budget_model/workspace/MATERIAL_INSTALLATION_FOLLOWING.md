# Following catalogue · existing Customer Installation

Use the original Material Catalogue Source Desk to review a later complete catalogue against one exact saved Installation. The result remains a draft until the original Installation Preview and Save actions accept it. This guide is part of the same MATERIAL-INSTALLATION-FOLLOWING-EE290-20261013 delivery and existing equipped Material receiving course.

## Required original inputs

Open the actual case and its current Workshare. Select the complete later customer bundle already attached to that case, the exact saved Installation, and the prior complete catalogue that its saved source or receiving declaration binds. The workflow freezes case id/version/plan, Installation id/revision/SHA-256, both source ids/byte counts/SHA-256 values, and both catalogue revisions and active edition ids. It rejects a changed target or source instead of substituting current values.

The two bundles must be independently valid original v1/v2 catalogues for the same catalogue and tenant. The following catalogue must have a later catalogue revision and a different selected active edition. Every old source file, table record and prior history edition must remain in the following bundle; mutable heads are matched to their native history records. A later decision-only receipt without the complete later bundle is insufficient. No partner source or acceptance is inferred from the original SAP SHINE demonstration.

Each original bundle is bounded at 128 MiB. Additional original attachments retain their separate 64 MiB per-file/128-file limits. Complete captured output, original source and application remain bounded at 512 MiB. The original backend also enforces its complete request and output bounds; a large selection that cannot fit must be reduced explicitly, never truncated. The previous catalogue is retained once as source/previous-catalog.jsonl, outside the additional-attachment allowance.

## Operate the existing Source Desk

1. In the original case's Customer Installations, open Material Catalogue. Open the later attached catalogue as a named review. Keep the previous review and saved Installation available.
2. In Installation destination, choose Update existing saved Installation and Original bound catalogue, then Compare with selected saved Installation. Use new Installation draft is a separate explicit choice that checkpoints the existing working review.
3. Inspect the exact source identities, retained history and original saved document. Review the complete material comparison, including removals. The search and paging controls retain the full comparison. Mark unchanged material scope retained is an explicit bulk decision limited to unchanged rows.
4. Choose each material's scope: retained or out-of-scope for a current material, removed for an absent material. Changed or omitted scope requires a reason. These choices describe Installation scope; they do not create supplier evaluations, catalogue approvals, customer decisions or deletion.
5. Enter the reviewer, original observation time and scope explanation using the labeled controls. Explicitly confirm that the existing Workshare still fits and that the complete source has been reviewed. Otherwise return to the original Workshare workflow before preparing.
6. For every source/receiving declaration, choose its retained current value, the displayed source proposal, or an explicit edited value. Confirm each field with its reason. Choose original attached source ids through the labeled source and receiving checkboxes; the following catalogue must be bound in both. Unchanged fields default to the current declaration and still need review.
7. Prepare the Installation and inspect the same saved target, original commercial Workshare, selected source and native preview. Download the complete customer handover. Receive the reviewed draft into the original Installation editor, inspect its document, then run the original Preview and Save.
8. Reopen the saved Installation. Its id is unchanged and its revision advances once. Both prior and following saved revisions, the originals and the complete source-bound review remain available.

Terms, milestones, Workshare selection, assignments, deployments and completed receiving declarations are preserved. This source workflow exposes source and receiving text/bindings for explicit review; other fields stay byte-equivalent JSON. If the scope needs commercial or operational changes, make them through the existing Workshare/Installation workflow and start a fresh comparison against that saved state. No default resets completed checks.

Unfinished fields and invalid advanced JSON remain editable browser work. The complete working archive retains both original sources, the frozen comparison, attributed choices, current document, drafts, prior checkpoints and handover receipts. Advanced JSON is available for importing or inspecting a complete review; ordinary operation uses labeled controls. A changed target selector invalidates preparation but retains the old review for inspection.

## Existing API and CLI

The existing POST /api/operations/{case}/material-catalog/{template,prepare,handover} endpoints carry the same sourceId, expectedSourceSha256, expectedVersion and operationId. For the saved target add installationId, expectedRevision, expectedInstallationSha256, previousSourceId and expectedPreviousSourceSha256. Template returns the exact comparison and an unfinished review. Prepare and handover add followingReview, the original selection and bindings. Handover also binds expectedPreparationSha256.

These calls are read-only preparation. The backend reads the current saved Installation inside the original case snapshot and verifies the attached Workshare through the maintained implementation. It does not call a replacement Installation writer. The original Installation Preview/Save owns validation, expected case/revision guards and mutation replay.

The existing Operations CLI retains material-catalog-template, material-catalog-prepare and material-catalog-handover. Use its original workspace/case/source/version/operation flags, then --installation SAVED_ID --installation-revision REVISION --installation-sha256 SAVED_SHA --previous-source SOURCE_ID --previous-sha256 ORIGINAL_SHA. Prepare and handover also require --following-review REVIEW.json, --selection SELECTION.json and --bindings BINDINGS.json. The complete saved document is selected by the backend; if --document is supplied it must equal that actual saved document.

For a complete copied source package, the original product CLI accepts template/prepare with --following source/following.json and --previousBundle source/previous-catalog.jsonl alongside its original --bundle, --sha256, --seed, --case, --commissioning, --selection, --bindings and --attachments inputs. The copied native seed and case must be genuine saved originals. Do not construct a seed or approve terms by editing these files.

## Customer package and independent reopen

The package carries both complete catalogue files, the full following comparison and review, original case/seed/Workshare, current selected commercial inputs, every required original source attachment, retained application sources, complete manifest, original source bindings, START_HERE.html and REOPEN.md. Its standalone reader is assembled from eight retained reader modules. The commissioning source closure has 21 original/additive source files; the following guide and model are included.

For a following package, START_HERE names the exact saved Installation id/revision, current case, both original catalogue identities and the complete comparison/review. The installation-preview-input.json file is the exact original same-ID API request. installation-input.json contains the document only and must not be used to choose a new Installation. The package directs the operator back to the Source Desk's reviewed same-ID handoff and original editor Preview/Save.

Independent reopen uses the package's own application/products/material-catalog/commissioning/cli.mjs with reopen --directory THE_COMPLETE_PACKAGE_DIRECTORY. It reads the exact saved members, reconstructs the same source-bound preparation, verifies every declared byte count/hash and refuses changed or unexpected members. Atomic new-directory preparation and same-request replay preserve existing output rather than overwriting another source selection.

## Same original receiving course

The existing material-catalogue-source-desk-receiving.py controller optionally selects followingInstallation before it starts its one browser/host lifetime. Its sourcePath, bytes, sha256 and previousSha256 must identify actual original full bundles. Its review supplies the actual actor/time, explicit scope confirmation, complete source-review note, every material key/before/after hash/disposition/reason, every field choice and both binding choices. No generated approval or partner fixture is substituted.

The additive material-installation-following-browser.mjs runs inside the existing browser driver: exact attachment; same saved target comparison; ordinary labeled controls; incomplete/error state; full customer ZIP; original editor Preview/Save; saved and working reopen; desktop and narrow images. The receiving helper checks the actual saved same-id revision, protected document fields, exact frozen source, copied package reopening and whole-case export/cold restore. It creates no second controller, browser, catalogue or writer.

Receiving reports describe only actual completed phases. Source review, pure source assembly and syntax checks do not establish native or visual acceptance. The current receiving remains the existing equipped 38F0 Material operation. Actual later catalogue selection, complete native/browser execution and producer inspection are recorded there when returned.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

