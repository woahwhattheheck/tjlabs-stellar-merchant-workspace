# Customer follow-up, cash planning and credit release through Merchant

Use the original merchant accounting connection and its existing saved workspace. The complete financial control interface continues the same invoice, receipt and allocation records used by the Receivables browser. Customers, monetary precision, account dates, retained source files and saved request identities remain those of the original accounting engine.

## Operate an assigned customer balance

Read the dated collection inventory, select an original outstanding invoice and create or update its assigned follow-up case. Reopen the complete case before recording activity. Enter the actual event date and its original note, responsible operator and next follow-up; record a customer promise or dispute using the original case activity inputs. The native case history determines what is visible for the selected account date.

Use the original case version and accounting revision returned by the current read. Keep the stable request ID and complete arguments in the normal private operation directory before applying a mutation. When a reply is interrupted, reconcile that saved request through the original accounting journal. Resume the same request and body until its outcome is established.

Closing follow-up records its own case transition. It preserves the original promise, dispute and financial history. Reopening the case continues those original identities. The customer reminder is prepared from the selected dated case; the existing native future-case rule applies. Download the full original case JSON, activities CSV, printable account and reminder through the ordinary retained-file reader. A caller prepares customer files; an actual external delivery remains a separate requested operation.

## Review an expected receipt scenario

Use the merchant's dated cash plan inventory and original scenario preview. Each expected amount comes from the original invoice balance, effective installment edition and retained case promise/dispute. Record explicit invoice date or separation decisions in the scenario and review any changed source basis before saving its next immutable edition.

The report keeps currency and precision groups distinct. Each invoice's original due amount reconciles to within-horizon, beyond-horizon and separated portions. Awaiting review is a subset of separated. Available original customer funds stay visible beside the receivable balance and are not added as a new expected receipt.

Save the reviewed scenario through the original writer, then retain the exact returned plan and edition. Later receipts and corrections continue in their existing bank, wallet or allocation workflow. Preview or save a following edition from those current sources and compare the two explicitly selected editions. Complete comparison and original plan files retain their source identities, date assumptions and saved revisions.

## Review credit and issue the original draft

Open the current credit desk for the customer and currency of an original draft. Save only the merchant's explicitly chosen credit policy. A disabled policy keeps the ordinary invoice workflow; an enabled policy applies its selected limits and review conditions.

Read the complete native assessment before recording an approval or decline decision. The assessment retains the original draft, current account exposure, overdue amounts, disputed records, future issued obligations, other drafts, available receipts and source basis. It keeps those categories separate and binds the saved decision to that exact customer, draft, policy and date.

Read the original invoice preview after the decision. The typed agent preview preserves its complete credit-review metadata and approved decision selection. Invoice preparation carries the original creditDecisionId into the existing invoice_issue request beside its draft version, reviewed document hash and workspace revision. The sole original issue writer rechecks the current decision and source and consumes the decision inside that same successful accounting commit.

A changed draft, policy, customer source or current-day assessment requires a fresh review. A completed original request is recovered before those current-state checks, so a retry returns the originally issued invoice. There is one invoice writer and one request journal throughout.

## Complete customer receiving

The customer flow is original issued balance → assigned follow-up and dated promise/dispute → saved cash-plan edition → actual receipt in the existing ledger → following dated plan comparison → explicit credit review for the next original draft → approved original invoice issue → complete customer and operator files.

Use the installed merchant-accounting-receivables command, typed client and original Merchant MCP host for every step. The complete files are streamed through the existing retained-file reader, preserving their original selector, read ID, size and SHA. Caller disconnect drains only its reads; close explicitly ends the original accounting owner after its accepted work drains.

The Collections, Cash Planning and Credit Control native models remain the original maintained product. All commands below use that product through the installed merchant agent connection.


## Installed connection and complete reads

Use the existing [Receivables connection](ACCOUNTING_RECEIVABLES.md), its configured accounting alias and the responsible operator. The installed command is `starforge merchant-accounting-receivables`; the typed client is exported at `@tokenjunkielabs/starforge-merchant/merchant/accounting-receivables`. Its durable preparation and download helpers use the `/operations` suffix. The financial binding and its native model type namespaces are exported at `/merchant/accounting-receivables/financial-control`.

