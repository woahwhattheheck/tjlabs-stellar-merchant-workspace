# Grant tracker: original source to reviewed customer handover

Open **Operating plans → Grant tracker** at the installed Command finder address. Keep that address consistent so the same browser can reopen its saved plans and working reviews.

## Start with one customer’s complete inputs

Create a grant tracker with the customer’s title. Enter customer, owner, purpose, period and receiving instructions in the existing Operating plan fields, then **Save revision**. Each nonprofit keeps its own plan and returned review.

For the original six SummitFlow profiles, carry that nonprofit’s four original files and the common START_HERE file. Keep the two aggregate internal research ledgers outside every customer plan. The public Riverbend spreadsheet row is illustrative. Published award history and researched prospects are source evidence; they do not establish a current award or an actual reporting date.

Expand **Original sources and positional column mapping**. Choose the complete file and a stable source ID. Choose tracker, award terms, award history or supporting evidence. Use CSV or TSV only for actual tables; choose binary for an original PDF, document or other supporting file so every byte is retained without an invented table. Select UTF-8 or Windows-1252 explicitly for tables and enter the physical header-record number.

Choose **Read all physical records and map columns**. Inspect the complete physical-record list and select each column by its numeric position and exact heading. The unique-heading suggestion is an explicit button. Duplicate or absent headings remain unmapped until reviewed; duplicate positions never collapse into object keys. Blank and ragged rows remain physical records. Import the complete source as one saved revision; an oversized complete intake fails without importing a subset.

The source panel lists every original file, complete metadata, SHA-256 and original download. Additional evidence uses a new source ID; importing a distinct interpretation never overwrites the old source or its original mapping.

## Review grants and obligations

Every physical row has its source ID, record number and line number. Search and paging change only the displayed rows. Select a row to inspect its complete raw cells, mapped values, reviewed values, candidate relationships and current review findings.

Set the row disposition explicitly: candidate, active award, historical award, excluded, or leave unresolved. Record why. Requested amount and awarded amount are separate fields. The 12-column template has no awarded-amount or currency column; absent values remain absent until an operator records a reviewed value with its own reason. An empty source cell, an absent ragged-row cell and an unmapped column remain distinguishable in the original source and review JSON.

To change a field, enable its reviewed-value control and enter both the exact value and reason. Monetary values remain decimal text and currency is an explicit three-letter code. Do not infer awarded amounts from requests or current obligations from historical funding. Resolve duplicate/related candidates by exact physical row ID with an explicit reason, or record that the rows are distinct.

Add each obligation independently. Record its kind, actual due date, owner, state, exact retained evidence source, page/section/row locator, decision reason and any actual result. A report-date cell alone is not a confirmed obligation. Confirmed reports and renewals refer to actual retained award terms. A completed obligation also records what was completed. Save the reviewed row as a new original Operating plan revision.

Working inputs are retained on input in the existing draft store, separately from saved plan history. Navigation does not silently commit them. **Download working review** carries the full saved plan and all unfinished inputs, including a pending complete source file. Reopen it only after opening its original plan. If the working file contains saved revisions that are not yet in this browser, the panel keeps the current working inputs and offers **Download the working review’s complete original plan**. Receive that complete JSON through **Import complete plan**, then reopen the working review. Divergent saved histories require the original returned-plan review. Each working row stays bound to the revision it was prepared against. If the plan advances, preserve the old working row and explicitly start a new edit from the current row; stale edits are never silently replayed.

## Hand over, reopen and review returned work

Choose **Prepare all complete downloads**. Save every listed output: complete editable plan JSON, reviewed tracker CSV, obligations CSV, full review JSON and complete readable offline HTML. The editable plan retains all original files and saved revisions. The report exposes source downloads and a complete-plan download. CSV is a spreadsheet projection; exact text, absent-versus-empty values, original mappings and source bytes remain in the plan and review JSON. Spreadsheet formula-leading text is escaped only in the reviewed CSV projection.

On another browser or computer, use **Import complete plan** in Operating plans and reopen its Grant tracker panel. Full source/history validation runs before receiving the plan. An exact repeated plan is reusable. A newer compatible history extends the same plan. A conflicting history is retained for explicit review rather than replacing the saved plan.

Choose **Review a returned complete plan**. The existing Returned procedures page opens the current saved plan. Select the returned complete JSON, name the reviewer and review every compatible or conflicting change. The page adds readable current/returned grant records, evidence and complete offline reports to the original change review. Record each choice and its reason. Custom choices still pass the original plan schema and the grant-source validation. Keep the complete working return review until every choice is resolved. **Download editable workbook** carries the current complete return editor, both original plans and files, and the grant adapter with its original CSV parser. Open that HTML independently to continue reviewing without a server. The offline workbook keeps pending choices and uses in-memory editing if local browser storage is unavailable; download its latest edition to preserve those inputs.

**Complete review and save procedure** first retains the full reviewed result, validates every retained source and physical row, then compares the actual saved current history in the original transaction. If another tab advanced the plan, the completed review remains available and the destination is untouched. Refresh the current plan and prepare the next comparison. Repeating a completed review accepts its exact result or a later history that already contains it. Download the resulting complete plan and independently reopen it before accepting the handover.

## Existing engine and limits

This operator uses the maintained OperatingPlan and OperatingPlanReturn engines. The native Grant reporting procedure for SF47 cases, packages, milestones, contributors and assignments remains separately available. No native case or source-project identity is invented to import a funder tracker.

A plan has at most 1,000 original operating steps, including identity/source steps; this is fewer than 1,000 grant rows once source steps are included. Each complete carried file is limited to 24 MiB and the full plan, including repeated historical source bytes, to 32 MiB. Complete working-review downloads are limited to 64 MiB. Intake either fits completely or is rejected. The operator records work and exports files; it schedules no reminder and sends no message.
