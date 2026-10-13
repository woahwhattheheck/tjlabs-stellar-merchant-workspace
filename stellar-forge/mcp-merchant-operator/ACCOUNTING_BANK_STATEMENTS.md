# Bank reconciliation through the original Merchant accounting owner

This installed workflow exposes the existing Bank reconciliation desk through authenticated Merchant MCP, a typed client, retained original requests and complete downloads. It uses the original BankStatementsWorkspace inside the same accounting session, with the existing Receivables controller, accounting lease, revision, request journal and receipt/allocation writers.

The older merchant_accounting_receivables_bank_* actions remain the original receipt-intake workflow. The new merchant_accounting_bank_statements_* actions expose the current Bank desk's CAMT/OFX/QFX/CSV source intake, source review, matching, page assembly and balanced close. Their original account/import IDs are deliberately distinct.

## Installed application and connection

The merchant-bank-statements source contribution includes the new command and both typed exports. Build and install the committed product through the existing [bank installation guide](../../products/merchant-bank-statements/INSTALLATION.md). Configure the original Merchant MCP accounting workspace with its existing directory and source settings; use the existing accounting provider and authentication. This contribution adds no listener, credential, ledger or new financial writer.

Declare source paths as existing accounting receivablesInputs aliases. Remote requests name those aliases, never host paths. Inspect the original configuration with merchant_accounting_sources. Only open one writer of the same accounting directory; stop its existing Applications process before opening it through MCP. Ordinary client disconnect drains this caller's file reads; workspace-close explicitly drains and closes the original accounting owner.

~~~sh
starforge merchant-accounting-bank-statements open --url ORIGINAL_MCP_URL --workspace ORIGINAL_ALIAS
starforge merchant-accounting-bank-statements status --url ORIGINAL_MCP_URL --workspace ORIGINAL_ALIAS
~~~

Authentication stays in MCP_ACCESS_TOKEN, or the explicitly selected --token-env variable. Keep actual workspaceId and revision returned by status. Every mutation requires that original UUID, actor and requestId in addition to the optimistic revision.

## Receive the complete original statement

1. Prepare a private JSON input with source.format and the original source.file.name plus dataBase64. Carry its complete explicit CSV/CAMT interpretation. A configured sourceAlias may replace dataBase64 for this inspection only.
2. Run source-preview with --request and --out NEW_PRIVATE_REVIEW.json. This invokes the maintained original parser and returns complete sourceInput with actual resolved bytes, original file SHA, all statement selections and reviewSha256.
3. Select one actual statement and the corresponding original account/currency. For a new account use account-save with its exact sourceIdentitySha256; otherwise retain the existing account ID.
4. Construct source-import with the complete resolved sourceInput, selected accountId/statementId, reviewSha256 and original request context. A changed interpretation of the same bytes carries supersedesImportId explicitly.
5. Prepare and execute that original request. Reconciliation never rereads a source alias.

Native source limits and supported interpretation remain those of the original Bank parser. Current source supports up to16,000,000 bytes and50,000 original rows; the installed MCP transport retains its32 MiB request limit. Complete source previews and parsed import reports can be large; the typed transport allows128 MiB complete replies.

~~~js
import {connectAccountingBankStatementsClient,accountingBankStatementsImportArguments}
  from '@tokenjunkielabs/starforge-merchant/merchant/accounting-bank-statements';
import {prepareAccountingBankStatementsOperation,runAccountingBankStatementsOperation}
  from '@tokenjunkielabs/starforge-merchant/merchant/accounting-bank-statements/operations';

const client=await connectAccountingBankStatementsClient({url,workspace});
try {
  await client.open();
  const inspection=await client.previewSource(originalSourceSelection);
  // These IDs and choices come from the actual inspected source and operator.
  const args=accountingBankStatementsImportArguments(inspection,{
    accountId,statementId,actor,requestId:originalImportRequestId
  });
  await prepareAccountingBankStatementsOperation({
    directory:originalOperationDirectory,url,workspace,kind:'source_import',arguments:args
  });
  const result=await runAccountingBankStatementsOperation({
    directory:originalOperationDirectory,execute:true,client
  });
} finally { await client.disconnect(); }
~~~

The client supports a borrowed original structured MCP call via createAccountingBankStatementsClient({workspace,call}); it does not alter that caller's authentication or routing.

## Full transactions and financial decisions

Use transactions with accountId and optional status/search. Read all pages at one original revision through listAll('transactions',args) or --all true. The original transaction detail includes full source copies, matching candidates and actual receipts/refunds/invoices. Full import detail includes the complete retained parsed report; its original file and parsed.json have exact download selectors.

Prepare one complete native decision at a time:

