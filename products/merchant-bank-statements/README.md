# Bank statements and cash reconciliation

The bank desk connects original OFX, QFX and explicitly mapped CSV statements to the merchant workspace's existing customer receipts, invoices and refunds. It retains the original files, reviews overlapping transactions and corrections, records exact split postings, and saves a balanced close with a complete accountant handover.

Open **Bank statements** from Receivables, launch **Bank statement reconciliation** in Applications, or run:

~~~sh
starforge bank-statements serve --directory /private/accounting --port 8448
~~~

The application opens at http://127.0.0.1:8448/bank-statements/ and uses the original accounting directory, identity, lease, state revision and request journal. The same service continues to provide Receivables, customer statements and payment plans. Original source paths remain attached to the existing accounting workspace.

## Receive the actual source

Choose the complete original file and its declared format. OFX and QFX use the original financial institution, account identity, currency, posted dates, signed amounts and native transaction identifiers. The preview presents every account section for explicit selection. An account is bound to one exact source identity and one currency with an explicit decimal scale.

For CSV, specify the delimiter, header record, columns, date order, decimal/group separators and signed or separate debit/credit amounts. Map or supply the original account identity and currency. Native identifiers, reference, payee, memo, cheque number, statuses, corrections and balance columns can be mapped. If a status column is selected, provide the exact source values identifying posted and pending entries. Refer to [SOURCE_FORMATS.md](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/SOURCE_FORMATS.md) for all supported native fields, encodings, original byte offsets and CSV source conventions.

Review the preview, create or select its account, then receive the selected account section. The writer verifies the complete source/mapping review hash inside the original workspace transaction. It saves the exact original bytes and the complete parsed report before committing the import. Both files are downloadable from the imported source.

A repeated original file/account/interpretation returns the saved import. To correct a CSV mapping, retain the same original bytes and select the previous import with supersedesImportId. Changed or removed source records appear as reviewed interpretation replacements/removals; previous matches and closes remain until their ordinary correction workflow is completed. An unchanged native transaction ID in the same financial institution and account links to the original transaction. Different files without native IDs produce explicit overlap candidates. Two legitimate identical rows in one CSV remain distinct transactions. Source records, duplicates, pending observations and selected exclusions remain available in the handover.

**Download coverage and statement closing dates have separate meanings.** OFX DTSTART/DTEND download cursors do not supply an opening/closing cash period. Select a complete original CLOSING/CCCLOSING balance pair or mapped CSV balance cells when present, or enter the original statement's dates and balances with its source explanation.

## Continue the same payment across both bank screens

Receivables includes **Bank receipts** for assigning imported cash credits and **Bank statements** for reconciling the complete cash account. Both screens use the same original receipts, allocations, saved request journal and accounting transaction.

When receiving a statement, the application binds its financial institution, branch, account and currency to the original receipt-intake account. An exact existing account is reused. When several existing accounts match, select the original intake account explicitly in the source form; the saved binding then remains stable.

A receipt already linked in either screen appears as a source-linked suggestion in the other. Repeating the same native bank transaction or the same retained CSV row adds its source link to the existing payment. Different physical CSV rows remain distinct payments even when their dates, references and amounts match. An aggregate payment can cover several source credits; the screens show each covered portion and the remaining unmatched amount.

For a gross customer payment of 100.00 received as 97.00 after a 3.00 fee, the original receipt remains 100.00 and the bank posting retains the signed fee of -3.00. Bank receipts shows the original gross amount and saved adjustment when linking that statement. It creates a source link to the original receipt and preserves its invoice allocation.

Correct the original covered payment through the reviewed receipt-intake correction. Its unchanged portions retain their receipt lineage and allocation history. A prior bank close then identifies the changed receipt. Reopen the close, undo its affected matches, apply the reviewed statement correction and match the current receipt portions before retaining the replacement close. Each saved close keeps its original downloadable bytes.

Credit policies, invoice approvals, collection cases and cash-planning editions continue through their existing Receivables controls. The CLI includes both the original bank-receipt commands and the bank-statements account-reconciliation command.

## Match customer cash and accountant postings

The transaction table supports all-row pagination, account/status filters and exact original source inspection. Select an unmatched posted transaction and review its candidate customer receipts or refunds. Suggestions preserve the original record IDs and remaining unmatched amounts; choosing a suggestion is an explicit operator action.

