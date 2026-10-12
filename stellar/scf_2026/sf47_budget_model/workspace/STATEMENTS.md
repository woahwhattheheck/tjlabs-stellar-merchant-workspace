# Account statements and grant cash reconciliation

Account statements carries an original bank or account CSV into the existing Grant Operations cash records. The operator chooses the exact account, source columns, decimal format and date order, reviews every source row, reconciles opening and closing balances, and receives the reviewed movements in one original case transaction.

Open **Delivery and cash operations → Account statements**. The same feature is available through the original Python CLI, typed Grant client and Merchant MCP. Cash, invoices, Budget performance, forecasts, complete-case exports and receiving continue to use their existing original records.

## Original source and account identity

Select the original UTF-8 CSV, optionally with its UTF-8 BOM. The first record supplies the exact column headings; headings retain their surrounding spaces. Supported separators are comma, semicolon, tab and vertical bar. Quoted fields, quoted multiline descriptions, CRLF and LF records retain their original bytes. A row decision names the physical source line at the beginning of its CSV record, so multiline fields do not silently renumber later decisions.

Use a stable nonsecret account ID, such as `operating-usd`, plus a readable account label. Keep this ID for later statements and corrections from the same account. It is case-sensitive. Do not put credentials, a full account number or an access token in the ID. Statements use `statement/<accountId>` as the source namespace in the original cash record's network field and the selected currency as its asset. This identifies an accounting source account; the original CSV supplies the provider's actual transaction reference.

The original transaction ID column is required. Payment identity is the account namespace, currency and original provider reference. A 64-character hexadecimal reference uses the cash domain's existing case normalization; other references remain case-sensitive. Dates, amounts, descriptions, source row numbers and filenames never substitute for the provider identity. Two legitimate same-day, same-amount payments with distinct provider IDs remain two movements. The same provider ID on two accounts remains two account observations.

Each import selects one currency or asset. If the CSV has a currency column, map it: every interpreted row must match the selected currency. Separate different currency populations into their original complete exports. An optional original USD valuation column can supply a distinct valuation of a non-USD amount; retain its explicit basis in Valuation note. The original asset amount stays separate and exact.

## Choose the original number and date format

The selected decimal mark is a period or comma. An optional thousands separator can be a period, comma, space, nonbreaking space or apostrophe, and must differ from the decimal mark. Grouped numbers require groups of three digits. Amounts can use one leading sign or parentheses for a negative value. Currency symbols and exponent notation are rejected. The parser and cash writer use Decimal values and native strings.

For signed amounts, specify whether positive values represent inflows or outflows. For separate debit and credit columns, debit means outflow and credit means inflow; both values must be nonnegative and at most one may be nonzero. Empty debit/credit cells mean zero. A zero movement can be retained as an explicit exclusion when it is an informational row.

Select exactly one date order:

| Input format | Example |
| --- | --- |
| YYYY-MM-DD | 2026-10-12 |
| MM/DD/YYYY | 10/12/2026 |
| DD/MM/YYYY | 12/10/2026 |
| YYYY/MM/DD | 2026/10/12 |

The source must match the selected shape and an actual calendar date. The importer does not infer a locale from an ambiguous date or number.

## Review rows and original balances

Preview interprets the complete CSV against the current case version. The browser shows all source rows with paging and filtering. Download the complete preview when reviewing it elsewhere.

| Row result | Meaning and action |
| --- | --- |
| New cash movement | Valid original source and cash facts; selected for receiving. |
| Already recorded | The same account/payment identity already has matching original cash facts. The existing record is retained. |
| Excluded | The operator supplied a reason for omitting this row from new cash records. Original bytes and the decision remain in the review. |
| Needs correction | A source/mapping/value conflict, repeated selected provider ID, changed existing cash facts, or voided original observation needs reconciliation. The batch cannot be received. |

Set a default category, then review specific categories and grant tranches where the source requires them. A tranche belongs to a grant inflow. For actual supplier payments or refunds, allocate exact USD amounts to the retained invoices. Allocations use the original cash domain: they need an observed USD value, fit within that value and follow the original outflow/refund direction rules. A statement does not create supplier invoices or rewrite their amounts.

An exclusion needs a reason. It retains the raw row and its parse problems where applicable. Excluding a duplicate provider row is an explicit operator choice, not silent deduplication.

Enter the original opening and closing balances together, using the selected decimal and grouping format. Reconciliation uses **every readable movement in the original statement**, including already recorded and explicitly excluded movements:

`calculated closing balance = original opening balance + original inflows − original outflows`

The report shows the calculated balance and its difference from the stated closing balance. A mismatch prevents receiving. When a movement amount or currency cannot be interpreted, supplied balances remain unavailable and receiving requires correction. If both balances are omitted, the report displays that condition and the original row decisions still govern receiving. Statement totals and the amount of *new* cash being imported are shown separately.

## Receive the exact reviewed batch

After reviewing the rows, classifications, invoice allocations and balances, confirm the preview and select Receive reviewed statement. The original case version and preview SHA bind the request to the complete source bytes and interpretation.

Receiving uses the existing SF47 SQLite transaction. It retains:

- The exact original CSV as a payment source.
- A complete JSON review containing the source identity, source observation, mapping, classifications, exclusions, normalized preview, original cash identities and the recording operator.
- Every selected new cash observation, referencing both original sources.
- One case event and one new case version, with the original request ID.

