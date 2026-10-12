# Buyer allocations through QuickBooks and back

This workflow takes an original issued buyer period through the existing accountant workspace, QuickBooks company/chart selection, explicit journal review, native response reconciliation and the original buyer bookkeeping return. Expense and credit allocations retain their source identity throughout. It uses the same QuickBooks plan, response, posting and accountant-return controllers as the merchant path.

The application supports the source workflow. A source publication, syntax check or saved draft does not mean a QuickBooks posting or customer commissioning has occurred. Actual receiving uses the original configured workspace, company and receiving operation.

## Start with the retained issued source

Finish the original buyer allocation/review process and issue the period. Use that edition's **Export source to accountant** action. Its `stellar-forge.buyer-accountant-source.v1` file contains the closed, reviewed edition and complete original allocations. Preserve the exact bytes and SHA256.

Open the existing buyer accounting application or the Accountant page, select that issued source, inspect its period and native totals, and create the original handoff. The handoff keeps `original-buyer-source.json` unchanged. A workspace initialized from a buyer source reopens from its retained startup source; it does not need a merchant outbox or a synthetic merchant report.

The source includes expense and returned-credit allocations, the original buyer workspace and close, source/coding line identities, native network and asset, exact atomic units, original economic amount, recognition date, cost center, project and account code. A returned credit remains a positive allocation of the original returned units. Its sign and book-account direction are not inferred from a merchant-sale convention.

The handoff can contain up to 22,000 original allocation lines. The original source parser checks closed-period review, allocation limits and native totals before this workflow can use it. Any period correction continues through the buyer's existing reopen/review/issue process.

## Select the original QuickBooks company and chart

Open **QuickBooks** at `/qbo.html` in the same accounting application. The buyer navigation exposes the original Connections, QuickBooks, Xero and Chart source changes pages.

Use the original Connections workflow for authorization and reviewed company/chart capture, or the existing QuickBooks native company import. Select the exact realm ID, sandbox/production environment, company name, home currency and retained chart. Company source inputs retain the complete original CompanyInfo, Preferences and Account response text and hashes.

The normalized source is `stellar-forge.quickbooks-company.v1`. An independently edited account list does not replace it. The original compiler chooses actual eligible accounts from the retained source and rejects unavailable or unsupported accounts.

This journal compiler uses the existing two-decimal home currencies USD, CAD, EUR, GBP, AUD and NZD. Every included amount is a positive decimal string with at most two decimal places and at most 999999999.99. Each allocation creates one debit and one credit line for the same reviewed amount.

## Decide every allocation

Load the saved buyer handoff and current accountant parent. The page displays original allocation facts separately from the home-currency journal values. Every allocation starts with or retains an explicit decision:

| Decision | Required operator input | Result |
| --- | --- | --- |
| Include | Positive home-currency amount, distinct eligible debit/credit accounts, valuation note and optional line description | One debit/credit pair in this journal |
| Exclude | A nonempty reason | A retained plan exclusion; no journal lines and no change to the source's accountant fields |
| Pending | No decision yet | The journal cannot be prepared |

The bulk exclusion action applies only to the displayed count of still-Pending allocations and requires an entered reason. It preserves every earlier decision and amount. A refreshed source that makes an existing Include ineligible remains visibly blocked; the operator must make an explicit decision.

Include between 1 and 500 allocations in one journal. A plan containing only exclusions is rejected. Every other original allocation still needs an explicit reasoned exclusion, so the saved review accounts for the complete issued source.

An allocation already marked BOOKED or EXCLUDED by the original accountant return cannot be included. An allocation with zero original native units must be excluded. A fee or another economic item requires its own original source rather than an invented amount attached to a zero allocation.

Enter a common valuation basis and tax-treatment explanation, and a valuation note for every included allocation. These are required nonempty text, each at most 2,000 characters. The compiler never chooses an exchange rate, token price, tax allocation or credit-account reversal.

The source's native atomic amount remains unchanged even when the home-currency valuation changes. Review expense and credit debit/credit directions explicitly with the selected chart. The original JournalEntry limits remain: this path does not add customer/vendor-required account treatment, tax lines, class/department fields, home-currency adjustments or implicit currency conversion.

### Development and production

Sandbox receiving may use an original development/testnet buyer edition. The source context stays visible and retained.

Production requires every included allocation to retain the original operational public-network source, a matched transfer and its 64-character observation hash. A development source, an unresolved source or an unproven transfer cannot be relabeled by changing the QuickBooks environment. A sandbox response is not evidence of a production posting.

