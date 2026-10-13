# Programme delivery

The programme application adds operational project, grant, results and evidence records
to the existing Grant Portfolio workspace. It uses the same saved actions, SQLite
transaction, immutable portfolio revisions, original source editions and complete handoff.

Open the existing console described in [OPERATIONS.md](OPERATIONS.md), then select
**Programme delivery**. The programme can begin before an external donor or finance
source is received. Select **Start a programme**, enter its name, code, owner and
reporting date, and save it. The normal **Portfolios** page can subsequently add complete
source editions and update the review scope.

## Working through a programme

The workspace selector opens each complete register. Programme/project and grant
selectors apply the same scope to its records and reporting position. Search operates
within that register; **All records, including archived** exposes preserved records.
The portfolio revision selector opens earlier editions of the same programme.

| Register | Work supported |
| --- | --- |
| Programmes and projects | Hierarchy, accountable owner, division, countries, dates, conditional data management requirement, corporate registration and its evidence. |
| Partners and applicants | Shared organizations, original identifiers, roles, contact information and selected diligence documents. |
| Grants and subgrants | Project, parent grant, recipient and applicants, original award amount/currency, agreement, amendments, diligence, purpose and dates. |
| Workplan and milestones | Owner, dependency graph, planned/start/due/completion dates, status, decimal progress and supporting documents. |
| Results framework | Input/output/outcome/impact chains, unit, aggregation method, direction, dated and dimensioned baselines/targets, methodology and evidence. |
| Reported results | Original decimal value or an explicit missing value, reporting period, date reported, dimensions, collector, evidence and correction history. |
| Risk register | Owner, category, likelihood/impact, paired residual values, mitigation, review date, state and evidence. |
| Issues and actions | Severity, owner, due date, action, resolution and supporting documents. |
| Documents and evidence | Structured content, HTTPS source or complete uploaded bytes, category, owner, source edition/date and the earlier document edition. |
| Donor reports | Reporting period, due/submission dates, recipient, narrative, evidence and an immutable position recorded at submission. |
| Closure and lessons | Closure date, documents, lessons, remaining in-scope actions and an immutable position recorded at closure. |

To add a project beneath a programme, choose **Programmes and projects**, select
**Add record**, choose the project kind and its parent. Add shared partners before
selecting them as recipients/applicants on a grant. A subgrant must select the same
project as its parent grant.

Each record is created with one UUID and advances its own revision when edited. Edits
also advance the original portfolio revision. The editor reads both expected revisions.
An intervening edit causes a conflict before a new portfolio is committed. A browser
request interrupted after admission can be continued through the original
**Retry original operation** or **Saved operations** entry.

### Workplan and delivery state

Use milestone dependencies to express work within the selected project. A completed
milestone needs a completion date and progress of exactly 100; other states retain no
completion date. The dated programme position lists overdue milestones, open/overdue
actions, high risks and overdue draft reports.

Likelihood and impact use the selected risk scale. Record both residual likelihood and
residual impact together. **Reporting settings** changes the as-of date, maximum
likelihood/impact and high-risk threshold in a new saved programme revision.

Archiving retains the record and its earlier editions. It removes operational records
from the ordinary active register and active work counts. Current original financial
source bindings on an archived project/grant remain in that scope's financial position.
Changing which external source editions are selected remains an explicit portfolio edit.

### Results and their reporting periods

Baselines and targets are dated decimal points, each with dimensions and evidence.
Enter one row for each intended combination. Observation dimensions are named values,
such as location, sex or cohort; their original names and values are preserved.

An observation belongs to one indicator, period and dimension combination. Correct the
original observation by editing it. A second active observation with that same
indicator/period/dimensions is rejected. Withdrawal preserves the original row and its
history while removing its value from current aggregation.

The selected aggregation method determines the displayed position:

| Method/state | Result |
| --- | --- |
| Sum | Adds original decimal values only when the included reporting periods do not overlap. |
| Latest | Selects the latest period end; multiple observations sharing that latest end within the same dimensions remain explicitly ambiguous. |
| None | Retains separate observations without calculating an overall actual. |
| Missing values | Retains the selected observations and marks the actual unavailable. |
| Overlapping periods | Preserves every observation and marks the total unavailable until the intended records are corrected. |
| Archived indicator | Preserves its calculated rows and marks the indicator archived. |

The as-of date selects observations ending on or before it and the latest applicable
baseline and target. No aggregation across different indicators, units, currencies or
dimension groups is implied. The result retains each contributing observation's ID,
record revision and hash. Original decimal strings survive input, history and export.

