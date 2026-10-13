# Customer milestone changes

Open **Customer milestone billing**, select the original saved billing schedule and choose **Review milestone changes** on its invoice. A change remains attached to the same source-bound obligation and original accounting workspace.

## Customer amendment to invoice

1. Retain the customer's amendment, approval or change-order file in the existing case Sources page.
2. Select those original files in the change desk. Record the authorization date, interpretation and reason. Enter the revised amount and invoice dates explicitly.
3. Review the original invoice, paid amount, existing credits, revised amount and exact native effects.
4. Save that review. Apply the saved change using its original proposal hash. The server retains each original native request before dispatch.
5. For a draft correction or replacement, review the resulting native invoice separately. The original milestone acceptance or commercial-authorization prerequisites still apply. Complete any native credit-control review in Receivables, then select its current decision.
6. Issue the reviewed invoice. Refresh the linked native records and export the complete customer change.

The four actions have distinct accounting meaning:

| Action | Native behavior |
| --- | --- |
| Correct draft | Updates the same unissued invoice with its expected version. |
| Credit | Issues an additional native credit so that original total less all native credits equals the authorized revised amount. |
| Void | Voids an invoice with no credit notes or unreleased allocations at the selected accounting date. |
| Replace | Voids or fully credits the original, then creates a draft linked through native replacesId. Invoice issue is a separate explicit action. |

Amount-based credit preparation supports the original one-line, zero-tax milestone invoices. For a native invoice whose lines or tax were changed, use Receivables to review and issue the exact line credit, then return to prepare its replacement. Existing payments stay with their original receipts and allocations. Use the original Receivables cash workflow to review a customer credit balance, reallocation or refund.

Purchase-order and invoice-note fields use the original Receivables text rules, including its whitespace normalization and native text-length limits. Earlier saved requests retain their original bytes; comparison with the native invoice uses the native text rendition. The recording operator is normalized consistently when preparing, applying and issuing a change.

The original Workshare and first invoice remain in history. The change records a new customer authorization and its exact financial effect; it does not rewrite the original agreement.

## Recovery and receiving

A lost response keeps the same change, action and native request. Resume the retained action. Native request lookup occurs before its revision guard, so an already completed command returns its original result. A definitive stale-workspace refusal can refresh only the revision of an unchanged reviewed intent. An issue rechecks the same native document/version before refreshing that revision.

An unused preparation may be cancelled, with a reason and original request ID. Once a native action is pending or acknowledged, continue its original recovery.

After a failed apply or issue, the browser reads that saved change's actual journal. It releases its pending action only when the matching native command records a definitive rejection: the unused first apply step, or the exact separately reviewed issue. **Retained rejected actions** keeps the complete original request, error and native refusal, with an individual download; the whole desk download carries this history as well. Refreshing or reopening the same desk performs the same readback. A pending command, a different invoice review and a partially applied replacement keep their original pending action. The desk sends no replacement command during that readback.

**Download complete desk** preserves entered source selections and the original pending request. **Open complete desk** accepts that same case, billing and milestone. Staff identity checks remain active. The desk does not automatically send a pending operation when opened.

The Operations case export includes all changes, authorization file bytes, reviewed issue evidence and native request journals. Import joins the exact original prepared schedule and source identity before accepting the change chain. Receiving an older case cannot erase a completed native acknowledgement. A conflicting branch is rejected.

**Export complete change and account** includes the original commercial archive, full change chain, authorization files, issue-acceptance files, current native account archive and every linked immutable invoice/credit document. Explicit document copies retain postdated replacement invoices even when the native account's current dated totals exclude them.

## HTTP

All routes use the original authenticated Operations server and staff scope.

- GET /api/operations/{case}/commercial/{billing}/milestones/{milestone}/changes
- POST the same path with /preview or /prepare
- GET /api/operations/{case}/commercial/changes/{change}
- POST the same path with /apply, /cancel, /refresh, /preview-issue or /issue
- GET the same path with /export.zip

Preview input includes expectedVersion, previousChangeId (null for the first change), actor, sourceIds, mode, targetAmount, effectiveDate, authorizedOn, reason and authorization. Optional fields are resolution (VOID or CREDIT), issueDate, dueDate, description, purchaseOrder and note. Preparation adds requestId and expectedPreviewSha256.

Apply uses actor and expectedProposalSha256. Cancel adds requestId and reason. Issue uses actor and expectedIssuePreviewSha256, plus creditDecisionId when native credit control requires it.

## Headless and managed operation

The original Operations CLI exposes commercial-change-list, preview, prepare, show, refresh, apply, cancel, preview-issue, issue and export. All commands require --case. List/preview/prepare select --billing and --milestone; other commands select --change. Mutating requests and the source preview use --file for complete JSON. Export requires --output.

The existing typed Grant client exposes commercialChanges, commercialChange, commercialChangePreview, commercialChangePrepare, commercialChangeApply, commercialChangeCancel, commercialChangePreviewIssue, commercialChangeIssue and commercialChangeRefresh. Its download('commercial-change', {caseId, changeId}) uses the complete original customer export.

The existing Merchant Grant tools expose the same flow as commercial_changes, commercial_change, commercial_change_preview, commercial_change_prepare, commercial_change_apply, commercial_change_cancel, commercial_change_preview_issue, commercial_change_issue and commercial_change_refresh. Use the existing Grant export with kind commercial-change, caseId and changeId for complete receiving.


## Native refusals and revised issue decisions

The desk marks a financial command rejected only for action-specific native
precommit errors read from the original invoice writer, credit normalizer or
credit-control `checkIssue` implementation, plus its original
`STALE_WORKSPACE` guard. Generic validation/status codes, timeouts, file errors,
lost responses and uncertain durable commits keep the original command pending.

A declined issue remains in the applied change's journal. If its document and
decision are unchanged, resume that exact request after the native prerequisite
is restored. If the merchant selects a different credit decision or changes the
terms, prepare the next source-backed **draft correction** against that same
native draft. Retain the previous change, customer authorization and rejected
request; review the new draft and its current native credit assessment before
issuing. A partial replacement whose earlier credit or void already succeeded
continues its original remaining step.

## Operate and inspect the exact outgoing product

Use the original saved customer account and case in the complete receiving
programme. Run the exact outgoing source, operate the correction controls,
review native documents and download the complete change/account and case
exports. Open the same exported case in a fresh receiving workspace and compare
the original invoice, credit, request, customer and source identities. Exercise
the lost-response and declined-issue continuations against that original writer.

The producing peer must look at the actual rendered desktop and 390-pixel phone
images for the main desk, prepared change, applied native result and issue review;
also operate a meaningful declined/pending state. Check source text, amounts,
controls, wrapping and export/reopen behavior, then fix observed product defects
in the same implementation. Record the source edition and inspected views with
the complete saved customer case.
