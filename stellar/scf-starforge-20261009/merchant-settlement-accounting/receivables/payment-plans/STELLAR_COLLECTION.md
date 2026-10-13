# Stellar collection from original payment-plan installments

The payment-plan desk now opens the existing invoice wallet workflow with one exact schedule edition. The original invoice, schedule, wallet request, returned transaction, verification, receipt and allocation remain in the same accounting workspace.

## Operator journey

Open a saved payment plan and choose **Review current installment collection**. The invoice desk keeps any unfinished invoice or payment form and presents **Collect selected schedule**. That explicit action opens the current schedule rows alongside the merchant wallet terms.

Select the earliest outstanding installments that are not already covered by active instructions on the selected network. Only the last selected row may be partial. The commercial invoice amount is the exact sum of the selected rows. Enter the actual receiving G account, network, asset, Stellar amount, expiry and valuation basis. The application does not infer an exchange rate. Review the complete proposal, then issue it through the existing retained operation.

The request freezes the original invoice hash, schedule hash and edition, due dates, source paid/credited/remaining values and selected amounts. Its original printable HTML and JSON carry those rows. The issued request is also visible in the schedule's collection history. Public and test-network instructions remain distinct.

Existing unbound invoice instructions or instructions from another schedule edition must be reviewed before a new schedule collection is issued. The original invoice desk can withdraw an overlapping request while retaining its source and history. A change of network rereads the actual outstanding instruction reservations. Issuance rechecks the source and reservations inside the original accounting mutation; a stale preview cannot issue.

The customer authorizes the payment in their wallet. Record the returned transaction in the same request, then use **Inspect and receive**. The original Stellar verifier checks network, destination, asset, exact native amount and memo. Public-network verification creates the existing commercial receipt and optional dated allocation. Test-network receiving retains its original test observation. Original provider verification, transaction deduplication and receipt conservation are unchanged.

A schedule selection records the purpose of the original instructions. Actual invoice allocation still follows the original financial ledger: payments after the schedule baseline cover the earliest installments first, and later credits reduce the latest installments first. Out-of-order wallet returns therefore do not rewrite the agreed schedule or invent an installment-specific cash ledger.

A later allocation or credit that reduces a selected row below its original instruction amount marks that instruction for review and suppresses its current wallet action, even when the invoice still has another outstanding balance. The current-status check includes other same-network reservations while excluding that exact request from double counting. Actual returned transfers continue through the original receiving/accounting path.

A successor schedule makes an older selection historical and removes its current wallet action in the operator. The original request, downloaded URI, transaction history and any actual payment remain retained. Withdrawal does not invalidate an already distributed URI on the Stellar network; the original receiving workflow continues to account for actual matching transactions according to its time rules.

## Current selection and exact proposal

Read `GET /api/receivables/invoices/:invoiceId/payment-plan-collection?planId=...&editionId=...&network=stellar%3Apubnet`. The response returns `collection` and the original accounting `revision`. Each row includes scheduled amount, paid, credited, remaining, reservedInstructions and availableInstructions. `otherInstructions` names original requests requiring review.

Add this optional field to the existing payment-preview input:

```json
{
  "paymentPlan": {
    "planId": "ORIGINAL-PLAN-UUID",
    "editionId": "ORIGINAL-EDITION-UUID",
    "installments": [
      {"id":"first","amount":"100.00"},
      {"id":"second","amount":"50.00"}
    ]
  }
}
```

Use the actual UUIDs and original installment IDs returned by the source desk. Keep the complete returned proposal and reviewSha256 for the existing create operation. An explicitly supplied invoiceAmount must equal the selected sum. Existing invoice-only inputs preserve their previous shape and behavior.

HTTP client: `paymentPlanCollection(invoiceId,{planId,editionId,network})`, followed by the original `previewPaymentRequest`, `createPaymentRequest`, `reportPaymentReturn` and `receivePaymentRequest`.