Result arithmetic aligns the original coefficients and exponents, budgets sufficient
precision for every possible intermediate carry, and traps any decimal signal. The
supported exact aligned span is 8,192 digits including carry, across up to 100,000
operands; original strings are limited to 128 characters with original and adjusted
exponents from -999999 to 999999. An unsupported span fails before the portfolio
transaction commits. This calculation is separate from the existing source-financial
engine. The native decimal receiving check covers catastrophic cancellation, exact
variance, the dated projection, original input preservation and the unchanged caller
context.

### Documents and project scope

A document can contain structured working content, link to an original HTTPS source,
carry an uploaded file, or combine these. Uploads stream into the existing private
content-addressed object store. The descriptor records the exact bytes, SHA-256,
download name and media type. A later document edition can identify its predecessor.

Evidence on a project or grant may select a shared document on that node or an ancestor.
Grant-specific evidence must select that grant or an ancestor grant; an unrelated
project/grant agreement cannot be attached. Partner diligence is shared at portfolio
level and can span the projects in which the partner participates. Closure actions must
belong to the closure's selected project/grant scope.

The complete handoff includes every uploaded document referenced anywhere in programme
history, including replaced and archived editions. Historical record views resolve their
links and downloads against the selected original portfolio revision.

Documents up to 64 MiB use the browser's ordinary download flow. Larger documents
stream directly to disk in browsers with direct file saving; the typed client also
streams downloads. Descriptor mismatches cancel the stream, and interrupted direct
saves abort the unfinished file.

### Project QA

Select a project and choose **Open project QA pack**. The pack contains the selected
project, dated position, original record references and checklist:

| Issued step | Evidence category |
| --- | --- |
| P1.02 | Alignment evidence |
| P1.03 | Validation meeting minutes |
| P1.04 | Needs assessment and stakeholder map |
| P1.04b | Lessons from prior work |
| P1.05 | Theory of change |
| P1.06 | Concept note |
| P1.07a | MEL/results plan |
| P1.07b | Data management plan when the recorded donor/policy selection requires it |
| P1.08 | Risk/SER plan and communications plan |
| P1.09 | Multiannual workplan and budget |
| P1.10 | Donor due diligence |

The pack carries the original project reference and programme/portfolio revision.
Evidence readiness is separate from the joined staff application's accountable
clearance and approval records. MEL, Finance and SER are carried as the required
clearance-role context. Corporate registration carries the selected manual/API method,
reference and evidence. An unset data-management requirement remains visible for the
actual policy selection.

The current checklist is the programme's issued project-cycle profile. Deployments with
a different approved process should compose their own explicit profile in the same
source, retaining its source-step mapping.

### Submitted reports and closure

A submitted report needs its original submission date. Submission freezes the position
through the report period end, financial row references, exact contributor record
editions and supporting source references. Contributor traversal includes the selected
grants and partners, indicators and contributing observations, explicit evidence, dated
baseline/target evidence, predecessor documents and referenced parent/dependency records.

Later corrections to the programme do not rewrite that published position.
Acknowledgment is recorded on the original submitted report; an acknowledged report
stays acknowledged. Create a following report for changed content. A recorded closure
likewise retains its position and contents.

The report's financial basis is the complete selected source position with each source
row's original dates and dimensions. It is not an automatic claim that every selected
financial row occurred inside the report period. Its results basis is cumulative
through the dated position, with original observation periods retained. Reporting
integrations can select a more specific financial period from those original rows.

## Complete source intake and financial meaning

Receive external IATI and 360Giving editions through **Source editions**, using their
complete original native handoff ZIPs and actual capture/coverage fields. Then select
those source IDs on the original portfolio. A raw IATI XML file is input to its native
IATI workspace, not a replacement for its complete exported portfolio packet.

On a project or grant, **Original source records** opens a revision-pinned search and
retains the selected source ID, entity key and exact entity hash. A following source
edition does not silently replace those references. Bindings show CURRENT, CHANGED or
OUTSIDE_SELECTION until the selected originals are explicitly reviewed.

The financial position collects the current bindings on its project/grant hierarchy,
deduplicates the same original source row, and uses the existing financial aggregation
engine. Currency, source, financial meaning, dates and original dimensions remain
separate. Award declarations on the local grant register are displayed as original
amount/currency pairs; they are not invented receipts in the imported financial ledger.

## Typed client

All programme writes use the existing `portfolio.save` action. The module
[programme-client.mjs](programme-client.mjs) supplies builders for complete changes.
The declarations in [programme-client.d.mts](programme-client.d.mts) cover every register.

The following example assumes an existing console, selected current portfolio and
previously retained operation/record IDs. Persist the complete input with those IDs
before invoking it, as with the original client's other operations.