The original cash validator checks each new row against current records and earlier staged rows from the same batch. Any failure rolls back the original CSV, review, new cash rows, event, case version and request result together. The original limits apply: 5,000 total business records, 200 attached sources, 24 MiB of attached bytes, 8 MiB per source and a 32 MiB request/export envelope. The source CSV also has a 5,000-data-record limit; a CSV record has up to 200 headings and source cells up to 32,000 characters.

The complete review can exceed the raw CSV size because it retains the exact interpretation. Preview includes that review in its source-capacity check.

## Repeated statements, changed facts and voids

A repeated statement checks current cash records. Matching original payment identities are shown as Already recorded. A previously received identical source edition with the same mapping and decisions is returned unchanged, without another source pair or case version. A new overlapping statement can retain its own source and review while adding only new cash movements.

A changed amount, direction, date, category, USD valuation, tranche or invoice allocation under an already recorded provider identity is a conflict. Reconcile the original cash observation through the Cash view and retain its correction before importing an updated source. The statement desk does not overwrite immutable observations.

An identity whose original cash observation has been voided is a review conflict. It cannot silently recreate that observation. If a separately corrected active observation exists under the same identity, its full cash facts must match the incoming source.

The statement review remains attached after later normal cash voids. Complete-case receiving checks that each imported statement cash identity, its original facts and its source/review references remain present.

## Interrupted browser requests

The browser retains the complete source, mapping, decisions and exact pending request in its existing-origin IndexedDB. Use the same host and port when reopening this browser state. It also provides a complete recovery JSON download and import.

If a receive response is lost, use Retry original request. It sends the same request ID and exact original payload through the native request ledger. If the server has already returned success, Finish receipt readback reopens the case and checks the recorded source, new and existing cash IDs, case version and original preview identity.

An unresolved original request stays intact until its result is reconciled. Choosing another statement does not replace it. Keep the downloaded recovery input in the operator's private working directory; it contains the original financial source.

## Command line

The original grant launcher supplies the operations CLI. Use the same installed source and private workspace already selected for Grant Operations.

A compact mapping file may omit `source.contentBase64` when `--file` supplies the original CSV. Retain the source observation timestamp so preview and receiving assemble the same exact input:

~~~json
{
  "source": {
    "filename": "operating-october.csv",
    "observedAt": "2026-10-12T18:00:00Z",
    "sourceUrl": ""
  },
  "accountId": "operating-usd",
  "accountLabel": "Operating account",
  "currency": "USD",
  "format": {
    "delimiter": ",",
    "decimalMark": ".",
    "groupMark": ",",
    "dateFormat": "YYYY-MM-DD",
    "amountMode": "SIGNED",
    "positiveDirection": "IN"
  },
  "columns": {
    "date": "Date",
    "reference": "Transaction ID",
    "description": "Description",
    "amount": "Amount"
  },
  "defaultCategory": "OTHER",
  "decisions": []
}
~~~

Replace the sample observation and headings with those selected from the original source. Add both original balances when supplied.

~~~sh
grant operations --workspace "$GRANT_DATA" statement-preview \
  --case CASE_ID --expected-version CURRENT_VERSION \
  --inputs /absolute/working/statement-mapping.json \
  --file /absolute/inputs/operating-october.csv \
  --output /absolute/working/statement-preview.json

grant operations --workspace "$GRANT_DATA" statement-receive \
  --case CASE_ID --expected-version CURRENT_VERSION \
  --inputs /absolute/working/statement-mapping.json \
  --file /absolute/inputs/operating-october.csv \
  --expected-preview-sha256 REVIEWED_PREVIEW_SHA256 \
  --actor "Recording operator" --request-id ORIGINAL_REQUEST_ID \
  --note "Reviewed original account statement and classifications" \
  --output /absolute/working/statement-receipt.json
~~~

Use the original current version from preview for receiving. The receive result supplies the next version. Full browser-exported inputs already contain the exact source bytes and can be supplied through `--inputs` without `--file`. If both inline bytes and `--file` are present, they must match. Output paths are create-only private files; an existing output is preserved.

Read the resulting complete case, report and sources with the existing `show`, `report`, `source`, `history` and `export` commands. The complete-case ZIP retains both original sources and all cash facts and can be reopened through the same original `import`.

## HTTP and typed client

Preview is an authenticated native POST:

`/api/operations/CASE_ID/statement-preview`

Body: `{expectedVersion, inputs}`.

Receiving is the existing authenticated command endpoint:

`/api/operations/CASE_ID/command`

Body: `{expectedVersion, actor, note, requestId, action: "statement.receive", data: {inputs, expectedPreviewSha256}}`.

The typed client exposes:

~~~js
const preview = await grant.statementPreview(caseId, currentVersion, inputs);
const received = await grant.statementReceive(caseId, {
  expectedVersion: currentVersion,
  requestId: originalRequestId,
  actor: recordingOperator,
  note: reviewNote,
  inputs,
  expectedPreviewSha256: preview.value.previewSha256,
});
const current = await grant.read('case', {caseId});
~~~

`GrantStatementInput`, `GrantStatementPreview`, `GrantStatementRow` and `GrantStatementReceipt` preserve decimal text, original source lines, classifications and native receipt IDs in TypeScript. The request client retains uncertain-write status and the original request ID.

Merchant MCP exposes `merchant_grant_statement_preview` and `merchant_grant_statement_receive`. Each accepts the complete input inline or from the original verified host-input/snapshot/transfer mechanism. Complete large previews use the existing retained snapshot and row/file readers. The general `merchant_grant_case_command` also recognizes `statement.receive`.

The maintained `grant-operations` selection includes the complete source module, browser desk and styles. Both original managed-launch source lists include them, so an installed launch reviews and starts the same selected edition.