Each nonzero transaction has one or more exact signed posting parts. An original zero-amount record can be confirmed with a reason and no cash postings; it remains visible in the complete statement and close.

The supported parts are:

| Kind | Entry |
|---|---|
| Receipt | A positive amount against an existing original customer payment |
| Refund | A negative amount against an existing recorded commercial refund |
| Fee | A negative bank or processor fee, with explanation and optional accounting code |
| Expense | A negative expense with its source explanation |
| Income | Positive non-receivable income |
| Interest | The bank's signed interest amount |
| Transfer | Signed movement with the counterpart account or transfer reference |
| Capital | Signed owner/equity movement with its explanation |

Posting parts must add exactly to the signed source transaction. Matches across accounts cannot exceed the original customer receipt or refund amount. Receipt matching uses the original gross receipt: its separately recorded refunds remain negative cash movements with their own matches.

For a new customer payment, select **Record customer receipt**. Supply the customer, gross payment and any processor fee. The gross payment less the fee must equal the bank credit. The original receipt writer records its retained bank provenance. If an invoice is selected, the original allocation writer applies the selected amount in the same transaction.

For example, a 97.00 bank deposit may represent a 100.00 customer receipt and a -3.00 processor fee. The receipt can satisfy a 100.00 invoice while the exact bank movement remains 97.00. Existing dated customer/invoice/currency conservation and refund checks continue to apply.

Fees, expenses, income, interest, transfers and capital are accountant posting classifications in this reconciliation. Their exact parts, descriptions and chosen accounting codes are included in the posting export. Receipt creation and invoice allocation use the existing financial ledger.

## Correct an import and preserve the original close

A changed native transaction identity or a native correction appears in source review. A native REPLACE/DELETE identifies its original bank transaction; a CSV overlap can be linked to its original or explicitly accepted as a distinct transaction.

The correction workflow is:

1. Open the original source record and compare its exact account, date, amount and native IDs.
2. Reopen any saved bank period covering the affected transaction.
3. Undo the original bank match. If the source created a customer receipt that must be replaced, release its original allocations and void that receipt through Receivables.
4. Apply the reviewed source correction or duplicate decision, retaining the reason.
5. Match the resulting current transaction and retain a replacement close.

Undo retains the original match history. Reopening creates a separate event. A replacement close links its previous close. Earlier report, source, customer-account and manifest bytes remain available unchanged. Opening a retained close also recalculates its current bank and original customer records, showing new transactions, changed records, unresolved items and the current difference beside the saved edition.

Foreign-currency TRNAMT values retain their native currency and original conversion fields. The bank desk asks for an explicit account-currency valuation and explanation before matching an unconverted foreign-currency movement. It preserves the original amount, source rate and reviewed valuation. The sign must continue to represent the original debit or credit.

## Retain a balanced close

Select the original account, inclusive source calendar dates, opening balance and closing balance. The opening balance is the balance immediately before the period's included transactions; the closing balance is the balance after them. A selected complete source balance pair fixes those values to the original record.

The preview calculates:

~~~text
opening balance + posted credits - posted debits = calculated closing balance
~~~

It shows the exact difference from the statement closing balance and every unresolved source or matching item. All current posted transactions in the period must be matched or classified, every match must conserve its source amount, and the difference must be zero. Adjacent closes compare their opening/closing continuity. An overlapping active close is reopened before its replacement is retained.

A merchant recorded-activity close may be linked by its original ID. Its run, period, export and close fingerprint remain separate from the bank cash calculation.

Review the complete preview and retain it with its review hash. The saved handover contains:

- The full reconciliation JSON and readable HTML.
- Every transaction and its inclusion status in CSV.
- Exact accountant posting parts in CSV.
- Editable reconciliation JSON, including original account/source bindings, transaction/correction history, matches, related receipts, refunds, allocations and customers.
- Every participating original statement file.
- Complete original customer account exports for the participating customer records.
- A manifest with each file's exact byte count and SHA256.
- One deterministic TAR containing the complete handover.

Download a single file, the whole archive, or all files into a new private directory:

~~~sh
starforge bank-statements file \
  --directory /private/accounting --kind close --id CLOSE_UUID \
  --name account.tar --out /private/bank-close.tar

