# ROZO report, financial review and complete receiving

This programme continues a saved ROZO report through the configured original merchant Accounting and optional Buyer workspaces. It keeps provider evidence, financial recognition, accountant review and custody as distinct recorded decisions. The original report, its frozen CSV/HTML, raw observations, exact amounts, source editions and every accepted request travel with the finished project.

## Open the existing workspace

Use Node 24 or later and the maintained installed `starforge rozo-payments` command. The same product CLI is available from `stellar/scf-starforge-20261009/sf30-seller-sdk/rozo-payments/cli.mjs`. Install the original `rozo-payments`, `schema` and `mcp` selections as described in the distribution guide. The configured Accounting and Buyer owners retain their native runtime, maintenance admission, child lifetimes and source contracts.

```sh
starforge rozo-payments serve \
  --workspace /private/rozo/workspace \
  --config /private/rozo/connections.json \
  --merchant-config /private/merchant.json \
  --accounting merchant-books --buyer purchasing
```

The merchant configuration is the existing Merchant Operator configuration. There is no second finance configuration. Accounting must use its merchant source mode for ROZO recognition. The original accountant capability can also serve Buyer handoffs. Applications uses the same merchant configuration and selected aliases, pins the configuration and Buyer connection file, and verifies the live finance aliases before opening the application.

Open **Finance** in the original ROZO workspace. The desktop and narrow-screen views use the same gray industrial styling as the rest of the product.

## Select the original financial meaning

Choose an existing report by its identifier, version and exact report SHA-256. Source intake retains the original report files and every original object needed to inspect that edition. Later CSV/HTML presentation changes do not invalidate an earlier saved source: their original hashes remain authoritative.

A report exposes three separately typed movements for each native payment:

| Movement | Meaning in this workspace |
| --- | --- |
| `source_payment` | The original incoming payment measured in its source asset. |
| `source_fee` | The separately reported provider fee in its own exact asset/precision. |
| `destination_payout` | The separately reported payout and destination evidence. |

Provider confirmation is retained as provider evidence. It does not become a generated on-chain verification or proof. Expected amounts, unsettled movements, absent amounts and unresolved provider evidence remain visible. Assets retain chain ID, network, token address, symbol and decimal precision; arithmetic uses exact native units. This programme creates no reservation, signs no payment and performs no foreign-exchange conversion.

Merchant recognition requires an explicit accounting date, a reviewed movement basis, an evidence acknowledgement and complete allocation lines. Every allocation retains its amount, account code, cost centre, project and memo. Select the full intended context, then resolve the original period exceptions. Source changes, stale coding, pending review, missing evidence and previously closed movements retain their original exception or reopening paths.

Buyer purchases are an additional explicit selection. They are never inferred from a merchant report or a payout. Each chosen `source_payment` needs its exact movement ID/basis, actual purchase owner, purchase reference and reason. An empty selection is valid as reference-only intake. The native Buyer model retains zero reservation and its original source-review, coding, label, period and accountant-return behavior.

## Staff workflow

1. In **Intake**, select the saved report and review the complete merchant preview. For Buyer, enter and review the explicit purchase selection. Inspect the actual source bytes and metadata before capture.
2. In **Merchant**, accept the source edition, define or select the original versioned period, code the recognised movements, review actual exceptions and retain the reviewed close. Reopening and following decisions preserve earlier closes.
3. In **Buyer**, review the selected purchase source, retain cost centres and the complete intended asset-label set, code each selected purchase, resolve permitted original issue dispositions, review and close its native period.
4. In **Accountant**, create each typed handoff from its exact original close. Download all files. Return the original editable CSV; preview the protected-row comparison; apply only that same preview and explicit parent revision. A later return names the actual preceding return.
5. In **Deliveries**, download the original issued files, full Buyer project and original financial source. A Buyer accountant return can be applied to its original closed purchase period after its own preview.

The same original ROZO request journal covers native finance effects. Browser requests are persisted before dispatch. A lost HTTP response retains the exact request ID/body and reconciles the native accepted result. **Resume original request** continues that prepared operation. An unresolved earlier dispatch is never silently replaced with a new request.

## Configure a source alias for native tools

The original configured tools use `rozoSources` alongside the existing Buyer source aliases:

