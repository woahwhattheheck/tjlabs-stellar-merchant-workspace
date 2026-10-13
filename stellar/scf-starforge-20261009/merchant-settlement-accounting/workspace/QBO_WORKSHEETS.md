# Buyer QuickBooks allocation worksheets

Use the worksheet panel in the existing **QuickBooks journal handoff** page when a buyer period has many allocation decisions, values or account mappings to enter. It exports every allocation and the current draft to CSV, compares a returned file with that exported draft and the current draft, and saves explicitly reviewed choices back into the same browser record.

The native buyer and QuickBooks engines still validate the original source, exact home-currency amounts, eligible company accounts, journal direction, source reservations and accountant return. A worksheet does not post a journal or replace the native journal review.

## Complete browser workflow

1. Open the existing accounting workspace and `/qbo.html`. Enter the original operator and open that operator’s saved browser record.
2. Select the original buyer accountant handoff. Load the QuickBooks CompanyInfo, Preferences and Account chart through the existing company controls. The company name, realm and currency fields must agree with that loaded chart.
3. Expand **Edit buyer allocations in a worksheet**. Select **Export current draft to CSV**. The complete exported base is saved before the browser downloads the CSV. Also select **Download worksheet record** and keep that JSON beside the CSV. **Download account reference CSV** supplies the exact IDs, names, types, currency and eligibility reasons from this retained company chart for offline mapping.
4. Open the CSV as UTF-8, retaining text columns as text. Edit only the permitted cells described below. Keep all allocations, including Pending or Exclude rows, and the one JOURNAL row. Save a UTF-8 CSV.
5. Choose the same **Retained worksheet base**, select the edited CSV, and select **Inspect against current draft**. The original file bytes are saved in the operator record before inspection.
6. Read the changed fields. Later local edits are preserved when the returned file did not change that field. Where both versions changed it differently, choose **Keep current** or **Use returned** for each conflict and inspect again.
7. Select **Adopt reviewed values into draft**. The page recomputes the inspection against the current source and draft. It commits the complete replacement through the original IndexedDB version check and workspace pending marker before changing the visible mapping table.
8. Review the resulting allocation table and use the existing **Preview journal plan**, **Retain this journal plan** and review controls. A Pending allocation or unfinished valuation can be retained as a draft, but the native plan cannot proceed until every required decision and value is complete.

Older exports remain selectable. To continue on another browser, explicitly open the original worksheet JSON through **Open an earlier worksheet record**, then choose the returned CSV. Its handoff, accountant parent, company chart, environment and accounting workspace must still match.

An accountant return, another handoff edition or a changed company chart requires a new worksheet base from the current selected source. The old file remains available for examination. It is not silently rebound.

## CSV contract

The CSV contains one JOURNAL row followed by every original allocation. Row and column order can change, but each original row and column must occur exactly once.

| Cells | Editing rule |
| --- | --- |
| JOURNAL `valuationBasis` | Common source of the home-currency values, valuation date and tax treatment; up to 2,000 characters. |
| Allocation `decision` | Exactly `pending`, `include` or `exclude`. |
| Allocation `amount` | Exact positive home-currency decimal text for an included allocation, up to two decimal places. The original compiler supports up to 999999999.99 per line. |
| `debitAccountId`, `creditAccountId` | IDs from the retained company chart. Included lines need distinct eligible accounts. Direction remains explicit for expenses and credits. |
| `valuationNote` | Explanation of the individual included allocation’s value; up to 2,000 characters. |
| `reason` | Explanation for an excluded allocation; up to 2,000 characters. |
| `description` | Journal description. The draft preserves up to 2,000 characters; the native journal requires at most 1,000. |
| Every other cell | Protected original source or binding. Keep its exact value. Allocation `valuationBasis` cells stay blank; edit the one JOURNAL basis. |

The original source columns include the native asset and amount, expense/credit kind, recognition date, network, source-line and economic identities, cost center, project, source account code and current bookkeeping status. Native units are kept as strings and are never converted into home-currency values.