starforge bank-statements export \
  --directory /private/accounting --id CLOSE_UUID \
  --out /private/new-bank-handover
~~~

The working bank register remains in the original accounting workspace. Reopen the same directory to continue editing. The existing whole-workspace recovery process preserves that directory and its bank-statements originals/close files together.

## API, typed client and recoverable operations

The HTTP API lives under /api/receivables/bank-statements. The typed client is exported as @tokenjunkielabs/starforge-merchant/merchant/bank-statements/client.

~~~js
import {BankStatementsClient} from '@tokenjunkielabs/starforge-merchant/merchant/bank-statements/client';

const client = new BankStatementsClient({
  baseUrl: 'http://127.0.0.1:8448/api/receivables/bank-statements'
});
const state = await client.state();
const source = {format: 'OFX', file: {name: 'original.ofx', dataBase64: originalBase64}};
const review = await client.previewSource({source});

// Retain this exact request before invoking receiveSource.
const request = {
  revision: state.revision,
  workspaceId: state.workspaceId,
  actor: operatorName,
  requestId: stableOperationId,
  accountId: selectedSavedAccountId,
  statementId: review.statements[selectedAccountIndex].id,
  source,
  reviewSha256: review.reviewSha256
};
const received = await client.receiveSource(request);
~~~

Create/select the account and refresh the workspace revision before preparing the receiving request. Every mutation carries a stable request ID, actor and expected revision. The journal hashes the full intent, excluding only the expected revision. A completed retry returns the same original result IDs. Reusing an ID with different intent is rejected.

If the response is interrupted, recover the original request with getOperation(requestId). An unrecorded operation returns HTTP 404; the caller may then retry the same original body. A stale revision requires a fresh review of the current workspace. The browser retains source bytes and unresolved operation bodies across reloads.

Pure preview routes are /source-preview and /close-preview. Mutation routes create accounts/imports, match or create customer receipts, undo matches, resolve source rows and retain/reopen closes. See [client.d.ts](client.d.ts) for complete request and result types, and run starforge bank-statements help for native commands.

## Runtime and full native receiving

The application uses Node's standard library and the existing merchant modules. The original Bank receipts OFX and MT940 intake also requires Python 3.10 or later and its standard library; those maintained parser files are included in the package. Monetary arithmetic uses exact BigInt minor units through the original currency validator; source values retain their original exact decimal strings. The source parser has no network or library dependencies.

EXERCISE.mjs runs one complete original workspace lifecycle: customer/invoice setup, original refund, OFX receiving, gross/fee receipt and allocation, native duplicates and CSV overlap, distinct identical transactions, balanced close, source correction, replacement close, full file/TAR export, original operation recovery and cold reopen. It also opens the actual original local HTTP service and checks the installed bank/receivables routes.

Primary format documentation is the Financial Data Exchange OFX Banking Specification 2.3 and the original Xero statement-import documentation cited in SOURCE_FORMATS.md.

## Native complete-account exercise

Run the complete private-file application journey with Node 22 or later, Python 3.10 or later, installed Playwright and Chromium. Set SCF_BANK_CHROMIUM when selecting a particular installed Chromium binary:

~~~sh
node stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/EXERCISE.mjs
~~~

It issues an invoice through Receivables, records an existing customer payment and refund, receives original OFX and CSV files through the actual HTTP client, creates a gross payment with a fee and original invoice allocation, reviews a zero-amount entry, reconciles repeated IDs and separate equal transactions, closes against original balances, applies a native fee correction and a same-byte mapping correction, downloads the complete original/customer/accountant archives, reopens the original writer, recovers the first request and exports the same handover through the CLI. Set SCF_BANK_TMP to an existing private writable parent and SCF_BANK_KEEP=1 to retain that complete case and its native-result.json.

The same receiving operation also runs both bank screens against the original ledger: repeated source links with retained fees; a 150.00 aggregate payment split into 60.00, 40.00 and 50.00 bank credits; correction of the original 60.00 portion to 65.00; preserved 90.00 residual payment and original invoice allocations; complete original and replacement 155.00 account handovers. Its browser continuation operates the visible desktop and 390px layouts, recovers an interrupted committed payment after reload, links the same gross payment in Bank receipts, handles subsequent statement and CSV-interpretation corrections, and downloads the actual saved source and close files.