~~~js
import {connectGrantPortfolio} from './client.mjs';
import {
  newProgrammeRecord, programmeBatch, saveGrantProgramme,
} from './programme-client.mjs';

const client = await connectGrantPortfolio({
  consoleUrlFile: '/absolute/private/grant-review/console.json',
});
try {
  const selected = {portfolioId: savedPortfolioId, revision: savedPortfolioRevision};
  const portfolio = await client.portfolio(selected.portfolioId, {
    revision: selected.revision,
  });
  const programme = programmeBatch(
    'Delivery owner',
    portfolio.definition.programme.revision,
    [newProgrammeRecord('milestones', {
      nodeId: savedProjectId,
      code: 'M-DELIVERY',
      title: 'Receive the complete approved application',
      owner: 'Delivery owner',
      dueDate: approvedDeliveryDate,
      status: 'in-progress',
      progress: '40',
      documentIds: savedEvidenceIds,
    }, savedMilestoneId)],
  );
  const admitted = await saveGrantProgramme(
    client, savedOperationId, selected, programme,
  );
  const completed = admitted.state === 'COMPLETED'
    ? admitted
    : await client.wait(savedOperationId);
  const following = completed.result;
  const position = await client.programmePosition({
    portfolioId: following.id,
    revision: following.revision,
    nodeId: savedProjectId,
  });
  // Retain the returned position with the original operation result.
} finally {
  await client.dispose();
}
~~~

A new local programme can use `createGrantProgramme` with no source editions and a
change set whose expected programme revision is zero. An existing portfolio with no
programme uses `saveGrantProgramme` at its selected original revision. Both follow the
same writer and original request admission.

| Client method | Selection/result |
| --- | --- |
| programmeSchema | Complete machine-readable field, table, settings and edit contract. |
| programmeRecord | Exact portfolio revision, collection and record ID. |
| programmeHistory | Every changed edition of that record through the selected portfolio revision. |
| programmePosition | Selected project/programme and optional grant scope. |
| programmeQa | Complete project QA pack at the selected revision. |
| uploadProgrammeDocument | Complete body, byte length and optional expected SHA-256. |
| openProgrammeDocument | Original document descriptor and checked response stream. |
| rows / pages | The original revision-pinned reader for all fourteen programme tables. |
| createExport / downloadExport | Original complete portfolio handoff. |
| receivePortfolio | Original checked receiving and reconstruction operation. |

To save a downloaded document to an exact file, pass the response from
`openProgrammeDocument` to the original `saveGrantPortfolioFile` helper. It verifies
complete bytes/hash and retains/reuses the same destination. Receiving on another
workspace uses its own original `portfolio.receive` operation; every source,
document, request, revision and derived table is reconstructed before commit.

## Source composition and receiving

The programme adds:

- `programme.py`: normalization, relations, original source bindings, exact dated
  results, scoped positions, QA and immutable publication.
- `programme_service.py`: original revision-pinned reads and document selection.
- `programme-client.mjs` and declarations: saved change helpers and typed reads.
- `web/programme.js` and `web/programme.css`: the complete register console.
- This guide, plus the joined original native receiving programme.

The source composition contains small anchored joins in the original Workspace,
Console, client, navigation and source list. The existing Workspace prepares the
programme before its single transaction, stores the new definition/tables/hashes and
commits the original operation result together. Earlier portfolio revisions derive only
their original tables. Export and receiving iterate each revision's actual table list.

The complete source authority is `source-files.json`. Include every new leaf and union
any concurrently composed staff, finance or deployment leaves before Applications
admission or native export. The receiving procedure in
`examples/spc/programme-receiving.mjs` exercises one complete operating journey through
the original APIs, document transfer, correction, submission, archive, export, receiving,
reopening and historical comparison.

The joined staff application owns identity, roles, approval decisions and corporate
integration deployment. Its source composer adds those actions to the existing
dispatcher while this programme continues to use the original portfolio save.
Tenant credentials, actual selected pilot projects, production endpoints and external
source capture records are deployment inputs supplied by their source owners.

## Supported limits

The existing action admission accepts at most 1 MiB of complete JSON input. A programme
change batch can contain up to 2,000 changes/settings/archive entries; the complete
programme retains up to 100,000 records and 16 MiB of canonical model data. There are
at most 64 selected external source editions. Files use the original 4 GiB complete
packet limit. These are explicit interface limits; split larger authorized work into
successive original saved operations while retaining the expected revisions.

The programme reuses indexed source bindings, result calculations and financial
lookups within a derivation. The browser pages registers in sets of 50 and searches
reference choices in sets of 80. Historical editions remain available through the
same saved portfolio rather than a second mutable database.
