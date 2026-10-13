# Review original Horizon payments against a saved Bloccpay payroll

This companion uses the existing Bloccpay company workspace. It compares retained Horizon operations with original payroll recipients and amounts, produces a complete offline review, and lets an operator save one explicit link through the maintained `correction.save` transaction. It does not fetch a provider, submit a payment, approve an SDP batch, change a Bridge transfer, or increase a ledger balance.

The existing company payroll, SDP, Bridge and financial reconciliation logic remains authoritative. A successful chain movement is evidence of that movement; it is not an assertion that a payroll payment was accepted by SDP or that a commercial obligation is discharged.

## Open the current company source

Use Node 24 and the full company application, including its existing `source-files.json`. The new entry is `horizon-payroll.mjs`; the pure/native review functions are in `lib/horizon-payroll-review.mjs`. This companion opens an **existing** workspace and verifies its explicit workspace ID. The configuration is the same private file used by the company's maintained CLI. Keep configuration, review, selection, choice and result files private (mode 0600).

Inspect existing identities with the original CLI/operator. Select the saved programme version, imported payroll, Horizon connection alias, original network-root source, operation-page sources and transaction sources. If a page used Horizon's original transaction join, its retained transaction is already available. No approximate account, amount-only or memo-free fallback is used.

Create a private selection file with these fields:

```json
{
  "programmeVersionId": "ACTUAL_PROGRAMME_VERSION_ID",
  "payrollId": "ACTUAL_PAYROLL_ID",
  "connectionAlias": "horizonTestnet",
  "sourceIds": ["ACTUAL_NETWORK_ROOT_SOURCE_ID", "ACTUAL_OPERATIONS_SOURCE_ID"],
  "captureIds": [],
  "sourceAccounts": ["ACTUAL_STELLAR_DISTRIBUTION_ACCOUNT"],
  "memo": {"field": "walletAddressMemo", "type": "id"}
}
```

All IDs and accounts above are placeholders to replace with the original saved values. An SDP `sourceWalletId` is a provider identifier and is never treated as a Stellar address. `sourceAccounts` lists the explicit original Stellar sender accounts. A base G account and a muxed M account are different identities; this workflow does not infer equivalence.

Choose either the payroll's original `walletAddressMemo` or `memo` column and the exact Stellar memo type: `none`, `text`, `id`, `hash` or `return`. `none` requires an actually empty selected payroll field. Text compares UTF-8 bytes (at most 28); ID compares canonical unsigned 64-bit decimal; hash/return compares the original 32-byte canonical Base64 value. The mapping is retained as part of the review, never silently refreshed.

Selected captures are optional. If provided, each must be COMPLETE with no continuation/rejected sources, and every original page must appear in `sourceIds`. A manually selected source set is only a review of that set, not a claim that every account operation was captured.

## Create and read the complete review

Run from the company application directory:

```sh
node horizon-payroll.mjs review \
  --directory /private/bloccpay-workspace \
  --configuration /private/bloccpay-configuration.json \
  --workspace-id ACTUAL_WORKSPACE_UUID \
  --selection /private/horizon-selection.json \
  --out /private/horizon-review.json

node horizon-payroll.mjs report \
  --review /private/horizon-review.json \
  --out /private/horizon-review.html
```

Open the HTML file locally. Its content is deterministic and has no network dependencies. Keep the complete JSON alongside it: it contains selected source identities and full original programme, payroll, version, correction and reconciliation records. It also binds every retained original request/response/receipt file by its complete length and SHA-256. The producer rereads source bytes and reproduces the native Horizon projections before reviewing them.

The comparison requires the same original network, exact sender and destination, exact asset code and issuer, exact memo, and programme period (start inclusive, end exclusive). Stellar amounts use integer units at seven decimal places without rounding. Ordinary payments, strict-send/strict-receive path-payment destination amounts, and account-creation starting balances are supported. Other operation kinds are listed as unsupported, not converted into payments.

