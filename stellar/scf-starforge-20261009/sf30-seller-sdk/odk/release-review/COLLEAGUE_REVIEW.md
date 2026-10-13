# Colleague form release review

This extends the existing **Form releases** desk and original Central workspace. Staff can hand over the complete saved comparison for offline review, receive the colleague's complete file, compare it with current staff work, and save explicit dispositions through the original release-decision transaction.

## Staff course

1. Save the current comparison, mappings and staff decisions in **Form releases**.
2. Under **Colleague review**, choose **Download colleague working HTML**. The saved export binds the exact review revision, baseline/candidate editions, assessment, reporting definitions and native review history.
3. Open that complete HTML locally. Review the source selection, categorized changes, complete before/after facts, coverage and affected outputs. Open the original XForms and other files from **Sources**.
4. Enter the colleague name, overall note and selected change dispositions. Keep unfinished work, save attributed local editions, download the complete working HTML, and reopen it. The complete returned JSON carries the original package, current draft and all saved colleague editions.
5. In the original installed review, choose the returned JSON and **Receive and compare feedback**. The original complete file is retained unchanged before it is validated.
6. Read the returned overall note and edition history. Each changed disposition displays original/current/colleague meaning; explicitly select the current staff decision or the colleague decision. A missing colleague disposition retains the current decision. An unfinished note must be completed in the colleague file before selecting that disposition.
7. Save or reload any existing local native draft first. Enter the accepting staff reviewer, decision note and **Staff review** or **Request candidate revision**. **Apply explicit feedback selection** saves the exact choices and complete returned attribution in the original review.
8. Use the existing approval and frozen publication-plan controls after reviewing the resulting current record. The existing Central publication owner retains publication and source receiving.

A colleague's name and saved dates are attributed statements in their working file. They do not authenticate a person. The native accepting staff reviewer records the explicit selection and retains the exact incoming source.

## Whole original source custody

The package includes both complete retained source records and their published history; original XML, native field schema, available authoring model, original named form attachments, retained OData service/catalog metadata, and the draft attachment-inventory/field continuation bodies. Identical original bytes occur once in the file array; every original source/side/name occurrence remains listed.

Available files are verified against their original byte count and SHA-256 before export. The offline desk independently validates the complete package content hash and each decoded file before enabling review. Original filenames are display/download names, never filesystem destinations.

The full raw Central draft metadata responses can contain private draft credentials. Those two native metadata receipts stay in the original workspace. The package explicitly lists them under `fileCoverage.nativeOnly` with their exact retained receipt and reason, while carrying the source's existing sanitized metadata. This is an explicit source-custody distinction. Missing or unavailable media remains visible in the original source records; it is never replaced with an invented file.

The complete incoming colleague JSON and outgoing package/HTML are retained in the existing content-addressed Store, and their records travel with the ordinary full workspace archive. Native source files and all prior review/approval history remain attached.

## Changed current work

The receiving preview reads current staff work on every opening. It compares the original assessment and source IDs, current reporting-definition hash and saved review revision.

If the comparison or reporting definitions changed, the original feedback remains readable/downloadable beside the current review. Recompute the native reporting comparison and export its current package for a following colleague edition. The old file remains the original source for that staff discussion.

If only staff decisions changed while the source assessment and reporting definitions stayed identical, the preview exposes those current-vs-colleague differences. Each returned difference needs an explicit choice. Applying is bound to the exact current revision, full saved-review identity and current dependency generation shown by that preview.

Application of feedback uses the existing `decide` transaction. Its staff-decision history, complete colleague-source receipt, selected decisions and receiving `APPLIED` record commit together. The former approval remains in source/history; applying new staff work opens the current review again. Repeating the same accepted request returns its saved receiving result even after later staff work. Another selection for that already applied return is rejected; a following colleague file is a distinct retained receiving record.

## Recovery and input sizes

Export uses a caller-generated package ID and original review revision. An accepted package ID always reopens that exact exported edition, even if current staff work changes later. Concurrent identical exports share the same active receiving promise.

The browser keeps the original export, incoming-file or apply request before sending. An interrupted incoming response is checked by its original return ID; resuming with a file requires the same complete byte count and SHA. A definitively rejected file can be retained in browser request history and a corrected file selected under a new request. An interrupted apply response reuses the same selected body.

The ordinary authenticated JSON API retains its existing 16 MiB request limit. The dedicated original-file receiving route streams into the existing Store with a 256 MiB cap, then decodes strict UTF-8 JSON. The browser checks that cap before upload. SDK receiving from an already retained source hash uses the original Store body. Large original files remain whole; the operator sees explicit size failures rather than partial source acceptance.

Workspace close waits for these receiving operations through the original active-operation lifecycle. This adds no separate process, journal writer, Central connection or scheduled operation.

## SDK and HTTP

Existing `CentralFormReleaseReview` methods:

- `exportColleague({id,expectedRevision,packageId})` returns saved package and HTML receipts.
- `receiveColleague({id,reviewId,originalText})` receives complete original UTF-8 JSON.
- `receiveColleagueFile({id,reviewId,sourceSha256})` uses an already retained original body.
- `receiveColleagueStream({id,reviewId},stream)` retains a complete original stream.
- `previewColleague({id})` compares the retained return with current staff work.
- `applyColleague({id,expectedRevision,previewHash,reviewer,note,overall,choices})` applies explicit current/colleague selections.

All use the same authenticated listener. Existing action routes add `exportColleague`, `receiveColleague`, `receiveColleagueFile` and `applyColleague`. `GET /api/form-releases/colleague-returns/:id` opens the current preview. `POST` to that same path with `?reviewId=...` and `Content-Type: application/json` receives the complete original file body. Operator tokens remain in the Authorization header. Downloading uses the existing local file tickets.

`getReview` adds `colleague.packages` and `colleague.returns` summaries. Source records and raw files remain separate; routine review/state requests do not repeat complete binary packages.

## Original installed receiving continuation

Continue the existing ODK programme, Central host and saved source operation. Use its original simple blank-version baseline and removed-age candidate already described in `README.md`; retain actual native field membership and the existing age-report dependency. No replacement fixture or Central process is introduced.

The receiving operator should export the actual saved review, open its complete colleague HTML at desktop and 390 px, download the original XML and attachment, save an attributed edition and unfinished draft, download/reopen the complete HTML, and return the complete JSON. In the existing installed workspace, inspect source coverage and current/colleague choices, save feedback, reopen the review and original return, and continue the same approval/publication-plan course.

Also exercise an actual later native staff edit before receiving a colleague return: current decisions must remain visible and require explicit selection. Change one real reporting definition through the original commissioning desk and confirm its actual changed comparison is visible before preparing its following current package. Retain the original source and full output files with the existing native case. Return actual desktop/narrow images and opened downloads to C40F for viewing and correction.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Before calling any customer/prospect-facing application, website, dashboard, demo, report, presentation or export ready, open/run/render the exact outgoing version, look at the rendered screen or its actual screenshots, and operate the important user controls. Inspect the actual screenshare width and narrow/mobile width where relevant, populated/empty/loading/error states, downloads/exports and reopening. Capturing screenshots without viewing them is insufficient. Code review, DOM counts, HTTP 200, unit checks and another worker's approval do not replace seeing the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk; do not run broad suites or build a verification product.

Include this complete instruction in delegated assignments and the active owner-controlled policy, boot, build and receiving guidance those workers actually read. Preserve all other owner controls and original operation identities. Leave historical records and third-party/vendor policies intact. Do not force restarts, create watchers or revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999

