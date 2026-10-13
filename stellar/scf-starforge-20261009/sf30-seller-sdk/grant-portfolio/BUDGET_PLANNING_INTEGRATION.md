# Planning component integration

This component extends the maintained Grant Portfolio application. It uses the existing portfolio definition, writer, saved operations, source editions, program scope and complete handoff. There is no second database or mutation route.

## Complete source

New source:

- web/budget-planning.js and web/budget-planning.css: complete neutral staff workspace.
- budget-planning-client.mjs and budget-planning-client.d.mts: typed changes, original save helper, stable complete scenario copy.
- BUDGET_PLANNING.md: customer operating guide.
- BUDGET_PLANNING_INTEGRATION.md: this internal integration note.

Additive full postimages are supplied for web/app.js, web/index.html, client.mjs and client.d.mts. The delivery packet includes exact before/after anchors. Apply each once against the current cumulative source; preserve concurrent award intake and governance/reporting changes.

The browser's host receives the existing runOriginal function in addition to the original H helpers so a retained planning operation can use the same original continuation after a browser reopen. It does not replace action, saved request status, or writer behavior.

Root owns the native planning model, portfolio integration, server routes and source-files.json. Register the new JavaScript/CSS static assets and all runtime/guide/client leaves in the same current source closure. The base source used here is the complete 147-file source edition at merge 421a29d40b0b6854acbbd51db52258062027b066, packet SHA-256 770b56676ce3a44ab1229ec8e078e1d5661321d2f9a8e92888facb9cf441dba0.

## Native reads and files

The client and browser use GET /api/planning/schema, record, history, summary and report. Selection always includes the original portfolioId and revision. Summary additionally selects scenarioId, optional compareScenarioId, and month or year granularity.

The summary envelope contains schema, portfolioId, revision, snapshot, planningRevision, scenario identity and summary. The browser consumes native totals exactly and never sums money through JavaScript Number. Null amounts and opening balances remain distinct from zero.

The native report stream supplies Content-Length, X-Content-SHA256, ETag and attachment filename, with application/json, text/csv or text/html. The typed client returns the complete descriptor and response, or uses the maintained original full-file receiver to save exact bytes.

## Save and recovery

The new helper calls the existing client.savePortfolio with original name/notes/sources/review and planning changes. The original 1 MiB encoded action limit is unchanged. Planning batches are limited to 2,000 records; complete model size and total record bounds remain native decisions.

The browser draft records the complete original operation immediately after action starts. On an uncertain response it keeps that same operation and changes. Native confirmed FAILED results can be reviewed and released into a retained unsent draft. Original records that changed after a draft's basis are displayed as conflicts before rebasing.

The complete editable draft JSON includes its original portfolio snapshot, planning revision, original affected-record hashes, stable new IDs, complete changes and archive reasons. File receiving uses a generation and selected-revision check so a completed older asynchronous read cannot replace a newer selection.

## Original operating continuation

Run this component in the already-owned SPC application, retaining its current source, program, awards and supplier ledger. Use the same native operating case for:

1. A complete multiannual scenario scoped to an existing program/project, with two currencies, a known zero, an unknown amount and an explicit opening balance.
2. A forecast and written commitment tied to the original supporting documents and a workplan milestone.
3. A budget month different from the expected cash date; one undated cash line retained for review.
4. A complete staged save and exact original-request continuation, followed by monthly and annual native positions.
5. A saved reviewed scenario, a subsequent line change resetting it to working, and a separate new review save. Repeat with an unrelated program edit that retains review, then a linked milestone date or other supporting-record change that returns the affected scenario to working. Preserve the earlier portfolio history throughout.
6. A linked scenario copy, revised forecast and native comparison.
7. Complete JSON/CSV/HTML downloads and earlier-record history, followed by original portfolio export and receive.
8. The complete industrial browser flow at desktop and 390-pixel widths, including source picker, bulk lines, draft save/reopen, summary pages and full downloads.

Keep each actual original returned identity and correction with that same current case. Source-level JavaScript parse checks performed during authoring do not replace the original Python/browser run.

## Complete published-source receiving

The cumulative source includes import_spc_budget.py and all four original examples/spc/published-budget files. Run `python3 grant-portfolio/import_spc_budget.py /absolute/original/workspace --actor 'Budget operator'` against the existing original workspace, adding `--create` only for a new one. Retain its original receiving request, 22 program nodes, 126 annual lines, three documents, six complete reports and full export. Then open that actual portfolio in the same browser flow. The separate `run_budget_planning.py` commissioning course retains its clearly labeled operating figures for edit/review/copy/recovery and full receive.