Native MCP: `merchant_accounting_receivables_payment_plan_collection` with workspace, invoiceId, planId, editionId and network. The original payment_preview accepts paymentPlan; payment_create receives the exact original reviewed proposal. The typed native client exposes `paymentPlanCollection`. The original native CLI accepts `payment-plan-collection` through its existing operation map and private input/output handling.

Local command:
```sh
starforge receivables payment-plan-collection --directory /private/accounting --invoice UUID --input /private/schedule-selection.json
starforge receivables payment-preview --directory /private/accounting --invoice UUID --input /private/actual-wallet-terms.json --out /private/review.json
```

The selection file contains planId, editionId and network. Continue the original payment-create/return/receive commands with their original actor, requestId and accounting revision. Keep the same request when reconciling a lost response.

## Full delivery and receiving

The existing merchant-payment-plans and merchant-receivables selections collect this additive import graph. They retain the same Applications provider, accounting lease, source configuration, customer identities, browser assets and backup/export/restore route. No parallel financial database or writer is introduced.

The new source course runs the actual original invoice normalization, immutable schedule compilation, wallet proposal compilation and ledger projection. It retains the full original worked invoice, both schedule editions, two request proposals, overlapping-instruction rejection, payment/credit projection, successor-edition rejection and whole-source JSON reopening. It is a financial-source execution; the optional native receiving continuation uses an actual original workspace and actual provider return.

Run `runInstallmentCollectionCourse()` from `payment-plans/collection-exercise.mjs` under the selected installed Node runtime and retain its complete JSON. The original native owner should then operate the saved plan→invoice link on desktop and 390-pixel width, select/partially collect rows, switch networks, edit/review/issue, reopen the saved request, download every original request artifact, and restore the same accounting backup. Use actual original wallet return data for the provider receiving portion. Preserve the native request IDs, current workspace and existing receiving operation throughout.

Grant relevance: this completes an ordinary merchant collection journey from agreed installment terms to a wallet-authorized Stellar payment and original accounting allocation. It keeps commercial value distinct from native asset quantity, preserves invoice and customer records, and exposes the same complete operation through the operator, typed client, local CLI and MCP.

## Original native continuation entry

The installed export `./merchant/payment-plans/collection-receiving` exposes `receiveInstallmentCollection`. Supply the existing original receivables and payment-plan clients/controllers, explicit selection and actual wallet terms, one actor/operationId, and the owner's existing durable `load(name)`/`save(name,value)` case callbacks. The operator owns the original lease, server, backup and restore lifecycle.

The selection contains invoiceId, planId, editionId and the complete selected installments. Terms must include an explicit stable payment-request UUID plus the actual network/asset/destination/native amount. The continuation retains that whole input, original plan, exact preview, each prepared native mutation and complete result before advancing. The original issue is replayed through its existing journal. Lost responses reuse the same original request; a changed source still needs a new ordinary review instead of a silently altered saved payload.

Without a supplied actual wallet return, its state is REQUEST_ISSUED_AWAITING_WALLET. To continue that same case, supply returned.transaction and the actual original payer/allocation choices. It invokes the original report/receive methods and retains their actual statuses. Its state reports the latest actual observation, or PAYMENT_RECEIVED when that original return has a recorded receipt. Every original customer HTML/JSON/URI, current status, complete receiving history and transaction proof is copied in full with byte/hash identity. The whole plan and request are reread after the operation.

The native owner then uses the existing accounting backup and original cold restore, reopens the same plan/request and compares these complete retained documents. This continuation deliberately accepts the existing original clients and case writer rather than constructing another accounting workspace.

### Following verification of the same wallet return

`receiveAttempt` defaults to `first`. Keep that exact attempt when recovering a lost response: its prepared native request ID and completed original observation are reused. If the original provider returned NOT_FOUND, VERIFICATION_UNAVAILABLE or another observation that needs a subsequent check, choose an explicit following key such as `second` on the SAME operationId, issued request and wallet return. The key permits 1–24 letters/digits/underscores/hyphens, keeping the full native request ID within 160 characters. Each attempt retains its own complete request and result; earlier observations remain untouched. This continuation changes no issued proposal and never reissues the payment request merely to inspect a transaction again.