The exporter quotes CSV cells and uses the original accountant CSV convention to protect formula-like or long numeric text with a leading apostrophe. Do not remove significant digits or reinterpret source cells as dates, floating-point numbers or formulas. The importer removes only that established protective prefix and checks the original source text exactly. Quoted commas, Unicode and embedded line breaks remain supported. A UTF-8 byte-order marker remains part of the retained file and checksum; it is ignored only while interpreting the CSV header.

CSV files are limited to 16 MiB. The complete JSON request, including the exported base, edited CSV, current draft and company sources, must fit the existing 32 MiB request limit. Browser drafts, all retained worksheets and original command history remain subject to the existing 64 MiB draft limit. A size or storage error does not authorize partial import. Keep the file and download the saved record.

## Three-way review and recovery

Each editable field is compared independently.

| Returned file versus exported base | Current draft versus exported base | Result |
| --- | --- | --- |
| Unchanged | Any value | Keep the current draft, including later local edits. |
| Changed | Unchanged | Propose the returned value. |
| Changed | Same as returned | Keep the common value. |
| Changed | Changed differently | Require an explicit choice of current or returned. |

A conflict ID binds the worksheet digest, allocation, field and all three values. Choices from an older conflict set are rejected. No source-valid row can be partly adopted when another row is missing, duplicated or changed.

`readyToAdopt` means source coverage is valid and every conflict has a choice. `readyForPlan` also reports complete draft decisions, values and native buyer-source eligibility. These fields are distinct so an unfinished worksheet can remain a visible editable draft. The original native compiler remains the final authority for a journal preview.

The browser retains the exported record and original CSV, complete returned CSV text and hash, choices, sealed inspection and each accepted draft-adoption digest. Download the complete import review for a portable record. This is part of the browser’s existing operator context, not a separate native accounting ledger.

The original accounting workspace backup retains saved plans, their full mappings and their source packets. Browser IndexedDB drafts are exported separately using the existing browser recovery download. Keep the worksheet record, edited file and review with those draft exports before moving to another browser.

Reload never changes a pending financial request. Worksheet adoption refuses an actual pending marker owned by any tab or operator. A concurrent update to the same operator record fails its version check and preserves the other saved record. Use the existing recovery controls to reconcile it.

## Native SDK

Import the module from the maintained accounting component:

```js
import {
  createQboWorksheet, openQboWorksheet, inspectQboWorksheet,
  qboWorksheetSelections
} from './accountant/qbo-worksheet.mjs';

const context = {
  handoff,                         // original validated buyer handoff
  revision: accountantReturn,      // exact current original return, or null
  workspaceBinding: {workspaceId, sourcesSha256},
  companySnapshot,                 // original normalizeQboCompany result
  environment: 'sandbox'
};

const exported = createQboWorksheet({
  ...context,
  id: originalWorksheetId,
  createdAt: originalCreationTime,
  draft: completeDraft
});
// Preserve exported.worksheet and exported.csvText before editing.

const preview = inspectQboWorksheet({
  ...context,
  worksheet: exported.worksheet,
  csvBytes: editedCsvBytes,
  currentDraft: completeCurrentDraft,
  resolutions: []                  // then exact {id, choice} conflict decisions
});

if (preview.readyToAdopt) {
  const choices = qboWorksheetSelections(preview.candidate);
  // Pass choices to the original createQboPlan with explicit journal metadata,
  // the same handoff, accountant parent, company snapshot and environment.
}
```

A draft has `{valuationBasis, rows}`. Every row has exactly:

```json
{
  "rowId": "original-64-character-allocation-id",
  "decision": "pending",
  "amount": "",
  "debitAccountId": "",
  "creditAccountId": "",
  "valuationNote": "",
  "reason": "",
  "description": ""
}
```

The real draft must retain all actual allocation IDs exactly once. The placeholder above is documentation and is not an executable source identity.

The exported worksheet binds its UUID, creation time, original base, complete source-row digest, handoff and parent hashes, original accounting binding, company-chart hash and environment. Its checksum detects changes; it is not an authentication signature or an independent accountant approval.

## Existing workspace API

The unchanged listener mounts the read-only workflow under `/api/qbo/worksheets`.