```json
{
  "rozoSources": {
    "saved-rozo-report": {
      "sourceFile": "/private/finance-draft/rozo-finance-source-report-following.json",
      "sourceSha256": "<SHA-256 of the complete source file>",
      "name": "Reviewed provider period",
      "provenance": "Original saved ROZO report selected by the operator",
      "dataContext": "development"
    }
  }
}
```

Use the exact generated filename, metadata, context and operator if selecting this alias in the native finance plan. The receiving programme compares the configured tool's complete native preview with the product's preview before capture.

`merchant_buyer_expense_rozo_preview` requires `workspace`, `rozoSource`, `operator` and `purchaseSelection`. Capture adds `requestId`, `expectedRevision` and `previewSha256`. The original Accounting catalogues expose their configured ROZO source and native request operations. The shared dynamic CLI publishes those actual tool schemas. See `stellar-forge/mcp-merchant-operator/ACCOUNTING_ROZO.md` and `BUYER_ROZO.md` for exact requests and file selectors.

Preview and capture both check the complete source-plus-selection JSON envelope against the original 96,000,000-byte Buyer request limit. The source itself remains bounded at 64 MiB. Larger actual input must remain outside this selected intake; truncation is never a receiving strategy.

## Prepare the actual following native programme

The native driver consumes the same existing ROZO and configured financial workspaces. It does not initialise a replacement case or replay the completed provider/payment programme. First produce a read-only plan and context:

```sh
starforge rozo-payments finance-plan \
  --workspace /private/rozo/workspace \
  --merchant-config /private/merchant.json \
  --accounting merchant-books --buyer purchasing \
  --directory /private/finance-draft \
  --report-id report-following --report-sha256 ORIGINAL_REPORT_SHA \
  --actor "Selected finance operator" \
  --source-details /private/source-details.json
```

`source-details.json` contains exactly `name`, `provenance`, and `dataContext` (`development` or `operational`). The command saves the complete original source, `finance-plan-context.json` and `finance-plan-draft.json`. The context includes actual native workspace bindings, periods, centres, labels, and every original movement.

Copy the draft to a reviewed plan and fill the real decisions. It deliberately leaves dates/periods, account codes, reasons and acknowledgements incomplete. Select the original merchant period using its actual name, `from` and `until`; existing period changes also need their native ID and expected version. Remove unrecognised rows from coding and explicitly choose their permitted dispositions only after reading the native period preview. Choose `browser.movementId` from the planned merchant codings.

For Buyer, replace the null `buyer` with its actual `binding`, explicit `purchaseSelection`, original `period` (`name`, `from_day`, `through_day`), intended `centers`, complete `labels`, and `codings`. Buyer allocations use native units, an existing `center_id` or explicit `center_code`, `account_code`, `project` and `memo`. Optional dispositions must use actual original issue IDs/codes and permitted kinds. Optional `rozoSource` selects the already-configured source alias above.

The plan's accountant status is `REVIEWED`: the programme records evidence review and never pretends that an external accountant posted the entries. The review note must be explicit. The plan's `handover` is false for a useful working export; true selects the original permanent custody operation, which drains and seals its owner. Confirm `maintenance.externalWritersStopped: true` only when the configured Accounting input writers are stopped for the original complete backup.

Keep the original Accounting recovery configuration:
`accounting.workspaces[alias].recovery` contains `stateRoot`, `backupRoot`, and optional `passEnv`. The default passphrase variable is `STARFORGE_ACCOUNTING_BACKUP_PASSPHRASE`. Supply that existing secret through the process environment; no passphrase is written into the source, plan or plain receiving descriptor.

```sh
starforge rozo-payments native-finance \
  --workspace /private/rozo/workspace --config /private/rozo/connections.json \
  --merchant-config /private/merchant.json --accounting merchant-books --buyer purchasing \
  --plan /private/reviewed-finance-plan.json --directory /private/finance-operation \
  --chromium /existing/runtime/chrome-headless-shell \
  --playwright-module /existing/runtime/playwright/index.mjs \
  --python /existing/runtime/python3
```

The process holds the original owner scopes and saves the full plan before mutation. Every step records its exact original request before dispatch. Native steps accept and code sources, close both periods, create and return both typed accountant handoffs, and retain every original issued file. The browser enters one planned merchant coding through the actual form, loses its HTTP response after native acceptance, reloads and reconciles that same ID. It then visits all six finance views, downloads an original file, and captures desktop and narrow-screen evidence.

