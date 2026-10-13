# Original bank statement intake

This module reads bank-issued OFX/QFX and CAMT.053 XML files and explicitly mapped CSV exports into a complete, reviewable source report. The merchant reconciliation workspace retains the original bytes and then binds a selected source account to its existing cash, receipt, refund and allocation records.

## Operator workflow

1. Export the account's statement file from the bank and upload the original file. Use OFX or QFX when the bank offers it. For CSV, choose the delimiter, logical header record, original account identity, currency, date layout and amount columns.
2. Review every account section returned by the reader. A file can contain several accounts or several statement responses for one account. Select the account and statement needed for this reconciliation.
3. Retain the report and original file together. Keep its file SHA, statement ID, account identity and row source location with each reviewed transaction.
4. Review errors and overlap candidates. Missing CSV IDs leave rows distinct. An exact repeated amount/date/payee is a candidate for review; it does not establish that one of two payments should disappear.
5. Select the original opening and closing balance evidence, or enter the period and balances with a source note in the reconciliation screen. Review bank corrections before completing the close.

The bank formats distinguish posted transactions, pending items and actual closing information. FITID belongs to a financial institution and account. An OFX transaction's amount sign is authoritative. Download DTSTART/DTEND describes download coverage, with an exclusive end; a late-posted transaction can predate that coverage. CLOSING/CCCLOSING carries separate opening and closing balances. CURRENCY retains an amount in the named currency, while ORIGCURRENCY accompanies an amount the bank already converted. Pending items remain outside posted ledger reconciliation. These rules follow the [FDX OFX Banking Specification 2.3](https://financialdataexchange.org/wp-content/uploads/2025/12/OFX-Banking-Specification-v2.3.pdf), sections 3.2.3, 3.2.7–8, 5.2 and 11.3–11.5.

## Original file input

The API uses an explicit file format and one original-content representation:

~~~js
import { readBankStatementSource } from './source.mjs';

const report = readBankStatementSource({
  format: 'OFX',
  file: {
    name: 'business-current-account.ofx',
    dataBase64: originalBytes.toString('base64')
  }
});
~~~

The equivalent text interface is:

~~~js
{
  format: 'CSV',
  file: { name: 'statement.csv', content: originalUtf8Text, encoding: 'utf8' },
  csv: { /* complete mapping below */ }
}
~~~

For a base64 string in a generic file form, use content plus encoding: 'base64'. Provide exactly one representation. Original bytes must be complete standard base64, with canonical padding. The reader accepts up to 32 MiB and 100,000 transaction records; the installed receiving workspace may impose a smaller request or retained-workspace limit.

A non-UTF-8 bank file should arrive through dataBase64. UTF-8, ASCII, Windows-1252, ISO-8859-1 and UTF-16 LE/BE are supported. The reader honors the original BOM and encoding declaration; conflicting choices produce a useful input error. UTF-16 files need valid complete code units. Unsupported encodings can be converted in a separate source-preserving adapter, retaining the original file and an explicit conversion record.

OFX 1 uses the original OFXHEADER/VERSION declaration and tolerates its omitted scalar closing tags. OFX 2 uses complete XML structure. QFX is accepted through the same native banking structure. The parser retains unknown original fields and rejects malformed markup, duplicate required fields, DTD/entity declarations and incomplete source. It does not fetch referenced resources or execute file content.

## CAMT.053 XML statements

Use `format: 'CAMT053'` for an original `camt.053.001.02` or `camt.053.001.08` file. The original namespace chooses the structure; optional `camt.messageVersion` must match it. `camt.detailPolicy` preserves original entry amounts by default and can additionally check transaction-detail amounts stated in the entry currency.

The complete [CAMT.053 operator and integration guide](CAMT053.md) covers original XML upload, command-line preparation, message/statement/entry fields, posted/pending/information entries, reversal and charge meaning, exact source references, original balances, pagination and close. Its complete original-source receiving uses the bank-issued Nordea standard and extended examples.

```js
const source = {
  format: 'CAMT053',
  file: {name: 'statement.xml', dataBase64: originalBytes.toString('base64')},
  camt: {detailPolicy: 'PRESERVE_ONLY'}
};
```

