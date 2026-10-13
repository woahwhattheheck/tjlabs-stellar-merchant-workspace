# Business Central financial editions in the grant portfolio

Business Central financial editions use the original grant portfolio source, review,
programme, history and complete receiving operations. A source edition selects one
complete PMRS finance handover ZIP and one full original reconciliation SHA-256.
The original finance receiver restores that handover and the original reconciliation
engine recomputes its complete summary and ordered row object before projection.

## Operator workflow

1. In the PMRS finance service, capture the selected company and project scope, review
   its grant allocation, reconcile the selected reporting period and export the complete
   workspace handover. Copy the full saved reconciliation ID.
2. In the portfolio's **Source editions** page choose **Business Central**. Select the
   complete handover ZIP, paste the reconciliation ID and retain the actual company API
   URL, observation time, edition coverage and source access terms.
3. Save a portfolio containing this source. Bind project activity records to the
   corresponding programme projects. Bind the project-specific grant records to the
   corresponding local grants. Review the complete financial rows and findings before
   using that edition for reporting.
4. Inspect the financial ledger or the project/grant position. The source card shows
   the original reporting period, company, original row count and findings. The source
   **Source details** view shows every project/grant/currency group as a readable
   table, with budget cost, billable amount, usage cost, sales and the original
   difference measures. Complete, incomplete and no-row measures remain distinct;
   a partial subtotal is labeled explicitly. Findings and groups have independent
   50-row pages, so the full edition stays available. Open a finding's detail for
   its exact affected record and source context. The complete original summary and
   source download remain available below the review.
5. For a refreshed capture or changed allocation, receive the following complete edition,
   then use the existing source replacement workflow. Source-bound reviews and programme
   bindings become stale when their selected original record changes; review the new
   exact edition before republishing a report.
6. Export the complete portfolio. Its source manifest includes this adapter and the
   pinned native finance package. Receiving rebuilds every source, saved review,
   programme revision and financial table from the original ZIP and compares its bytes
   and saved snapshot.

## Financial meaning and drill-through

Each original planning or ledger occurrence yields a separate projected row for each
native metric and currency basis. The row key combines company API scope, native
family and GUID, metric and basis. A planning line may contribute both budget cost
and billable amount. Local and project currencies are alternate financial views and
remain separate groups even when their currency codes happen to match.

Exact decimal strings, native signs, presentation multipliers, native fields,
project/grant scope and inclusive reporting period are retained. The original
reconciliation row includes its posted dimensions, task, source page SHA-256, part,
page index, row index and source URL. The projected original also records the
reconciliation row index and selected value index; the complete native row object
and original raw pages remain in the original handover.

One projected financial occurrence belongs primarily to its captured project and
may also reference its project-specific grant through `relatedEntityKeys`.
Programme positions index both references and deduplicate by `sourceId,rowKey`.
The entity detail and financial table filter use an EXISTS predicate, preserving
complete pagination without duplicating a row when both references are selected.

Excluded, text, unallocated and outside-period records remain visible as ineligible
`source-disposition` records with a null amount. A native early-return exclusion
whose project is absent remains attached to the captured company, retaining its
original project number. An incomplete selected amount keeps its original metric
and is excluded from the included subtotal. The source's full native summary carries
COMPLETE, INCOMPLETE and NO_ROWS states, all findings and original partial totals.
Every financial group also exposes its original nativeStatus and the complete reconciliationReady flag in its dimensions. An included subtotal does not replace that completeness assessment.

Company identity comprises the exact standard API URL, project API URL and company
GUID. These retain the original tenant/environment/company scope. Display aliases
do not determine accounting identity. Allocation assigns each selected row to exactly one reviewed rule; ambiguous and unallocated rows retain their original findings. Source refresh captures the complete selected scope and its observed page interval, including later backdated entries in the following edition. Each mapped grant identity also includes its
project GUID, preventing a shared grant label/key from joining unrelated projects.

## Application and agent contract

```json
{
  "action": "source.receive",
  "operationId": "original-retained-operation",
  "payload": {
    "object": "<complete ZIP SHA-256>",
    "standard": "businesscentral",
    "label": "Selected company and financial period",
    "selection": {"reconciliationId": "<original reconciliation SHA-256>"},
    "coverage": {
      "statement": "<actual project scope and source coverage>",
      "sourceUrl": "<original company API URL>",
      "observedAt": "<original observation time with timezone>",
      "license": "<actual source access terms>"
    }
  }
}
```

The typed client and merchant tool schema require `reconciliationId` for this
standard. The source list returned by `/api/state` includes a bounded
`financialSummary` for Business Central: reconciliation ID, company, reporting
period, readiness, original/projected/included row counts, total and blocking
findings, and the currency bases actually present. Source cards use that summary.
`/api/source` retains the complete native reconciliation, findings and partial
totals; the compact list does not repeat the original pages or accounting records.
Existing source, table, detail, programme and export calls remain the application API. The original finance service continues to own capture, mapping,
reconciliation and Dataverse delivery; the portfolio receives the resulting edition.

The adapter imports the pinned original `pmrs` package only inside the existing
isolated native projection worker. Original finance source bodies are preserved
unchanged from source packet Git blob
`cd9b18f5b16eb0dd8ac659c8b55d27db27720a27`
in `woahwhattheheck/public-commons-sprint-2026`, maintained as
`services/project-grant-finance/workspace/pmrs/`.
The provenance manifest lists exact Git blob identities for all 15 included files.
Refresh this pinned cohort together when the maintained engine changes.

## Complete receiving programme

Run the original finance service's full native receiving operation first. Use its
actual complete exported finance ZIP and selected reconciliation ID below. The
coverage JSON must describe that archive's actual source.

```sh
python grant-portfolio/receive_businesscentral.py \
  --archive /absolute/path/to/complete-finance-handover.zip \
  --reconciliation FULL_RECONCILIATION_SHA256 \
  --coverage /absolute/path/to/source-coverage.json \
  --directory /absolute/private/receiving-directory \
  --actor "Receiving operator"
```

The programme retains one immutable selection and uses the same saved action
identities on resumption. It receives the full native edition; builds the project,
grant and aggregation records from all captured projects and mapped grants; checks
complete project/grant detail and pagination; compares every native measure/basis
subtotal and completeness count; saves an attributed review revision; exports all
source and data; and receives the complete handover into a second original workspace.
It compares the restored snapshot, table identities and every financial occurrence.

Outputs are `result.json` and `PMRS_Business_Central_Complete.zip`.
The result reports the actual project/grant counts and original archive identity.
The underlying archive determines whether the data came from a tenant capture or
the original local protocol receiving fixture.

## Issued application joins

The SPC RFQ26-10663 Task 4 interface work selects the original project/task,
budget/expenditure/status data and explicit system-of-record rules. Task 6 requires
the joined programme to support at least three selected CCS projects and one
Flagship aggregation, source correction/refresh, finance review and export/reopen.
Configure those real project and programme bindings in the cumulative PMRS app.
The receiving programme reports its actual captured project count; it does not
invent additional native projects.

The financial source reference exposes sourceId, entityKey, company identity,
complete edition, original record/row reference, currency, measure and reporting
period. The local programme continues to own portfolio, programme, project, parent
grant, grant, subgrant and grantee identities and their reviewed source bindings.