```bash
umask 077
rcv=(starforge merchant-accounting-receivables)
connection=(--url "$MERCHANT_MCP_URL" --workspace "$MERCHANT_WORKSPACE" --token-env MCP_ACCESS_TOKEN)

"${rcv[@]}" open "${connection[@]}"
"${rcv[@]}" collection-list "${connection[@]}" --out collections.json
"${rcv[@]}" cash-plan-list "${connection[@]}" --out cash-plans.json
"${rcv[@]}" credit-control "${connection[@]}" --out credit-desk.json
```

Those complete JSON results contain the original `workspaceId` and accounting `revision`. Optional request files select the dated collection account, owner, status or search; the cash inventory accepts status/search and the credit desk accepts customer/search. Read commands return every original row. Their `--out` option writes a new private file containing the whole result.

### Prepare and resume a dated follow-up

For a new case, the request contains `workspaceId`, `revision`, `actor`, `requestId`, the original `invoiceId`, `effectiveDate`, `title`, `owner`, `priority`, `nextActionDate` and an optional note. An edit selects the existing `id` and `expectedVersion`. Obtain the current version from `collection-detail`.

```bash
"${rcv[@]}" prepare "${connection[@]}" --action collection-save \
  --request assigned-case.json --dir operations/assigned-case
"${rcv[@]}" execute --dir operations/assigned-case
"${rcv[@]}" reconcile --dir operations/assigned-case

"${rcv[@]}" collection-detail "${connection[@]}" \
  --request selected-case.json --out case-detail.json
"${rcv[@]}" prepare "${connection[@]}" --action collection-activity \
  --request dated-promise.json --dir operations/dated-promise
"${rcv[@]}" execute --dir operations/dated-promise
```

The selection file for a detail or reminder contains `collectionCaseId` and optional `asOf`. The activity request retains `collectionCaseId`, `workspaceId`, `revision`, `expectedVersion`, `actor`, `requestId`, `effectiveDate`, `kind` and `note`. A promise adds its original `amount` and `dueDate`; a dispute adds its original `amount` and `category`. Record the actual earlier contact date in `occurredDate` when it differs from the dated accounting event. Outcome and resolution events select the original `promiseId` or `disputeId`. The native controller validates the selected history and date.

### Save and compare complete cash editions

A preview request contains `workspaceId` and `plan`. The plan supplies `title`, `owner`, `asOf` and `through`. Optional fields are `note`, `bucket` (`DAY`, `WEEK`, `MONTH`), `customerId`, `pastDueDelayDays`, `futureDelayDays`, `usePromises`, `disputes` (`SEPARATE`, `INCLUDE`) and explicit `overrides`. An override retains its original invoice ID, `DATE` or `EXCLUDE` mode, expected date and reason.

```bash
"${rcv[@]}" cash-plan-preview "${connection[@]}" \
  --request cash-scenario.json --out reviewed-cash-plan.json
"${rcv[@]}" prepare "${connection[@]}" --action cash-plan-save \
  --preview reviewed-cash-plan.json --actor "$OPERATOR" \
  --request-id cash-plan-first --dir operations/cash-plan-first
"${rcv[@]}" execute --dir operations/cash-plan-first
```

The complete preview seal covers workspace identity, accounting revision, normalized plan and the entire projection. The preparer verifies that seal and retains the whole preview. To save a following edition of the same plan, supply `--review-options existing-plan.json` containing its `id` and current `expectedVersion`. A comparison selection contains `leftId`, `rightId` and the explicit `leftEditionId` and `rightEditionId`. Omitting an edition selects that plan's latest saved edition at the time of the native read; select IDs explicitly for a repeatable comparison.

```bash
"${rcv[@]}" cash-plan-compare "${connection[@]}" \
  --request selected-editions.json --out cash-comparison.json
```

### Approve the next original draft and issue it

A credit policy request retains `workspaceId`, the mutation identity, `customerId`, exact `currency`, `owner`, `reason` and `terms`. Terms explicitly select `enabled`, `creditLimit` or null, `overdueDays` or null, `reviewDisputes` and `reviewEveryOrder`. An edit carries its original policy `id` and `expectedVersion`.

An assessment selection contains the original draft `invoiceId` and `workspaceId`. Review its current account date, source balances, selected policy, triggers and complete draft. Create a private review-options file containing the operator's `outcome` (`APPROVE` or `DECLINE`) and `reason`.

