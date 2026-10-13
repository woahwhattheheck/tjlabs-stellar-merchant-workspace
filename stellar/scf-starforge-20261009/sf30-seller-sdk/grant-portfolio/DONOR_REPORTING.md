# Donor reporting

This extends the existing Grant Portfolio programme application. Each donor statement is
part of its original report record and uses the existing portfolio save, record history,
submission, acknowledgment, complete export and receiving operations.

The SPC RFQ26-10663 source identifies scheduled donor reporting in lifecycle domain V,
financing and agreement registration in VII, and continuing contribution/donor agreement
management in VIII. Tasks 2 and 3 connect reporting, results, agreements and parent
programme/grant records. The complete issued supplement is retained in
[the original source carrier](https://tokenjunkielabs.slack.com/docs/T0BRETUB5TK/F0C8N3M2ZN2).
Its Annex C is an example; approved SPC inception artefacts determine the deployment's
final process and reporting templates.

## Prepare a complete report

1. Open the existing portfolio and select **Programme delivery → Donor reports**.
   Add a report in its programme/project and optional grant scope. Enter the actual
   reporting period, due date, owner, recipient, narrative and supporting documents.
2. Change **Period-specific donor statement** to **Configure donor statement**.
   Select the actual agreement or amendment and the results indicators to report.
3. Add a financial line for each intended financial meaning, currency, selected
   original source editions and dimension filter. Give the line a descriptive title
   and explain the source/date basis. The source buttons retain the actual edition IDs.
4. Select an original point date or complete source period. The presets expose IATI's
   value date, IATI's budget period and 360Giving's award date. An explicit JSON pointer
   can select another original date field. Inspect the full original rows before
   adopting a date field: value date, transaction date and award date have different
   meanings.
5. Save the draft through the normal report editor. Open **Open donor statement**.
   Inspect period amounts, original dimensions, date decisions, original observations,
   every unmatched source row and any differing supplied control total.
6. Use **Load saved report groups** to select the exact original group, then add supplied
   control totals and their source/basis where the donor has provided them. An explained exclusion binds the complete original row's source ID, row key
   and SHA256; changed source bytes require a new explicit selection.
7. Retain the review note for partial periods, missing or excluded inputs, unchanged
   source selections needing review, unselected financial meanings or control
   differences. Save the draft, inspect it again, then use the existing submitted state
   with the actual submission date.

Saving a submitted state records the local report and freezes its statement. The
application's external correspondence follows the existing owner workflow. The same
report can subsequently record acknowledgment. A corrected statement is a following
report linked to the earlier submitted report, with a correction reason.

## Financial period and reconciliation

The original programme selects source-bound financial rows through the current
programme/project/grant hierarchy. The donor statement starts with those exact row
references. Binding the same source entity to two nodes does not create another
financial occurrence.

A line selects:

| Field | Meaning |
| --- | --- |
| Original source edition IDs | Exact source versions already selected and bound within this scope. |
| Financial meaning | Exact original kind, such as IATI transactions or budgets, or the original 360Giving amount meaning. |
| Currency | Original three-letter currency; each line retains its selected currency. |
| Dimension filters | Exact original named values, such as transaction type or budget status. |
| Date mode and pointer | A complete original ISO date, or source start/end dates. |
| Basis | The operator's explanation of the financial meaning and date selection. |

Point dates include both report boundaries. A source period contributes only when its
complete start/end interval fits inside the report. A partially overlapping source
period remains visible as **PARTIAL_PERIOD**. There is no automatic proration. A
reversed or missing period retains its source row and a clear state.

The statement groups each line by source edition, standard, financial meaning, currency
and every original dimension except the explicitly selected date dimensions used to
filter the period. Each contributing value remains its original decimal string.
Budget type/status, transaction type, reporting organisation, hierarchy and other
unselected dimensions remain separate. The statement supplies no total across
currencies, distinct financial meanings or independent source editions.

The complete original records are retained alongside their date decisions:

| State | Treatment |
| --- | --- |
| INCLUDED | In period, eligible and supplied; contributes to exactly one line. |
| OUTSIDE_PERIOD | Original row remains available and contributes no amount. |
| PARTIAL_PERIOD | Original source interval overlaps a boundary; requires review. |
| MISSING_DATE / INVALID_DATE / REVERSED_PERIOD | Original date input requires review. |
| INELIGIBLE / MISSING_VALUE | Retains the source's eligibility or absent value. |
| EXPLAINED_EXCLUSION | Exact original row is excluded with its saved explanation. |
| DUPLICATE_LINE_SELECTION | Two lines selected the same occurrence; both expose it for correction. |
| NO_LINE_SELECTION | Complete in-scope original row remains outside the configured lines. |

The original exact programme arithmetic kernel aligns decimal coefficients and
exponents, checks its supported 8,192-digit span and traps inexact arithmetic. It
receives the full original financial Decimal values; it does not shorten their
source text. An unsupported exact span fails before the portfolio transaction commits.

Supplied control totals bind the generated group identity, original control amount and
documented basis. The displayed variance is the exact included amount minus that
control. An unmatched control remains in the report. Missing included rows produce
an unavailable amount rather than a fabricated zero.

## Results

Choose **Observations fully contained in this report period** or **Cumulative through
report period end** for the selected original indicators. Full observation records,
dimensions, units, evidence and record references remain in the statement.

Contained-period reporting includes only complete observation periods inside the report
boundaries. It exposes partial overlaps without proportionally distributing a result.
Cumulative reporting includes original observations ending on or before the report end.
Withdrawn and archived observations remain visible and contribute no current value.

The maintained result engine keeps each indicator and dimension group independent. Its
original aggregation policy controls sum, latest or separate observations. Missing
values, overlapping summed periods and ambiguous latest periods remain explicit.
The original dated baseline and target are shown as of the report end. Their dates and
values remain in the complete statement; a dated-target comparison does not redefine
a cumulative target as a period-specific target.

## Submission, history and corrections

The existing submitted-report publication now contains its complete donor statement,
selection, source rows, observation rows, agreement and indicator records, document
references, control totals and explanation. It retains the original publication
operation, portfolio revision and programme revision.

A following portfolio edit, source refresh, observation correction, agreement revision
or archival operation cannot rewrite that publication. Historical report reads return
the selected original publication. Acknowledgment changes only the existing report
state. Its content and statement remain exact.

To correct a report, add a following draft in the same project/grant scope, select the
earlier submitted report and explain the correction. The new statement retains the
earlier report reference, publication SHA256 and donor-statement SHA256 where present.
The correction chain rejects loops. Old cumulative reports can remain in history; a
following report can introduce an explicit donor selection.

The original complete portfolio export carries all history, original source editions,
every referenced uploaded document and reconstructed tables. The statement is part of
the report body rather than a separate mutable store. Receivers use the existing full
portfolio receiving operation.

## Complete readable exports

The donor statement screen downloads:

- A complete editable JSON statement envelope with original portfolio/report selection.
- A standalone printable HTML report with all line groups, original rows, observations,
  agreement/result records, review notes and the complete JSON representation.

Neither export truncates source records or reduces them to a preview. Large selected
statements remain subject to the existing 16 MiB complete programme model limit and
the original 1 MiB action input limit. The regular operating views and whole portfolio
handoff remain available for larger supporting source documents.

## Typed customer client

The original client gains the read method:

~~~js
const report = await client.programmeDonorReport({
  portfolioId: savedPortfolioId,
  revision: savedPortfolioRevision,
  id: savedReportId,
});
~~~

Use the helpers in donor-reporting-client.mjs with the retained original operation ID:

~~~js
import {
  donorSelection, donorFinancialLine, saveDonorReport, readDonorReport,
} from './donor-reporting-client.mjs';

const selection = donorSelection({
  agreementId: approvedAgreementRecordId,
  indicatorIds: selectedIndicatorRecordIds,
  resultMode: 'period-contained',
  lines: [
    donorFinancialLine({
      id: retainedLineId,
      title: selectedLineTitle,
      sourceIds: selectedOriginalSourceIds,
      kind: originalFinancialKind,
      currency: originalCurrency,
      dimensions: originalDimensionFilters,
      dateMode: 'point',
      datePointer: selectedOriginalDatePointer,
      basis: documentedFinancialAndDateBasis,
    }),
  ],
});

const request = await saveDonorReport(client, retainedOperationId,
  {portfolioId: savedPortfolioId, revision: savedPortfolioRevision},
  {actor: actualEditor, record: originalDraftReport,
   fields: {donorSelection: selection}});
const complete = request.state === 'COMPLETED'
  ? request : await client.wait(retainedOperationId);
const current = await readDonorReport(client, {
  portfolioId: complete.result.id,
  revision: complete.result.revision,
  id: originalDraftReport.id,
});
~~~

All IDs and source values above come from the caller's selected original case. The helper
retains the complete current name, notes, sources and review when invoking the existing
programme save. It checks the selected original report's revision and SHA256.

correctionReport(original, {reason, id}) prepares a full following draft using the
same scope and original selection. It clears submitted state and links the original
report. Retain its new record ID and the complete operation input before sending it.

## Native read and export

The standalone read/export command uses the same Python runtime and saved workspace
as the original console:

~~~sh
python3 donor_reporting_cli.py \
  --workspace /absolute/original/grant-workspace \
  --portfolio ORIGINAL-PORTFOLIO-UUID \
  --revision ORIGINAL-REVISION \
  --report ORIGINAL-REPORT-UUID \
  --out /absolute/report-exports
~~~

It reads the exact selected revision, verifies a frozen statement's digest, and saves
the complete JSON and printable HTML. Exact existing output is reusable. A conflicting
destination is preserved. Start it when the original workspace is available for its
normal owner; an already running console also exposes the same revision-pinned read
through its existing authenticated local API.

## Source integration

New source leaves:

- donor_reporting.py: selection normalization, scope validation, period reconciliation,
  exact grouped totals, results, immutable statement and original saved read.
- donor_reporting_cli.py: complete native readable export.
- donor-reporting-client.mjs and donor-reporting-client.d.mts: customer helpers/types.
- web/donor-reporting.js: complete existing-editor selection and statement screen.
- DONOR_REPORTING.md: this guide.

Original composed leaves are programme.py, programme_service.py, programme-client.d.mts,
web/programme.js, server.py, web/index.html, client.mjs, client.d.mts and source-files.json.
The donor script loads before the programme script. The original /api/programme/
dispatcher retains its existing authentication, revision selection and response flow.
All new source leaves belong in the maintained complete source manifest. Concurrent
governance, staff, awards, financial capture, deployment and source-exchange work remains
in the same cumulative application.

## Receiving the selected case

Use the existing full SPC programme/customer operation and exact original workspace.
Retain its complete earlier export before the following selected donor journey.
Configure a draft from actual selected source rows and agreement records; inspect every
row's date and financial meaning; supply any original control totals; save and submit.
Record the frozen statement SHA256. Correct a source/observation through its original
operation, reopen the earlier report, and confirm its complete frozen statement is
unchanged. Prepare the following linked report, export the complete portfolio, receive
it through the original independent receiving workspace, and reopen both report editions.

The same journey should open the donor editor and full statement at desktop and phone
width, download both complete exports, and compare each downloaded JSON against the
selected API envelope. Reuse the original programme's browser ownership, retained
operation IDs, archive writer and console shutdown.
