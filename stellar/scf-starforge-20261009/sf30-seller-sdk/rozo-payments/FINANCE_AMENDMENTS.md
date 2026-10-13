# Correct an issued ROZO financial period

Use a following financial edition when a corrected saved ROZO report changes an already accepted source. The programme compares the two original source files, reviews the affected issued periods, reopens the selected original periods, records explicit new coding or dispositions, and issues their following closes and accountant returns.

The original merchant close, Buyer close, accountant files, reviewed returns and complete first project archive remain retained. Each following close names its original predecessor. Exact native units and complete chain/token identities remain separate throughout the comparison; the programme makes no exchange-rate conversion.

## Select the completed predecessor

Keep the completed first finance directory, including its `FINANCE_PLAN.json`, `FINANCE_RESULT.json`, `FINANCE_RECEIVING.json`, `FINANCE_PACKAGE_RECEIPT.json`, `FINAL_FINANCE_STATE.json`, original source files, `cold-finance/FINANCE_RECEIVED.json` and `Rozo_Finance_Complete.zip`. The preparer checks their operation, report, workspace, independent receiving outcome and whole-archive byte identity.

If receiving the first ZIP on another host, retain its original ZIP and package receipt alongside the extracted first operation. The package receipt is the external identity of that ZIP. Use the original ROZO receiving workflow to obtain the active workspace before continuing a previously sealed custody transfer.

Select the actual configured merchant Accounting alias and the same Buyer alias when the original programme included Buyer. Keep the original encrypted backup passphrase in its existing environment variable. Use a separate sibling directory for the following programme.

Create the corrected report through the maintained ROZO provider observation, reconciliation and saved-report controls. Select its actual report ID, version and SHA-256. The source must have the same original ROZO origin and profile and a different frozen source identity.

## Review source impact in the staff application

Open Finance → Financial corrections → Review corrected report. Select the corrected saved report, source name, provenance and data context. For Buyer, explicitly select each purchase with its owner, purchase reference and reason. Leaving all purchases unselected creates a reference-only selection; the application never infers purchase ownership.

Compare original financial editions shows every added, removed, changed and unchanged movement. Native-unit differences appear only when both amounts are observed and the complete asset identity matches. The comparison includes the full original before/after records and issued merchant and Buyer periods. Save complete comparison downloads that exact review.

Review reopening requires an explicit reason and rereads the complete impact before dispatch. It uses the original request journal and reviewed native revision. If a save response is lost, finish the same request through the existing recovery panel. The original issued files remain immutable.

For the full command-driven programme below, let the reviewed plan perform reopening once. The browser phase visits and downloads the comparison before those mutations; it does not also press the manual reopening buttons.

## Prepare the following plan

Write source details as an ordinary JSON object with the original `name`, `provenance` and `dataContext` fields. When Buyer was included previously, prepare its explicit native purchase selection against the corrected report:

```json
{
  "schema": "stellar-forge.rozo-buyer-selection.v1",
  "sourceId": "<source ID from the corrected report>",
  "purchases": [
    {
      "movementId": "<actual source_payment movement>",
      "basisSha256": "<actual movement basis SHA-256>",
      "purchaseOwner": "<reviewed owner>",
      "purchaseReference": "<original purchase reference>",
      "reason": "<reason this source payment is a purchase>"
    }
  ]
}
```

Use an empty `purchases` array only after explicitly reviewing reference-only intake.

```sh
starforge rozo-payments finance-amendment-plan \
  --workspace /private/rozo/workspace --config /private/rozo/connections.json \
  --merchant-config /private/merchant.json --accounting merchant-books --buyer purchasing \
  --previous-finance-directory /private/finance-operation \
  --directory /private/finance-correction-draft \
  --report-id CORRECTED_REPORT_ID --report-version ACTUAL_VERSION \
  --report-sha256 CORRECTED_REPORT_SHA256 \
  --source-details /private/corrected-source-details.json \
  --purchase-selection /private/reviewed-purchase-selection.json \
  --actor "Original finance reviewer" \
  --operation-id ROZO-MERCHANT-SETTLEMENT-FINANCE-AMENDMENT-20261013
```

Omit `--buyer` and `--purchase-selection` when the original programme had no Buyer side. The draft and context retain the complete previous plan, current native owner state, original archive identity and full source impact.

Copy `finance-plan-draft.json` to a reviewed plan. Complete these decisions:

- `amendment.review.reason` explains the financial correction. Merchant and Buyer reopening reasons identify why each original issued period is being reopened. Keep the selected close IDs and exact issued-source hashes.
- Merchant coding suggestions cover movements previously recognised in the selected close and observed candidates within its original half-open `from`/`until` interval. Existing allocations are copied only as an unapproved draft: a changed amount still requires explicit corrected allocations whose exact units sum correctly. Reasons and provider-evidence acknowledgements remain incomplete.
- Retain each merchant coding's captured `expectedVersion` (zero for a new movement). A later human coding edition requires a fresh review and is never replaced using a newly fetched version. Review every selected recognition date, account code, cost centre, project and amount. Remove candidates that should not be recognised and record only permitted original dispositions after inspecting the actual period issues. Removed movements may use their retained previous basis for the missing-source disposition.
- Keep the original period ID. Its current definition version is supplied as `expectedVersion`; review any intended period-definition change explicitly.
- For Buyer, retain the explicit purchase selection and original period ID. Enter current cost centres/labels as needed, exact reviewed allocations, recognition dates, dispositions and review reason. The prior programme's allocations are not silently reused. The full impact freezes existing Buyer items and coding heads; a later coding change stops the planned update. The reopened period must also match its original saved reopening result before its definition is saved. Both mutations use the same observed native revision for CAS.
- Select `browser.movementId` from the planned merchant codings. If this correction has no planned coding, leave it null: the actual comparison, six-view delivery and receiving phases still run.
- Complete the accountant evidence-review note, maintenance writer confirmation and working-export/permanent-handover choice as described in `FINANCE.md`.

This programme scopes one completed merchant period and its original Buyer period. The full comparison lists all other affected issued periods, and the result carries those remaining close IDs. Review those periods through their original reopening workflow before treating their financial corrections as complete. It never reports the other periods as corrected merely because this source was accepted.

## Execute and continue the same following programme

```sh
starforge rozo-payments native-finance \
  --workspace /private/rozo/workspace --config /private/rozo/connections.json \
  --merchant-config /private/merchant.json --accounting merchant-books --buyer purchasing \
  --plan /private/reviewed-finance-correction.json \
  --previous-finance-directory /private/finance-operation \
  --directory /private/finance-correction-operation \
  --chromium /existing/runtime/chrome-headless-shell \
  --playwright-module /existing/runtime/playwright/index.mjs \
  --python /existing/runtime/python3
```

Before reopening, the driver copies and verifies the exact predecessor metadata and complete first ZIP into `previous-finance/`. It reads the current full impact, then operates the real comparison screen with the exact reviewer, source fields and explicit purchases. The downloaded comparison must equal the reviewed plan. Reopening uses the original native revision captured by that review. A concurrent native change rejects the attempt.

The original accepted-source parent is checked again before each following capture. The original request journal freezes every command before dispatch and reuses accepted results. A browser coding operation loses its response after native acceptance and then recovers the same request through reload; no second edit is created. If there is no planned coding, that mutation phase is omitted.

Each original engine performs its normal source review, period exceptions, coding, following close and accountant return. The final phase captures all six staff views, original downloads, complete native backup, Buyer project and ROZO archive, and runs the independent receiver using the received application.

To resume, use the same reviewed plan, operation ID and directory. Once the full `previous-finance/` copy is retained, the original predecessor mount is unnecessary. Preserve uncertain original requests and follow the existing maintenance-continuation contract for confirmed terminal backup jobs. A changed financial decision requires a newly reviewed following operation, not an edit to an already dispatched request.

## Receive both financial editions

The resulting `Rozo_Finance_Complete.zip` contains the new full native delivery plus the exact entire first ZIP and its selected full receiving records. Use the ordinary `receive-finance` command with this following ZIP's own SHA-256 and the existing backup secret.

The separate receiver restores the original encrypted Accounting backup, reopens the copied Buyer database and verifies:

- The original merchant close remains `REOPENED` with identical issued bytes; the new close is `CLOSED`, has the same period, names the old close as predecessor and advances its sequence by one.
- Both complete original merchant and Buyer accountant handoffs and every original return remain identical.
- The original Buyer issued close is byte-equivalent to its retained canonical identity; its following close names that original close, advances by one and belongs to the same period.
- The exact first archive, original source reports, reviewed comparison, requests, current complete project files and every recorded receiving identity remain present.

Retain `AMENDMENT_SOURCE_IMPACT.json`, `AMENDMENT_PREDECESSOR.json`, `FINANCE_BROWSER_AMENDMENT.json`, the current `FINANCE_RESULT.json`, independent `FINANCE_RECEIVED.json` and final package receipt. Their amendment fields identify the original and following closes, original archive and any other affected periods still requiring review.