| Method and route | Input or result |
| --- | --- |
| GET `/api/qbo/worksheets` | Original QBO state, handoffs, plans, binding and workspace revision in the worksheet response envelope. |
| POST `/export` | `{binding,handoffId,expectedParentId,companySnapshot,environment,id,createdAt,draft}`. |
| POST `/open` | `{binding,worksheet,companySnapshot,environment}`; validates the original record and reproduces its original CSV. |
| POST `/inspect` | `{binding,worksheet,companySnapshot,environment,csvText,currentDraft,resolutions}`. |
| POST `/plan-input` | The same inspection input, plus `previewSha256` and `plan` metadata. |

All POST route suffixes above belong to the same `/api/qbo/worksheets` prefix. `binding` is the exact current `{workspaceId,sourcesSha256}` from GET `/api/qbo`. The original loopback, origin, request-size, maintenance and expected-binding headers still apply.

Each response has `schema: "stellar-forge.qbo-worksheet-response.v1"`, the original binding and workspace revision. Export/open add `worksheet,csvText,csvSha256,csvBytes,accountReference`. The separate account reference binds the same worksheet and company chart; it is read-only guidance and must not be imported as an allocation return. Inspect adds the full sealed `preview`.

For `plan-input`, `previewSha256` is the **worksheet inspection** integrity SHA. `plan` contains only the journal’s original `id,name,actor,createdAt,txnDate` and optional `docNumber`. The native method re-inspects the exact file and draft, compares that inspection pin and calls the existing `preparePlan`. It returns the original native `request`, `plan`, native `previewSha256` and `worksheetPreviewSha256`. It does not retain or post the journal.

The returned `request` includes the original revision and native preview pin and can be sent through the existing `POST /api/qbo/plans`. Preserve its ID and exact bytes through any uncertain result, using the existing journal recovery workflow.

## Command line

The installed command uses the original workspace dispatcher. It also works directly from source:

```sh
starforge merchant-accounting-workspace qbo-worksheet --help
node workspace/qbo-worksheet-cli.mjs --help
```

For a running original listener:

```sh
starforge merchant-accounting-workspace qbo-worksheet status --url http://127.0.0.1:8446
starforge merchant-accounting-workspace qbo-worksheet export --url http://127.0.0.1:8446 --input /private/export-request.json --out /private/worksheet.json --csv-out /private/allocations.csv --accounts-out /private/account-reference.csv
starforge merchant-accounting-workspace qbo-worksheet inspect --url http://127.0.0.1:8446 --input /private/inspect-request.json --csv-in /private/edited.csv --out /private/inspection.json
starforge merchant-accounting-workspace qbo-worksheet plan-input --url http://127.0.0.1:8446 --input /private/reviewed-request.json --csv-in /private/edited.csv --out /private/native-create-input.json
```

Replace `--url` with `--workspace /private/original-accounting` when the listener is stopped. The CLI opens its existing Store lease and performs no recovery, provider startup or financial dispatch. It always closes that lease.

JSON input uses the same API schemas. `--csv-in` supplies the exact UTF-8 file as `csvText`; do not also put `csvText` in the JSON. When `--csv-out` is used, the JSON result retains the complete worksheet and CSV descriptor instead of duplicating CSV text. `--accounts-out` similarly saves the separate original-chart reference and retains its descriptor. `plan-input --out` writes the actual original native create-plan request, not a wrapper that must be rewritten.

Outputs are created privately without replacement. An identical file can be reused; a different file that appears during publication is preserved and the command fails. Retry the same read-only input after an output error. Select a new output name for a deliberately changed worksheet or inspection. Never reuse another journal’s request UUID.

## Source and receiving

The implementation reuses `accountant/engine.mjs` for CSV parsing, `qbo-buyer.mjs` for original allocation and production-source rules, `qbo-company.mjs` for rebuilding chart eligibility, and `qbo.mjs` for the native journal. It adds no provider or accounting database.

`workspace/examples/qbo-worksheet-receiving.mjs` runs a finite fictional CSV/source/merge/native-plan/return workflow in an isolated output directory. It preserves its input and result files and does not call a provider or the original E42D financial operation. A source or native receiving result does not claim browser execution.
