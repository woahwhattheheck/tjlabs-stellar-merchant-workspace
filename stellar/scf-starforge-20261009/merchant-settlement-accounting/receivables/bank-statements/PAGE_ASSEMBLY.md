# Complete CAMT statement pages

The Bank statements workspace can review a complete CAMT.053 statement received as separate XML files or as several statement sections inside one XML file. It retains each imported file and selected statement section, reads their complete saved reports, and connects the original first opening balance to the original final closing balance. The resulting review supplies the existing reconciliation writer.

## Operator workflow

1. Open **Bank statements → Import** and receive every original page using its existing source review. For several statement sections in one XML file, receive each relevant section into the same saved account. Preserve the original institution namespace and currency precision.
2. Open **Close statement → Combine original statement pages**. Select the saved imports for exactly one original account statement. Selection persists across the import table's pages and in the downloaded working inputs.
3. Select the bank's transaction-summary scope. The default is **Complete statement (first-page summary)**. Use **Separate original summary for each page** only when the original bank convention supplies that scope, and describe it in the grouping field.
4. Review the selected originals. The screen shows the source page numbers, final-page flag, statement references, opening boundaries, booked movement, closing boundaries and issues. Download the full review to retain all source controls and transitions.
5. When the source assembly is eligible, choose **Use these original statement balances**. The existing close form binds its dates and balances to that assembly. Review every original cash transaction and its receipt, refund or accounting posting, then record the complete reconciliation.
6. Download **account.tar** from the retained close. It contains every selected page's original XML, the complete page review inside the reconciliation, the editable account snapshot, transaction/posting exports and related customer accounts. Reopening preserves that first edition and a later close links back to it.

An eligible page assembly establishes a complete original balance source. The ordinary reconciliation review still checks the current cash register, posting parts, source coverage, neighboring period balances and overlapping closes.

The page selection, grouping explanation and summary scope are included in **Download working inputs**. Restoring that file restores the entered work. Review the selected saved pages again before closing; the application compares the current assembly with the original selected identity.

## What the assembly checks

Every selected import must be a CAMT.053 statement for the saved institution, account and currency. All selected pages use the same original namespace, message version, pagination level and reporting-period timestamps. The original `FrToDt` fields establish the inclusive source-calendar period. The earliest and latest transaction dates remain transaction observations.

Pages must cover exactly one through the final page, with one selected original interpretation for each number. Only the final page has `LastPgInd=true`. Repeated original files/sections, repeated page numbers, missing pages, and superseded interpretations appear in the review. The complete selection is limited to 1,000 imports, 50,000 source entries and 128 MB of unique retained parsed reports. The byte budget is checked before reading those reports; the source files remain retained in their existing imports.

Electronic, legal and reporting sequences must agree when supplied. Message IDs and individual statement IDs stay attached to their respective original pages. A bank can change those IDs between physical messages. If no common native sequence or statement ID establishes the grouping, the operator supplies the reviewed account-period explanation. That explanation is retained in the close.

The first page supplies its original `OPBD`; intermediate boundaries use original `OPBD/CLBD` with subtype `INTM`; the final page supplies its original `CLBD`. Each page's signed booked entries must explain its own balance movement. Its opening must also equal the preceding original closing. A pair must be unambiguous. Original timestamps, including explicit offsets and fractional seconds, preserve their ordering.

The summary review uses all original entries in its declared scope, while the balance equation uses booked entries. Entry details remain nested source information. Their amounts, reversals and charges retain the existing parser's interpretation. Every selected booked entry must still resolve to exactly one current posted cash transaction with its original source amount, date and account value.

## Original bank rules

