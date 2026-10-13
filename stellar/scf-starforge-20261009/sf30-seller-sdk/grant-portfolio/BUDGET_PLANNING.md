# Budget and forecast

Use **Budget and forecast** in the existing Grant Portfolio console to prepare a multiannual budget, view its annual workplan, record revised forecasts, and review expected cash. Each saved change creates the next portfolio revision. The same complete portfolio handoff retains the planning records, their original supporting sources, and the earlier revisions.

## Prepare the project and supporting records

Open the intended portfolio and select its latest revision. In **Programme delivery**, retain the program and project hierarchy, grants, workplan milestones, and supporting documents. The planning workspace uses those original records when you select scope and evidence.

Choose a responsible editor in **Recorded by**. This is the person recording the change. A scenario also has an owner, and its review records a reviewer separately.

Keep source financial records in **Financial ledger**. Planning values are entered and reviewed for their intended budget period and cash timing; source amounts are not converted, prorated, or silently inserted into a forecast.

## Create a complete scenario

Select **Add scenario** and enter:

- A recognizable code and title, the program or project, and its owner.
- The first and last month, inclusive. A scenario may cover up to 240 months.
- The scope and assumptions used to prepare the budget.
- An opening cash balance for each relevant currency when that balance is known.
- The original supporting documents and source records, plus any notes.

Currency codes use three uppercase letters. Enter amounts as ordinary decimal text, including a sign when it is part of the original amount. Up to 18 fractional digits are retained. For example, `1250.7500` keeps its supplied precision in the saved record. Do not use thousands separators, currency symbols, or scientific notation.

An opening balance of zero is a known zero. An omitted opening balance is unknown, and the cash view marks it accordingly. Add separate balances for different currencies; the workspace does not combine them into a converted total.

**Stage scenario** places the complete record in the working draft. It does not save a portfolio revision yet. Add the scenario's lines and review the full draft before saving.

## Enter budget lines and cash timing

With the scenario selected, choose **Add budget line**. Record the code, title, category, scoped program or project, and any associated grant. A line must remain within the scenario's project hierarchy.

Select **Inflow** or **Outflow**, then record its budget year or month, original amount, and currency. Use `YYYY` for an original annual amount or `YYYY-MM` for an amount assigned to a specific month. A year-only line requires that complete January–December year to lie within the scenario horizon. A blank amount means unknown. Enter `0` for an explicit zero. Signed decimal amounts are preserved; use the sign that represents the intended correction or forecast.

Choose one basis:

| Basis | Record |
|---|---|
| Forecast | The planning assumption and its available source references. |
| Written commitment | The actual commitment reference, with its original supporting documents or source records where available. |

A commitment reference is required when a line is classified as committed. The category and basis remain separate: a category describes the work or cost, while the basis describes the support for the amount.

Record the expected cash date when it is known. **Budget year or month** determines the budget-period view. **Cash date** determines the expected cash-period view. They may differ while remaining inside the scenario horizon. Annual amounts are included exactly in the annual budget view. In the monthly budget view, they remain in **Annual amounts not allocated to months**, and the affected currency's monthly rows show the unallocated count. The workspace does not distribute an annual amount across months or assign it to a generated December entry. A line without a cash date stays in **Cash dates to complete**, with its amount and original identity available for review.

Select a related workplan milestone when appropriate. The milestone retains its own owner, scope, dates, status, and history in Programme delivery.

Supporting documents and original source references remain part of each saved line. The source picker searches the complete selected source edition and retains the chosen record's original identity.

## Review and save related changes

The working draft keeps the staged record IDs, original revisions, changed fields, archive reasons, and affected-record identities. Use **Review all staged changes** to inspect the complete set.

**Budget lines** supports search, year or month and direction filters, and 50-row pages. Select a page's lines and use **Edit selected lines** to revise their amounts, budget months, cash dates, basis, or commitment references together. Unedited scope, evidence, and source references are retained.

After reviewing the changes, choose **Save complete draft**. The original portfolio writer checks the portfolio revision, planning revision, record revisions, scope, references, and amounts together. When it succeeds, open the saved budget and cash position.

A save supports at most 2,000 changed or archived records and the console's original 1 MiB action limit. The interface checks the complete encoded action before sending it. For a larger plan, download the complete draft and use explicit smaller batches through the maintained client, selecting each newly saved revision before the following batch. Keep the scenario and any prerequisite records in the earlier batch. Every batch produces its own original portfolio revision.

### Keep a draft between sessions

The browser retains the current draft for its workspace and portfolio when local browser storage is available. **Download draft JSON** saves the full editable draft, including its original basis. If the browser cannot retain it, the workspace displays a message directing you to download it.

Use **Receive a complete draft JSON** to reopen that exact draft in its original portfolio. Download and clear a different local draft first. Imported changes remain staged until reviewed and saved.