| Mutation | Original effect |
| --- | --- |
| match | Exact receipt/refund/fee/expense/income/interest/transfer/capital parts against the bank movement. |
| receipt | Original customer receipt with explicit gross amount, fee and optional invoice allocation. |
| undo | Retained reversal of the bank match; financial receipt history is preserved. |
| resolve | Explicit distinct/duplicate/correction/foreign valuation/incomplete source disposition. |
| reopen | Original close reopening and retained reason; prior files remain immutable. |

The adapter never calculates replacement balances or infers cash acceptance. Original native source coverage, duplicate receipt, currency, date, allocation and already-closed-period checks remain authoritative.

## CAMT page assembly and balanced close

Use assembly-preview with the actual accountId and every selected original importId. Review the complete sequence, page count, gaps, boundaries, source amounts and assembly sourceClosing. Carry that exact sourceClosing into close-preview with the reviewed original account period. Operator-entered balances require their explicit original balanceNote.

close-preview returns the full original report plus closeInput. The typed accountingBankStatementsCloseArguments helper preserves that complete input, actual revision, workspace UUID and reviewSha256, adding only the original actor/requestId/name/note. Native close refuses unresolved source rows, posting differences or bank-balance differences.

A close retains its original statement files, complete transactions/postings, related customer source, editable JSON, readable HTML, CSVs and manifest. close-detail returns full current comparison and exact file selectors. Its account.tar is the selected account-close handover. Whole-accounting-directory continued editing and operating recovery remain the original accounting maintenance backup/restore workflow.

## Retain before send and recover the same request

~~~sh
starforge merchant-accounting-bank-statements prepare \
  --dir NEW_PRIVATE_OPERATION --url ORIGINAL_MCP_URL --workspace ORIGINAL_ALIAS \
  --action close --request COMPLETE_REVIEWED_CLOSE_ARGUMENTS.json

starforge merchant-accounting-bank-statements execute --dir ORIGINAL_OPERATION
starforge merchant-accounting-bank-statements reconcile --dir ORIGINAL_OPERATION
~~~

prepare writes the complete request and source bytes before dispatch. execute first looks up the original stable request. If absent it sends at most one mutation call, recording SENDING first. A lost reply causes an original journal lookup. The recovered operation must match native action, actor, workspace UUID and exact original intent SHA, including the native insertion of transaction/close selectors. Revision remains in the prepared request; native replay excludes it from the original intent exactly as the engine does.

A rejected stale business choice needs an explicit new review and new request ID. outcomeUnknown, reopenRequired and commitUncertainty remain with the original saved request. Reopen that same owner through its existing maintenance controls, then reconcile. An absent lookup alone does not authorize a different intent or a second accounting workspace.

The CLI accepts mutations only through prepare/execute. The typed client also exposes direct original actions for callers that already persist their complete requests.

## Complete files and independent receiving

~~~sh
starforge merchant-accounting-bank-statements close-detail \
  --url ORIGINAL_MCP_URL --workspace ORIGINAL_ALIAS \
  --request ORIGINAL_CLOSE_SELECTION.json --out NEW_PRIVATE_ACCOUNT_TAR

starforge merchant-accounting-bank-statements download \
  --url ORIGINAL_MCP_URL --workspace ORIGINAL_ALIAS \
  --selection ORIGINAL_FILE_SELECTION.json --sha256 ORIGINAL_FILE_SHA \
  --out NEW_PRIVATE_FILE
~~~

The existing merchant_accounting_file snapshot reader supplies bounded chunks with unchanged selection/readId/SHA. Every download consumes the full bytes, verifies length through that reader and creates its destination once. Partial snapshots are released. Source imports use kind bank-statements-import with bankStatementImportId and original or parsed.json. Close files use bank-statements-close with bankStatementCloseId and the exact inventory filename, including account.tar.

Open the unchanged close archive in the original [accountant receiving desk](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/accountant-receiving/ACCOUNTANT_RECEIVING.md), then retain its original complete review/export. This new interface changes no archive format and creates no replacement receiver.

## Complete operating inventory

Seventeen actions expose status, source_preview, account_save, source_import, transactions, transaction, import, match, receipt, undo, resolve, assembly_preview, close_preview, close, close_detail, reopen and request_lookup. Status inventories include accounts/imports/closes/reopenings/customers/periodCloses and the complete bank request history. Use a non-summary status view with --all true for full inventory.

The product's existing RD12 saved-workspace and DFF77 original-source receiving courses retain their own operation, input, source and process identities. A native receiving owner can exercise these installed actions on that same original workspace after its previous writer closes, retaining the same reviewed request and downloading the exact existing archive. This source delivery does not claim a second native execution, financial posting, customer acceptance or payment.

Source authority: maintained bank PR1307/f912a1ece05abcfeaa83882dfb86db719fd745da and the original accounting MCP provider; current shared source preimages were rechecked at bd789a86df48d8ff0d3679f5364b684008b351f5 before composition. All original domain engines remain unchanged.