Prepare a complete request directly from the original file with
`starforge bank-statements prepare-source --file /private/statement.xml --format CAMT053 --out /private/source.json`.
The existing source preview and reviewed receiving methods consume that request.

## Explicit CSV mapping

~~~js
const report = readBankStatementSource({
  format: 'CSV',
  file: { name: 'account-january.csv', dataBase64: originalBytes.toString('base64') },
  csv: {
    delimiter: ',',
    headerRow: 1,
    dateFormat: 'DMY',
    decimalSeparator: '.',
    groupSeparator: ',',
    amountMode: 'SIGNED',
    account: {
      bankId: 'bank-routing-or-institution-id',
      accountId: '00123456',
      accountType: 'CHECKING',
      currency: 'USD'
    },
    columns: {
      postedDate: 'Date',
      amount: 'Amount',
      providerId: 'Transaction ID',
      payee: 'Description',
      reference: 'Reference',
      balance: 'Balance'
    }
  }
});
~~~

Column names must match exactly after outer whitespace is trimmed. Alternatively, specify one-based column indexes. Index selection allows an operator to resolve an original file with repeated or empty headers explicitly. The same column cannot represent two distinct fields.

headerRow counts logical CSV records, so a quoted multiline field remains one record. Original preamble, header, blank records, selected exclusions and line endings remain in the source report. The reader handles quoted separators, escaped double quotes, embedded newlines and comma, semicolon, tab or pipe delimiters.

Date layout is explicit:

| Selection | Examples |
| --- | --- |
| YMD | 2026-01-31, 2026/01/31 |
| DMY | 31/01/2026, 31.01.2026 |
| MDY | 01/31/2026, 01-31-2026 |

A four-digit year is required. The reader validates the calendar date, including leap years. CSV date columns contain calendar dates; the reader does not guess timezones or remove time portions from a datetime column. Use an original bank date column or a separate documented source adapter for a different datetime representation.

Amounts retain exact decimal text. A signed amount is a credit when positive and a debit when negative. Parentheses are accepted as an explicit negative representation. The selected grouping separator must divide the integer into valid three-digit groups. Currency symbols and scientific notation require an explicit source conversion rather than silent interpretation.

For separate bank debit and credit columns:

~~~js
{
  amountMode: 'DEBIT_CREDIT',
  columns: { postedDate: 'Date', debit: 'Money out', credit: 'Money in' }
}
~~~

Empty debit or credit cells count as zero when the opposite cell has an amount. Both empty is a missing amount; both nonzero requires row correction. Separate debit and credit values must be nonnegative, and the reader applies the account sign once.