The final phase pauses the original Accounting owner, runs its maintained review/backup/verify jobs, copies the complete encrypted backup, and resumes the owner. It preserves the complete Buyer project archive and the complete ROZO working export or explicit handover. A separate Node process running the received original application restores and checks the native Accounting backup and invokes the copied original Buyer receiver. The complete project is finally saved as `Rozo_Finance_Complete.zip` with a full member manifest and SHA-256 receipt.

## Continue an interrupted original operation

Run the same command with the same retained plan and directory. Completed steps and exact native requests are reused. Changed decisions require the normal following native review/reopen workflow; do not edit the sealed original plan to force an old request to mean something new.

Browser progress retains the full original form request outside the browser profile. Reload recovery can therefore reconcile the accepted result even if the old profile is unavailable. Each native child result is preserved in `process-attempts/`, with the latest process receipt alongside it. A failed cold receiver can continue from its original incomplete destination and preserved inputs.

The original Accounting controller marks abandoned jobs `INTERRUPTED` and does not silently restart them. If a maintenance job is confirmed `FAILED`, `CANCELLED` or `INTERRUPTED`, an operator may provide an explicit following UUID:

```json
{
  "schema": "stellar-forge.rozo-finance-maintenance-continuation.v1",
  "operationId": "ROZO-MERCHANT-SETTLEMENT-FINANCE-20261013",
  "jobs": {
    "backup": {
      "previousRequestId": "<actual terminal original UUID>",
      "requestId": "<explicit following UUID>"
    }
  }
}
```

Add `--maintenance-continuation FILE` to the same native command. The driver reads the actual original job status, retains its complete result and request, then records the explicitly chosen following request before dispatch. It rejects replacement of a running or completed job. Existing original backup folders remain untouched.

After the final native result is saved, a packaging retry uses that same immutable result and completed progress. A completed sealed custody transfer is followed through its original receiving side; the sender is not reopened for a new programme.

## Receive the whole customer project

Retain the complete ZIP, its exact hash and the existing backup passphrase delivery. Extracting verifies every declared byte before any application code is run:

```sh
starforge rozo-payments receive-finance \
  --archive /delivery/Rozo_Finance_Complete.zip --sha256 ORIGINAL_ZIP_SHA \
  --directory /private/received-finance-package --receiver /private/cold-finance \
  --python /existing/runtime/python3
```

Configured QuickBooks host recovery uses the maintained host recovery factory and its original relocation mapper. The descriptor retains only the selected normalized configuration paths, company-selection pin, alias, and original configuration hash. The callback binds those fields to the authenticated backup profile, maps its paths and declared directory references, then validates the staged original bytes through the native source reader. Supplying `--merchant-config FILE --accounting ALIAS` additionally checks that exact original private configuration. Tokens, authorization state and source credentials stay encrypted; environment secret values are never serialized.

The archive includes all original source/evidence objects within the complete ROZO archive; every Accounting operating file in its authenticated encrypted backup; the full Buyer application/database/source project; complete original and returned accountant files; exact plans, requests, native results, maintenance receipts, screenshots and cold receiving evidence. The copied application verifies original workspace/origin IDs, saved revisions, source/capture/review/close history, every accountant return, original request fingerprints and all declared file hashes. The receiver never calls a provider or recaptures a payment.

A working ROZO snapshot remains read-only. A sealed handover can later be activated through the original ROZO `receive --activate` operation with its actual receiving request and actor. The finance cold receiver validates that archive without inventing another custody transfer.

## Completion records

Retain `FINANCE_RESULT.json`, `FINANCE_RECEIVED.json`, the browser phase results and `FINANCE_PACKAGE_RECEIPT.json` with the complete ZIP. Match their operation, original workspace and source identities before delivering the package. The native result identifies the retained merchant and Buyer closes, accountant handoffs/returns, complete encrypted backup and independent receiving outcome. The package receipt supplies the exact final ZIP byte count and SHA-256 for the receiving command.

## Correct a following source edition

Use `finance-amendment-plan` and the complete workflow in `FINANCE_AMENDMENTS.md` to compare a corrected saved report, reopen its original issued periods, review new coding and issue following closes and accountant returns. The following delivery retains the exact complete first archive and independently verifies both close chains.