## Preview, retain and review the original plan

Keep a stable original plan UUID and creation timestamp. Preview the complete source/decisions with the current accountant parent and company snapshot. The native preview returns the sealed plan digest and original workspace revision. The page shows included allocations, exclusions, line mappings and valuations.

Create that exact preview using its plan UUID, digest and revision. The saved plan has `sourceKind: "buyer-expense-period"`, the original buyer source metadata, included allocation facts, complete exclusions, valuation basis and original JournalEntry bytes.

The next explicit **Review** step verifies the retained plan and reserves its included sources within the same QuickBooks realm and environment. Other REVIEWED or BOOKED buyer plans in that company cannot silently reserve the same original source lines. Across later issued editions of the same buyer workspace, the original economic identities prevent duplicate reservation of the same expense or credit. These checks use the existing `qboPlans` records.

The reservation is company/environment specific and does not coordinate independent Xero or external books. Keep one intended posting path for the economic source and reconcile existing bookkeeping references before choosing another system.

The original review and export rules remain in force. Creating a draft does not post it. A review does not itself post it. An unused DRAFT or REVIEWED plan can be cancelled only through its original explicit cancellation controls and only before any native attempt or received response.

## Native posting, returned responses and uncertain outcomes

Use the original QuickBooks posting preview and confirmation for a reviewed plan. It binds the configured company, plan/request hashes, current accountant parent, posting UUID, timestamp and workspace revision. The original native controller retains that request before provider activity.

If a reply is lost, open the same plan and inspect its original `nativePost`, attempts and received files. Resume that original posting ID through the existing control. Do not create another journal or source-change successor to work around an uncertain provider outcome.

The existing imported-response path is also available when an original native QuickBooks response was obtained outside the connected post action. Preview the exact original JSON bytes, realm and current parent, then retain the matching result with the same response ID and source digest. A response can be at most 8 MiB.

The validator checks the original realm, plan reference, date, document number, currency, accounts, posting sides, amounts, descriptions, line count and unsupported tax/adjustment fields. It keeps the real JournalEntry ID and SyncToken. A retained Fault remains a Fault; it does not book allocations.

A matched result feeds the original accountant CSV engine. Only the four existing bookkeeping fields of included allocations are changed: status, book reference, account reference and note. The reference uses the actual QuickBooks realm and JournalEntry ID. Original source columns and plan exclusions remain unchanged.

If the native response is retained but its accountant return is PENDING, resume that same response/return. Its original result bytes and return identity are sufficient; another provider call or fabricated response is unnecessary.

## Return to the buyer and reopen

From the saved accountant return, download the original `buyer-return.json`. It contains the buyer handoff, exact original source bytes and complete retained accountant revision chain.

In the original issued buyer edition, open **Bookkeeping returns**, inspect that packet against the buyer's own issued source, review any already accepted handoff overlap, then save through its original acceptance command. A later packet must extend the already accepted chain. Overlapping handoffs require the existing explicit supersession decision.

The buyer receives bookkeeping references and review status. It does not change the issued native expense/credit units, allocations, recognition dates or closed snapshot. Preserve the original issued source, accountant packet, QuickBooks response, buyer-return packet and complete original project backup.

Use the existing operating backup/recovery workflow for the accounting workspace. Close its original controllers and Store through the normal application lifecycle, retain the complete backup, reopen the same workspace and inspect the same handoff, plan, posting, response and return IDs. Do not restore an older state to resolve an unknown recent commit.

### Packet and commit recovery

The original Store marks a save whose durable outcome is uncertain as `WORKSPACE_COMMIT_UNKNOWN`, with `outcomeUnknown` and `reopenRequired`. A rename may have completed before a later directory sync failed. Subsequent mutations, including queued work on another accounting page, remain blocked until the original workspace closes and reopens.

Handoff and accountant-return packet creation retains a request-bound intent, original creation time, each exact member, manifest and completed TAR bytes. It never removes canonical packet files after a commit may have occurred. A same-request continuation can reuse only matching bytes. Input objects are captured before joining the original mutation queue.

A legacy orphan packet without an intent is compared against the complete intended members before a new intent can be written. A different request cannot claim that directory. Incompatible older partial packets or manifests remain preserved for their original recovery; the new code does not overwrite or silently repair them.

## Change the company chart for an unused plan

Open **Chart source changes** and select an actual unused buyer QuickBooks plan with its retained historical company snapshot. Choose a reviewed new edition of that same company's chart. Compare the original account IDs and changed company fields.