```bash
"${rcv[@]}" credit-assessment-preview "${connection[@]}" \
  --request selected-credit-draft.json --out reviewed-credit.json
"${rcv[@]}" prepare "${connection[@]}" --action credit-decision-save \
  --preview reviewed-credit.json --review-options credit-decision.json \
  --actor "$OPERATOR" --request-id credit-decision-first \
  --dir operations/credit-decision-first
"${rcv[@]}" execute --dir operations/credit-decision-first

"${rcv[@]}" invoice-preview "${connection[@]}" \
  --request selected-invoice.json --out reviewed-invoice.json
"${rcv[@]}" prepare "${connection[@]}" --action invoice-issue \
  --preview reviewed-invoice.json --actor "$OPERATOR" \
  --request-id approved-invoice-first --dir operations/approved-invoice-first
"${rcv[@]}" execute --dir operations/approved-invoice-first
```

The invoice selection contains only `invoiceId`. Its complete preview includes `creditReviewRequired`, `creditTriggers`, `creditAssessmentSha256`, `creditDecisionId` and `creditDecisionStale`. The preparer carries a current approved decision automatically. To select a retained decision explicitly, use an invoice review-options file containing `creditDecisionId`. A decline never becomes an approval through invoice preparation; the original issue writer applies the current saved policy and decision.

The complete assessment validator uses the original native hash preimage. Other draft invoices remain informational, as in the native model; they do not invalidate an otherwise unchanged assessment.

## Complete file selections

Each selection is passed to the existing `download --selection FILE --out NEW_FILE` command or the typed client's complete-file helper. Optional `--sha256` binds a previously reviewed file. The original reader retains a complete snapshot on its first read and holds its identity through all chunks.

| File kind | Original selectors | Members |
| --- | --- | --- |
| `receivables-collection` | `collectionCaseId`, optional `asOf` | `case.json`, `case.csv`, `case.html`, `reminder.txt`, `manifest.json` |
| `receivables-collections` | Optional `asOf`, `customerId`, `owner`, `status`, `search` | `collections.json`, `collections.csv` |
| `receivables-cash-plan` | `cashPlanId`, optional `editionId` | `plan.json`, `plan.csv`, `plan.html`, `manifest.json` |
| `receivables-cash-plan-comparison` | `leftId`, `rightId`, optional explicit edition IDs | `comparison.json`, `comparison.csv` |
| `receivables-credit-decision` | `creditDecisionId` | `decision.json`, `decision.html`, `manifest.json` |

## Native agent method map

Every tool below has the `merchant_accounting_receivables_` prefix. All mutations use the existing stable request ID, responsible actor and original revision. Dated collection, cash and credit mutations also retain the original workspace identity.

| Tool suffix | Typed method |
| --- | --- |
| `collection_list` | `collectionCases` |
| `collection_detail` | `collectionCase` |
| `collection_save` | `saveCollectionCase` |
| `collection_activity` | `recordCollectionActivity` |
| `collection_close` | `closeCollectionCase` |
| `collection_reopen` | `reopenCollectionCase` |
| `collection_reminder` | `collectionReminder` |
| `cash_plan_list` | `cashPlans` |
| `cash_plan_preview` | `previewCashPlan` |
| `cash_plan_detail` | `cashPlan` |
| `cash_plan_save` | `saveCashPlan` |
| `cash_plan_archive` | `archiveCashPlan` |
| `cash_plan_reopen` | `reopenCashPlan` |
| `cash_plan_compare` | `compareCashPlans` |
| `credit_control` | `creditControl` |
| `credit_policy_detail` | `creditPolicy` |
| `credit_policy_save` | `saveCreditPolicy` |
| `credit_assessment_preview` | `previewCreditAssessment` |
| `credit_decision_save` | `saveCreditDecision` |
| `credit_decision_detail` | `creditDecision` |
| `credit_decision_withdraw` | `withdrawCreditDecision` |

Use the existing `lookupOperation` and `reconcileOperation` methods for every mutation. The typed preview/preparation helpers are `accountingCashPlanPreview`, `accountingCashPlanArguments`, `accountingCreditAssessmentPreview` and `accountingCreditDecisionArguments`. The original `accountingInvoiceIssueArguments` now preserves the selected approval.

A native stale-version or changed-assessment response includes the original error code and current assessment metadata in `details`. Reconcile any potentially committed saved request first. A changed request uses a new operation directory and stable request ID after review; a known existing request continues with its original body.