The [Xero bank CSV import guide](https://central.xero.com/0/article/Import-a-CSV-bank-statement) also describes date/amount mapping and signed statement amounts. This module's retained source report additionally keeps the original balance and account context for its own reviewed reconciliation workflow.

### Mixed statuses and accounts

When a CSV includes status, map its actual strings:

~~~js
{
  columns: { postedDate: 'Date', amount: 'Amount', status: 'Status' },
  statusValues: { posted: ['Booked'], pending: ['Pending'] }
}
~~~

Status matching is case-sensitive. An unmapped status remains visible and ineligible; a pending row is returned separately. With no status column, the selected CSV is interpreted as a posted statement export.

Map accountId, bankId, branchId, accountType or currency columns when those values occur per row. Mapped values override the supplied account defaults. Each distinct account/currency group is returned separately, up to 1,000 groups. Account numbers remain strings, preserving leading zeros.

The institution namespace uses BANKID first, then the original FI/FID, then a retained operator namespace, then the institution name when it is the only native descriptor. Missing institution identity is visible in account issues. Bind each source to an explicit merchant bank account before recording money. The reader does not substitute a company customer ID for a bank account.

### Original balance records

A running balance column stays attached to its original transaction. It is not automatically an opening or closing balance.

Select original balance rows explicitly:

~~~js
{
  balanceRecords: [
    { recordNumber: 3, kind: 'OPENING', amountColumn: 'Balance', dateColumn: 'Date' },
    { recordNumber: 40, kind: 'CLOSING', amountColumn: 'Balance', dateColumn: 'Date' }
  ]
}
~~~

A balance record can occur before or after the header; column names still refer to the selected header. It is retained as balance evidence instead of being parsed as a transaction. OPENING, CLOSING, LEDGER and AVAILABLE are separate roles. A selected single opening and closing create a source pair. Multiple alternatives remain available for explicit selection, and absent source dates remain null.

For a footer or other record outside the transaction set:

~~~js
{
  skipRecords: [
    { recordNumber: 41, reason: 'Bank export footer: document generation timestamp' }
  ]
}
~~~

Excluded records retain all original cells, raw content and source positions with the operator's reason. This is useful for complete export/reopen and later review.

## Returned source report

The full declarations live in source.d.ts. The main fields are:

| Field | Meaning |
| --- | --- |
| bytes | Exact original Buffer, suitable for immutable retained-file storage |
| file | Original filename, byte length, SHA256, media type and selected text encoding |
| interpretation | Explicit date, sign, encoding and native identity rules |
| statements | Every supported native account response or mapped CSV account group |
| issues | Envelope/source issues |
| native | Native dialect, header, FI, returned provider statuses and structural count |
| csv | Original mapping, resolved indexes, header, preamble and exclusions |

Each statement contains account, period, balances, rows, pendingRows, source, issues and summary. A native closing response remains its own section; its complete closing blocks are also linked to matching same-file transaction sections by exact account identity and currency. Linking preserves the original section ID.

DOWNLOAD_COVERAGE and ROW_DATE_RANGE are descriptive source periods. Neither asserts that the uploaded source includes every item needed for a close. The reconciliation workspace selects and validates its own complete accounting period.

Each posted row includes:

- id: exact original file SHA plus record location.
- providerId and providerKey: original account-scoped provider identity, when available.
- candidateFingerprint: amount/date/payee/reference similarity for reviewed overlap handling.
- amount, amountRaw and currency: exact signed value plus its original lexical representation.
- postedDate and postedAt: original calendar date, retained native precision and timezone.
- correction: original target ID and REPLACE/DELETE instruction, preserved for reviewed application.
- source: original pointer, logical record, line range, decoded character offsets, original byte offsets and raw record.
- original: all native fields or CSV cells.
- issues and eligible: source validation and whether this row is ready for a reviewed posted import.

OFX pointers use an explicit indexed OFX_PATH such as /OFX[1]/BANKMSGSRSV1[1]/STMTTRNRS[1]/STMTRS[1]/BANKTRANLIST[1]/STMTTRN[1]. CSV pointers use zero-based logical records while recordNumber is one-based. Character offsets count UTF-16 code units in the decoded source; byte offsets refer to the unchanged uploaded bytes. Both ranges use an inclusive start and exclusive end.

The report does not collapse repeated rows. A repeated provider identity is flagged; different financial details under the same identity require correction. CSV rows lacking an ID remain separate even if their candidate fingerprints match. A native correction reusing its original ID is also retained visibly for reviewed source-version handling.

summary.currencyTotals describes source rows before deduplication or correction application. It is useful for source review and must not replace the reconciliation domain's own balances.

## Integration with the merchant writer

Retain report.bytes and the complete parsed report under immutable generated file names. Keep the original source and parser input mapping with the import journal. Ordinary workspace state can use a compact projection with links to full source and report downloads.

The bank reconciliation controller selects one statementId, explicitly binds its original account identity, checks envelope/statement/row issues and verifies the reviewed preview hash. It then records bank rows through the existing merchant receipt, refund, allocation and workspace mutation paths. Changes use the original revision, actor and stable request ID. Foreign row amounts require an explicit account-currency value with source explanation before matching.

Corrections retain both original source editions, the target identity and reviewed action. Replacing or deleting a transaction that already has a match requires the original match/close correction path. An archived close freezes its selected source balances and posting parts, and later changes use the maintained reopen operation.

## Executed native import exercise

The complete module was executed on Node v24.19.0 using OFX 2 XML, OFX 1 SGML/QFX and explicitly mapped CSV inputs. The original-format journey covered multiple accounts, source byte ranges, late dates, correction targets, pending items, original closing links, foreign currencies, Windows-1252, BOM/UTF-16, multiline CSV, large exact decimal amounts, duplicate-ID conflicts, calendar errors and malformed original files. The retained result and unchanged exercise source accompany the product's native handover.

This module imports only node:crypto and standard Node byte/text facilities. It makes no network requests and creates no accounting records.