The successor starts with the original included allocation set and original exclusions. All exclusion IDs and reasons are fixed. Staff can review eligible replacement accounts, explicit values, valuation notes, common valuation basis and descriptions. The backend recompiles through the same buyer-aware QuickBooks compiler and verifies that the complete source facts and economic set are unchanged.

Retain the exact successor preview, then explicitly approve cancellation of the unused predecessor and creation of that exact successor. The coordinator retains the cancellation intent and successor UUID before calling the original methods. If cancellation succeeded but creation has not, resume the same linked operation; never uncancel the predecessor or invent another successor ID.

The new QuickBooks successor is a DRAFT. Continue its original review/posting/response/return flow. Attempted or posted plans stay in their existing native reconciliation and cannot be replaced.

The full source-change handoff and stopped-workspace CLI include this buyer QuickBooks path. See [SOURCE_CHANGES.md](SOURCE_CHANGES.md) for exact request schemas, phases, complete download and backup/reopen.

## SDK, HTTP and existing agent tools

The native compiler and projection have adjacent declarations at `accountant/qbo.d.mts` and `accountant/qbo-buyer.d.mts`. Source/revision inputs are validated by the original accountant engine. The declaration describes typed plan output and source decisions; it does not bypass the original runtime checks.

```ts
import {createQboPlan} from "../accountant/qbo.mjs";
import type {QboBuyerSelection} from "../accountant/qbo-buyer.mjs";

const rows: QboBuyerSelection[] = [
  {
    rowId: actualIncludedRowId, decision: "include", amount: "125.00",
    debitAccount: {value: actualDebitAccountId},
    creditAccount: {value: actualCreditAccountId},
    valuationNote: reviewedAllocationValuation,
    description: reviewedDescription
  },
  {rowId: actualExcludedRowId, decision: "exclude", reason: reviewedExclusionReason}
];
// Include one decision for every original allocation, not only these two examples.
const plan = createQboPlan({
  handoff: originalHandoff, revision: originalAccountantParent,
  id: retainedPlanId, createdAt: retainedCreationTime,
  name: reviewedName, actor: originalOperator,
  realmId: originalCompany.realmId, companyName: originalCompany.companyName,
  baseCurrency: "GBP", environment: "sandbox", txnDate: reviewedPostingDate,
  companySnapshot: originalCompany, valuationBasis: reviewedCommonBasis, rows
});
```

Use the actual validated company home currency and environment rather than copying the example values. This pure compiler call creates no files and performs no provider operation. Workspace persistence/review/posting still go through the original controllers.

The existing listener retains its host/origin checks and `X-Workspace-Request: 1` header. Relevant original routes are:

| Action | Route |
| --- | --- |
| Read handoff/current parent | GET /api/qbo/handoffs/:id |
| Preview original journal | POST /api/qbo/preview |
| Save original draft | POST /api/qbo/plans |
| Review unused draft | POST /api/qbo/plans/:id/review |
| Preview or execute native post | POST /api/qbo/plans/:id/post/preview or /post |
| Resume original native post | POST /api/qbo/plans/:id/post/resume |
| Preview/retain native response | POST /api/qbo/plans/:id/responses/preview or /responses |
| Resume retained response/return | POST /api/qbo/plans/:id/responses/:responseId/resume |
| Download buyer return | GET /api/accountant/handoffs/:id/download/buyer-return.json?revisionId=:returnId |

The host-declared QuickBooks journal source used by the original accounting MCP tools contains the same complete rows and valuation basis. `merchant_accounting_qbo_handoff`, `merchant_accounting_qbo_preview`, `merchant_accounting_qbo_create`, review/post/response tools and accountant-file tools preserve their original identities. Page the full source and retained plan/exclusion views before approving; compact counts are not a complete accounting review.

The original agent client/CLI and source-change tools call these same controllers. Host file aliases and OAuth stores remain private configuration. The buyer source and return packet carry no new credential or consent.

## One receiving continuation

Commissioning consumes an actual original issued buyer source and configured QuickBooks receiving company in the already owned accounting operation. It follows source import → explicit decisions → native preview → saved/reviewed plan → original native result → accountant return → buyer acceptance → full backup/reopen. It also exercises an actual unused-plan chart update when the owner has an eligible predecessor.

A previously posted receiving plan is preserved and inspected through its original history. It is not repurposed as the unused predecessor. Source-only validation and API review are recorded separately from actual company/provider results.
