# Budget worksheet integration and receiving

## Original application boundary

This feature extends the maintained Grant Portfolio Budget Planning console. It adds one pure worksheet core, the unchanged maintained source-table parser, one browser module and the customer operating guide. The original program model, planning model, exact financial arithmetic, ledger, donor statements, awards, source service, database and HTTP mutation route remain the same.

The browser module is loaded by the existing selected-scenario control. It uses the original dialog helpers and current portfolio/draft. New static paths are only source assets:

- /budget-worksheet.js
- /budget-worksheet-core.mjs
- /budget-worksheet-table.mjs

All three assets and both guides belong in the maintained source-files.json closure. The source packet contains complete postimages and exact original joins.

## Core contract

budget-worksheet-core.mjs exports:

- prepareWorksheet(context, {scenarioId, at, id})
- receiveWorksheet(completeWorksheet)
- startReview(worksheet, {text, name, delimiter, at, id})
- receiveReview(completeReview)
- remapReview(review, mapping)
- chooseConflict(review, conflict, decision)
- excludeRecord(review, sourceRecord, reason)
- reviewWorksheet(review, context)
- contextFingerprint(context)
- stageWorksheet(review, context, {actor, at, documentId, expectedContextSha256})
- worksheetProgramme(completePlanningDraft)
- verifyWorksheetDocuments(completePlanningDraft)

Context contains workspaceId, portfolioId, revision, snapshot, planningRevision, programmeRevision, actor, current effective lines/scenarios, original saved lines/scenarios, complete programme.records and the original planning draft.

The core returns original planning changes and archive records. It performs no money aggregation. It keeps amounts as strings and checks the declared annual/monthly/date shape before the native writer's definitive validation.

The source-table parser is the maintained strict UTF-8/delimited-text closure from original blob dbb87b4d4131b9adb991af7caa7cbe3d3de8f1e3. Its parsing logic is unchanged.

## Atomic source and planning save

Existing drafts may additionally retain basis.programmeRevision and worksheetDocuments. Each document carries:

- Stable documentId and original nodeId.
- Source-derived title and original creation time.
- Complete JSON source text, filename, bytes and SHA-256.
- The exact uploaded original object descriptor, once returned.

Older planning drafts without those optional fields remain accepted.

Before committing a returned draft, saving or receiving an original pending request, the integration verifies the complete source documents and rechecks the selected snapshot and full draft identity across asynchronous boundaries.

The original /api/programme/upload receives the exact complete source JSON. After the descriptor is returned, it is retained in the draft before continuing. No document record is committed merely by uploading its content-addressed object.

The original portfolio.save receives both:

1. worksheetProgramme(draft), which creates original zero-revision workplan-budget documents at the original program revision.
2. The unchanged original planning batch, including a scenario reference to those document IDs.

The original Workspace applies the program changes before planning validation, then commits one portfolio revision. Normal programme_objects export/receive retains all complete uploaded source bytes.

The original 1 MiB action limit and 2,000-record planning limit remain. Uploaded full source text is referenced by its descriptor rather than duplicated inside the action payload. Complete portable drafts retain the source text and accept up to 16 MiB. Each incoming worksheet accepts up to 2 MiB and 1,999 rows.

An original source's staging basis remains historical after a safe draft rebase. Its original operator, time, worksheet/source identities and selected node are verified, while current recordBases and snapshot checks control the later save.

## Independent original-source exercise

The authoring exercise loaded all 126 original published SPC annual lines, retaining the exact original source values and 32 unknown line amounts. The unchanged roundtrip produced 126 unchanged rows, no source errors and no conflicts.

A separate explicitly labeled source exercise returned 127 rows with an added line, a provided zero for one previously unknown cell, one long exact decimal, an explicit archive and a concurrent amount edit. The complete three-way review required one explicit amount decision, retained an independent later note, and prepared the original program-document projection with all source bytes. Complete review and source JSON were independently reopened through the delivered core.

Those temporary source-exercise identities are separate from the native original SPC workspace. Native operation SCF-SPC-PMRS-PROGRAMME-RECEIVING-7DE2-20261013 remains the single accepting execution course. Adopt this cumulative source at that course's existing source boundary.

## Whole native operator continuation

Use the original current portfolio created by import_spc_budget.py and its saved scenario. Preserve its original IDs, revisions, all three published source documents and the current native request journal.

1. Open Budget worksheet, export the full CSV and original basis JSON, and inspect all 126 rows.
2. Return a copy with explicitly labeled operator changes: a known zero, an unknown value, a high-precision amount, one new row and one explicit archive.
3. Change a different note in the current app, then change the same amount on both sides. Review the complete conflict and retain the independent note.
4. Save the complete review JSON and reopen it before staging. Inspect a row outside the first page and all original source columns.
5. Stage the whole reviewed return. Verify the original draft includes the source document and scenario reference while retaining pre-existing unrelated changes.
6. Save through the original single portfolio.save. Retain the actual original request and continue it through any interrupted result. Open the linked source document and verify its full bytes.
7. Read the actual native annual and monthly reports. Confirm the annual amount remains unallocated to months, blank remains unknown and zero remains zero.
8. Verify the native scenario review returns to working after material changes and its earlier reviewed revision remains readable.
9. Export the complete original portfolio, independently receive it through the existing receiver, reopen its worksheet source document and verify exact history and reports.
10. Complete the original desktop and narrow-phone interface course, including mapping, row conflict, source pagination, draft receiving and complete downloads.

Use the original foreground/browser owner and retained runtime identity. This component does not introduce another native operation or database.