The [SWIFT CGI Bank-to-Corporate Reporting Best Practices](https://www.swift.com/swift-resource/252088/download), printed pages 49–55, describes sequential statement pagination within and across files, first-page whole-statement summaries, and the opening/intermediate/final balance pattern. Its worked two-page example has an opening of 100, page movements of 10 and 28, and a final closing of 138.

The [SIX SPS 2025 cash-management guide](https://www.six-group.com/dam/download/banking-services/standardization/sps/ig-cash-management-sps-2025-en.pdf), printed page 36 and the pagination field definitions, documents the corresponding intermediate booked-balance boundaries and sequence numbering.

[LHV's original Connect account-statement documentation](https://partners.lhv.ee/connect/) provides a bank-specific example in which physical message IDs and derived statement IDs differ between pages. Its original identification conventions explain why the receiver keeps both common sequences and an explicit account-period grouping option.

## HTTP and typed JavaScript client

The existing authenticated receivables server exposes:

```text
POST /api/receivables/bank-statements/assembly-preview
```

The request selects retained source imports:

```json
{
  "accountId": "ORIGINAL_ACCOUNT_UUID",
  "importIds": ["ORIGINAL_PAGE_ONE_IMPORT_UUID", "ORIGINAL_PAGE_TWO_IMPORT_UUID"],
  "summaryScope": "STATEMENT",
  "groupingNote": "Original daily statement pages supplied by the bank."
}
```

The response includes the current workspace revision and identity, complete page review, `eligible`, exact `closing` record and a `sourceClosing` selection. Import identifiers above are placeholders; use the saved account's real IDs from `state()`.

```js
const assembly = await bank.previewAssembly(selection);
if (!assembly.eligible) {
  console.log(assembly.issues);
} else {
  const value = {
    accountId: assembly.accountId,
    from: assembly.closing.from,
    until: assembly.closing.until,
    openingBalance: assembly.closing.opening.amount,
    closingBalance: assembly.closing.closing.amount,
    sourceClosing: assembly.sourceClosing,
    balanceNote: ""
  };
  const review = await bank.previewClose(value);
  // Retain through the existing original actor/revision/requestId workflow
  // after reviewing review.ready, review.problems and all posting parts.
}
```

`BankStatementsClient.previewAssembly`, `CamtAssemblyInput`, `CamtAssemblyPreview` and the close-source union are included in the maintained typed client. Preview is read-only. Both previewing and retaining a close reopen the saved reports and recompute their assembly; a changed selection or interpretation requires another review.

## CLI

Use the existing installed command:

```sh
starforge bank-statements assembly-preview \
  --directory /private/accounting \
  --input /private/pages.json
```

Then supply the returned `sourceClosing` with its exact dates and balances to the existing `close-preview` and `apply --action close` commands. The standard workspace identity, revision, actor and stable request ID remain the mutation inputs.

The `accountant` command continues to open the resulting archive in the complete accountant-receiving workbench.

## Retained close shape

The saved close uses `balanceBasis: "ORIGINAL_SOURCE_PAGE_ASSEMBLY"`. Its `sourceClosing` retains:

- `kind: "CAMT_PAGE_ASSEMBLY"`, all selected `importIds`, and the complete `assembly`;
- the original first import's `importId` and `fileSha256`, alongside the complete multi-source fields;
- the assembled `closing` record, whose first opening and final closing are original source balances;
- every page's file identity, statement identity, sequences, original source locations, summary checks and connected balance transitions.

Every selected original import is present in `report.imports` and the editable snapshot, including an empty page. Each original is exported as `source-<importId>.xml`. Repeated XML files retained under different selected statement imports preserve those distinct source references.

If a later interpretation replaces one of those imports, the historical close still opens with its original report. Its current comparison shows the source-review problem while retaining the original account archive and reopening history.

## Whole native receiving course

`PAGE_ASSEMBLY_RECEIVE.mjs` operates this feature against an existing private workspace with its original pages already received and its posting decisions reviewed. It uses the maintained BankStatementsWorkspace directly. It records the close, exports the complete accountant archive, closes and reopens the accounting workspace, checks the retained original XML bytes, and recovers the same original request.

Input:

```json
{
  "workspace": {
    "directory": "/private/accounting",
    "expectedWorkspaceId": "ORIGINAL_WORKSPACE_ID"
  },
  "selection": {
    "accountId": "ORIGINAL_ACCOUNT_UUID",
    "importIds": ["ORIGINAL_PAGE_ONE_IMPORT_UUID", "ORIGINAL_PAGE_TWO_IMPORT_UUID"],
    "summaryScope": "STATEMENT",
    "groupingNote": "Original bank statement received in two pages."
  },
  "actor": "Original operator",
  "requestId": "ORIGINAL_STABLE_OPERATION_ID",
  "name": "Original complete bank statement",
  "mode": "close"
}
```

```sh
node stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/PAGE_ASSEMBLY_RECEIVE.mjs \
  --input /private/page-course.json \
  --out /private/page-course-artifacts
```

For a dedicated demonstration workspace, `mode: "exercise"` and an explicit `exerciseReason` additionally record a reopening and linked successor, export both archives, and independently reopen the successor. Use one stable request ID and preserve the same input/output directory when resuming the original operation. Existing outputs must match their exact bytes.

The course requires the original Node runtime and the normal accounting workspace dependencies. Its result records actual close IDs, archive hashes, original-source coverage and cold receiving. It saves full reviews, the original mutation intents, original XML files, editable reconciliations and complete account archives under the selected private output directory.

## Engineering receiving recorded for this release

The actual complete retained Goldman Sachs CBPR report was received by the new assembler. Its two original entries retain a booked movement of -25.95; its page-one nonfinal indicator keeps the incomplete source in review. The published SWIFT numeric worked example was also represented explicitly as review input: seven entries, movement 38, first opening 100 and final closing 138. Its complete-page summary agrees. Missing first-page, different sequence and reversed same-day boundary timestamps were rejected. The current reconciliation domain then closed the seven-entry worked example with both original imports and zero difference; removing a source binding or assigning it to two posted cash rows kept the reconciliation in review.

Those checks ran the maintained exact-decimal core and the new assembler in the available V8 execution environment, using the maintained SHA256 implementation and a plain-JSON cloning adapter. The complete original-workspace course above supplies the physical receiving, archive and reopen operation on the installed Node runtime.