| Status | Meaning |
| --- | --- |
| CANDIDATE | One original unlinked payroll row matches exactly; human selection is still required. |
| AMBIGUOUS | More than one original row matches exactly. The operator must select a specific row and explain why. |
| LINKED | The exact original transaction link already exists. No new link is needed. |
| AMOUNT_DIFFERENCE | Destination, asset and memo match, but amount is lower or higher. This command does not create a partial or overpayment allocation. |
| UNMATCHED | No eligible original payroll row matches. |
| BLOCKED | Missing/incomplete original source, network/sender/period inconsistency, conflicting immutable observations, existing exclusions, failed transaction or previous movement choice prevents selection. |

The report preserves original native reconciliation separately. It does not hide unmatched SDP/Bridge records or translate those balances into chain-settlement claims.

Transaction history is checked across every retained same-network, same-connection transaction observation, including transactions joined inside operation records. This includes original versions outside the selected source list. A differing original memo, success, ledger or transaction identity blocks a choice even when a later repeated observation matches; the review retains both explicit transaction and inline history version IDs. Source selection cannot erase a known immutable conflict.

## Prepare a human choice, then apply that exact request

Copy the movement ID and original row ID from the saved review. Supply a stable new operation UUID, actor and factual reason:

```sh
node horizon-payroll.mjs choose \
  --review /private/horizon-review.json \
  --movement ACTUAL_MOVEMENT_SHA256 \
  --row ACTUAL_ORIGINAL_PAYROLL_ROW_ID \
  --actor "Operator name" \
  --reason "Reason for linking this exact original movement and payroll row" \
  --request-id ORIGINAL_NEW_REQUEST_UUID \
  --out /private/horizon-choice.json

node horizon-payroll.mjs apply \
  --directory /private/bloccpay-workspace \
  --configuration /private/bloccpay-configuration.json \
  --choice /private/horizon-choice.json \
  --out /private/horizon-result.json
```

`choose` is offline and writes an immutable request; it does not modify the workspace. `apply` revalidates its complete review and explicit choice, recreates the current source review, and requires the same original revision/head and source content. The existing native transaction enforces the expected revision. The saved correction links the original Stellar transaction hash and retains the selected operation ID, versions, parties, asset, memo, observed amount, expected amount, original review hash and complete review file.

A new source, correction or other workspace change requires a deliberately new review and choice. Do not edit the old request to make it current. After saving one choice, create a fresh review for the next new choice. A movement already used by an active Horizon-review correction is blocked from reuse.

If the terminal disconnects or result-file publication fails, repeat **the exact `apply` command with the same choice file and same output**. It first looks up the original native request and verifies its identity. A completed original request returns its retained result even after later workspace changes. It does not make a second correction. A different request body under the same UUID is rejected; a previous native failure remains a failure.

All authored output files are create-only. If an existing output differs, preserve it and choose a new output path for a deliberately new review edition. Never overwrite the original review, choice or native result.

## Export and independently receive

Use the existing company `workspace.export` and `package.receive` workflow. The complete review was retained through the original workspace file store, so native export carries it with the SQLite correction and request records. Include the new companion in the company's source manifest before exporting the application. The normal source manifest pins every file and preserves the other company source members.

After independent cold receiving, use the exact received application and its original connection configuration to inspect the retained correction and review file. Receiving keeps provider dispatch disabled by the existing engine. Offline inspection needs no connection:

```sh
node horizon-payroll.mjs verify --review /private/horizon-review.json
node horizon-payroll.mjs report --review /private/horizon-review.json --out /private/reopened-review.html
```

The independent native package checks establish the transferred workspace/file identities. The standalone review checker establishes internal review identity and deterministic comparison; neither is a signature from Horizon or the customer.

## Integration boundary

This companion adds one module, one CLI and this operating guide. It calls the existing company's original correction writer and file-retention/export APIs. It leaves original payroll bytes, requests, provider routes, approval methods, current SDP/Bridge adapters and financial totals unchanged. Its configuration is selected by the owner, and it never creates a new customer ledger or payer.

Use the original company commissioning and receiving programme with the saved programme, imported payroll and retained Horizon sources selected for this review. Its normal export carries the retained review, correction, original request and files into the receiving workspace. Inspect the same original records after reopening, and record the actual operating result with the original case.
