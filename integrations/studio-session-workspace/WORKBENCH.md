# Studio Session Workbench — browser and receiving guide

## Source study: actual operating sequence

1. Name the study. **Workspace name draft** is unfinished text; **Apply workspace name** validates and adopts it after retaining the current complete copy. Clearing the draft name does not invalidate the current study or its exports. A separately named study uses **Retain current and open new study**.
2. Prepare all eight sources: rooms, sessions, crew_rules, crew, reports, allocations, invoice_lines and payments. Select each table and import its exact original file or enter an agreed normalized table. The required columns appear above the editor. Every table is required; a header-only table explicitly records no rows.
3. Keep the exact original filename, edition ID/label, received-at timestamp and source notes. All timestamps must include the declared UTC offset. Monetary amounts are integer minor units with explicit currency; never enter display amounts such as $120.00 into a minor-unit column.
4. Source files receive strict UTF-8 decoding. BOM and CRLF are retained. The original binary file remains downloadable even after you edit the draft. A malformed UTF-8 file is retained as original bytes with its error; the earlier editable text is kept.
5. **Receive all eight as a new edition** validates the entire set and appends an immutable edition. Previous editions and their exact sources remain available. Selecting an old edition does not rewrite the current source draft. **Copy selected edition into next draft** prepares a separately named correction.
6. Inspect sessions, crew coverage, report status, expected and observed payer components, invoice totals, receipts/refunds and source attention. Values remain in declared minor units; currencies are not combined.
7. Choose one exact finding and record reviewer, disposition, reason and evidence. Each correction names its prior review. The new review does not alter source amounts. Correct a source discrepancy by receiving a new full edition; keep the original reviewed edition.
8. Download the selected edition's ordinary report, complete table CSV and exact originals. Download **full workspace JSON** for every source edition, unfinished eight-table draft, original file receipt, review draft, working note and native continuation.
9. **Download complete working HTML** embeds the current complete workspace in a portable offline application. Reopen the downloaded file and verify its study, selected edition, unfinished notes and any native continuation before handover.

The authored worked application contains two source editions. The first records six booked hours, eight actual hours, declared base 72000 and overtime 24000 USD minor units, an unresolved assistant/report and an original 12000 overtime invoice line. The corrected edition retains the first originals and review history, adds accepted cover and signoff, and records the full overtime. This example is separate from the real researched studio profiles.

## Saved copies and interruption recovery

**Save complete working copy** writes a complete immutable proposal and atomically compares the expected browser saved head. A conflicting head leaves the entire proposal in Retained copies. Opening a retained copy or external workspace makes it an unsaved proposal; opening the current saved head restores its accepted version. A later copy-list read failure cannot undo an accepted save.

Every destructive adoption first retains the current complete working copy. If browser storage is full/unavailable, download the full workspace JSON and confirm that the file was saved; that exact confirmed body permits replacement. Any later edit invalidates that confirmation. Keep multiple portable editions for consequential handovers. Browser storage belongs to that browser profile and may be removed by browser maintenance.

The source and review forms are always part of full workspace exports, including unfinished invalid draft text. Actual original file receipts are retained independently of editor text. While an asynchronous operation runs, mutation controls are locked and the selected File/table are frozen before the first await.

## Native continuation

The complete engine guide is **OPERATE_SESSION_STUDY.md**. Continue the exact exported browser wrapper using:

    node studio-session-native.mjs --workspace browser-workspace.json --command receive-command.json --out NEW_DIRECTORY

The command's eight source paths resolve relative to its command file. Output directories are create-only. The returned **workspace.json** retains the complete browser wrapper/session and updated source study; **original-input-workspace.json** preserves the once-read incoming bytes. Open returned workspace.json using the existing workbench's **Open full workspace**.

Native command attempts and all retained byte receipts appear in the Native continuation panel. A rejected attempt leaves the adopted core intact with the full original command and failure. **Download native continuation** saves that record. **Retain current and clear continuation** deliberately retains the previous whole copy first. No command retries automatically.

Run the native receiving course with:

    node receiving/run-native-course.mjs NEW_DIRECTORY

The actual retained receiving result records the production-function V8 execution with explicit filesystem adapters. Use the same chapter below for the equipped browser's rendered/download receiving.


## Existing caller-owned rendered receiving chapter

Keep the exact selected source revision and all actual returned files with the receiving result.

- Open blank and worked applications at desktop and 390px width. Read all headers, source controls, amount columns and original-download controls; inspect overflow and print the ordinary report.
- Load the authored originals, inspect all eight tables, receive one edition, append/correct one finding review, select the historical edition, and return to the current one. Verify exact source downloads and full retained review history.
- Leave a deliberately unfinished CSV edit, blank workspace-name draft and review reason. Download full JSON and complete working HTML; reopen both and inspect those literal drafts.
- Import a UTF-8 BOM/CRLF CSV and a malformed UTF-8 file. Verify original binary downloads, selected table binding and preserved previous editable text.
- Save, retain/open an independent copy and check the visibly unsaved proposal. Use a second tab to cause an actual saved-head conflict; both complete proposals must remain downloadable.
- Pass the exported desk through the native continuation above; reopen returned workspace.json and inspect complete working fields and the native attempt. Keep original output directories.
- Preserve desktop/narrow screenshots and exact returned full workspace/report/download identities in the same original receiving thread.


The retained controller result executes actual production functions with explicit V8 adapters. Use this browser chapter to observe actual rendering, controls and downloads.