If the saved portfolio has advanced, **Review against current revision** compares every affected original record with the draft's retained record identity. Unchanged affected records can be moved to the current portfolio basis explicitly. If an affected record changed, the interface lists the complete conflicts and keeps the draft available for download. Open the current records and compose the intended changes against that current state.

### Continue an interrupted save

A submitted draft retains its original operation. Use **Receive original save** to read and continue that same request. The console's **Saved operations** view also provides the full saved input, state, result, and original continuation.

If the operation is confirmed failed, inspect its full result. **Keep changes for current-revision review** releases that failed draft operation while retaining its changes for review. An unresolved operation remains attached to its original request.

## Read the monthly, annual, and cash views

Select **Budget and cash position**, then choose **Monthly** or **Annual**. Values in these tables come from the saved planning engine. If you have unsaved staged edits, the interface labels the position as the saved revision.

Each currency has its own rows. The budget view separates forecast and committed inflows and outflows. It displays known amounts, counts of unknown amounts, known net movement, and completeness.

The cash view uses recorded cash dates, each currency's opening balance, known inflows and outflows, known net movement, and known closing balance. Unknown opening balances, missing amounts, and undated cash remain visible. Complete row lists are paged for reading; the native report downloads contain the full selection.

**Amounts to complete** and **Cash dates to complete** show the complete original lines requiring attention. Open a line to inspect its retained amount, period, supporting records, and history before editing.

**Workplan in this horizon** shows the original active milestones selected by the scenario's scope and dates. Open a milestone to inspect its original program record.

## Compare and revise scenarios

Choose another saved scenario in **Compare saved scenario**. The difference is the selected scenario minus the compared scenario. Budget and cash comparisons preserve the original periods and currencies and identify incomplete or missing counterparts.

**Copy scenario** prepares a new stable scenario ID and new line IDs. It retains the full active line content, currencies, exact amount text, dates, evidence, and source references. The copied scenario records the original scenario's ID, record revision, and hash in its lineage. Give it a new code and title, review its complete draft, and save it before editing a revised forecast.

The browser copies up to the 2,000-record save limit in one draft. The client can prepare a complete larger copy with stable IDs for explicit sequential batches. Preserve the returned copy plan before sending its first batch.

A copy starts working. An edit to a reviewed scenario's lines resets that scenario to working in the native model. Changes to a linked program, grant, milestone, supporting document, selected source, or annual workplan also return the affected scenario to working so its review reflects the current supporting records. Changes to an unrelated program retain the scenario's review. Save the working changes first, inspect the updated budget and workplan, then record review as a separate save.

## Record the actual review

Open a saved scenario and choose **Record review**. Enter the reviewer and the actual review note. The issued requirement P1.09 calls for a multi-year workplan and budget and an annual workplan, prepared by the project manager or project assistant, with Finance and team-lead clearance. It identifies no new gate. Apply the existing program's clearance procedure and record the completed review; the planning workspace does not create an additional universal approval gate.

The indicative scope or budget in P1.01b remains a separate optional item.

## Retain reports and earlier editions

Use **Download JSON**, **Download CSV**, or **Download HTML** for the complete saved scenario, selected granularity, and comparison. The JSON contains the original selected line records and their references alongside the native summary. The CSV keeps explicit period, currency, completeness, and amount meanings. The HTML is a readable saved report.

Open a scenario or line and choose **Saved record history** to inspect each retained record edition and its portfolio revision. A complete history JSON download is also available.

Use the portfolio revision selector to reopen an earlier saved position. Earlier revisions are read-only. To hand over the complete case, use the original **Export complete portfolio** and **Receive complete portfolio** workflow. That handoff preserves planning together with the original programme, awards, sources, documents, and saved revisions.

## Open the published SPC annual budget

The supplied original source package includes the complete published 2025R / 2026 table, its original indexed table capture, and the complete cell CSV. Its annual labels and blank cells remain available beside the editable planning records.

From the maintained SDK source root, receive the published budget into the intended original private workspace:

```sh
python3 grant-portfolio/import_spc_budget.py /absolute/original/workspace --actor 'Budget operator'
```

Use `--create` only when the selected workspace path is new. For an existing workspace, use the original workspace path and its ordinary lifecycle.

The receiving command prepares one complete persistent original request. Reopening the command continues that same request and its retained identities. It creates the original 21 program rows beneath one portfolio node, 126 annual category lines, and three complete source documents. It also writes monthly and annual reports in JSON, CSV and HTML, and the complete portfolio handoff.

The 2025R revised-year label stays on its original records and source notes. Its year is 2025; the following published budget is 2026. Funding categories remain unrestricted core, restricted program and restricted project. Blanks are unknown amounts. Income and aggregate published controls remain in the complete source documents rather than being added again as program expenditure. Annual values receive no generated monthly allocation or cash dates.
