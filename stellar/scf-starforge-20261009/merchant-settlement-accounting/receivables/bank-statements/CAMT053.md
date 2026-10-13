# CAMT.053 bank statements

The merchant bank workspace accepts original CAMT.053 XML through its existing source review, bank account, receipt, refund, allocation and statement-close workflow. Supported namespaces are `urn:iso:std:iso:20022:tech:xsd:camt.053.001.02` and `urn:iso:std:iso:20022:tech:xsd:camt.053.001.08`. The original namespace selects the message structure. An explicitly selected expected version must agree with it.

The source module uses Node built-ins and reads the complete original bytes. It does not make network requests while parsing. Installation includes the source parser, browser review module, complete original-file preparation command and source format guide with the existing merchant application.

For a statement divided across original pages, use the complete [page-assembly and close workflow](PAGE_ASSEMBLY.md). It receives saved statement sections across one or several original XML files, reviews page/sequence/balance/summary coverage, and carries every selected source into the ordinary close archive.

## Receive the original statement

Open **Bank statements → Original statement file** and choose the bank's XML file. The browser selects **CAMT.053 XML statement** for an `.xml` file. Select an expected version when a bank connection has a fixed version; otherwise the parser reads the actual supported namespace.

Review the original account, institution identity, currency, statement reference, reporting period, pagination, balances and posted entries. Multiple account statements remain separate selections inside the same retained file. The complete report contains every source statement; receiving binds the selected statement to its exact merchant bank account.

The original account identity must identify the institution and account. If the XML omits its institution identity, use the existing **Institution namespace** field to supply the stable bank reference used for that account. Preserve the same reference for later files.

Each `Ntry` remains one entry. The statement review distinguishes the entry statuses and shows the original balance check. Add the selected bank account or choose its existing merchant account, review the statement and retain it. The original cash, receipt and invoice-allocation functions then work on the received entry.

**Retained statement** opens every booked, pending and information entry in original record order. **Original row** shows its exact decoded XML, source positions and complete fields. The transaction screen shows bank references, booking and value dates, the reversal indicator, reported charge groups, underlying transaction details and their remittance data. Detail pages contain 25 records each; the complete original and parsed-file downloads retain all records.

## Prepare a request from an original file

The installed command creates a complete source request directly from the original file. It needs no accounting workspace and preserves the original basename and bytes.

```sh
starforge bank-statements prepare-source \
  --file /private/bank/statement.xml \
  --format CAMT053 \
  --out /private/bank/source-request.json
```

For a bank that supplies version .08 and expects a detail amount check:

```sh
starforge bank-statements prepare-source \
  --file /private/bank/statement.xml \
  --format CAMT053 \
  --message-version camt.053.001.08 \
  --detail-policy ENTRY_CURRENCY_TX_AMT \
  --out /private/bank/source-request.json
```

Optional `--account-namespace` supplies the stable institution reference. Optional `--text-encoding` selects the original file encoding and must agree with its declaration and byte-order mark. The source parser reports source problems in the returned statement summaries so the original remains available for review.

The prepared request is limited to the installed workspace's 24 MB request budget; its original source is limited to 16 MB and 50,000 bank entries. The command reads a regular original file, detects changes during reading and creates a private output file without overwriting an existing path.

Review the same complete request in the original accounting directory:

```sh
starforge bank-statements source-preview \
  --directory /private/accounting \
  --input /private/bank/source-request.json
```

The returned statement IDs, account identities and `reviewSha256` bind the subsequent `receive-source` action to this file and interpretation. Use the existing revision, actor and stable request ID when applying it. The CLI's `operation` command and browser's recovery flow reopen that same operation after an interrupted response.

The preparation command also supports OFX, QFX and mapped CSV. CSV uses the complete explicit mapping object as a separate UTF-8 JSON file:

```sh
starforge bank-statements prepare-source \
  --file /private/bank/statement.csv \
  --format CSV \
  --csv-mapping /private/bank/mapping.json \
  --out /private/bank/source-request.json
```

## API and source contract

The existing `BankStatementsClient.previewSource` and `receiveSource` methods accept the new format. No separate accounting endpoint or cash writer is introduced.

```js
const source = {
  format: 'CAMT053',
  file: {
    name: 'statement.xml',
    dataBase64: originalFileBytes.toString('base64')
  },
  // Use only when the original omits its financial institution identity:
  // accountNamespace: 'existing-stable-bank-reference',
  camt: {
    messageVersion: 'camt.053.001.08',
    detailPolicy: 'PRESERVE_ONLY'
  }
};

const preview = await bank.previewSource({source});
// Select the original account statement and its merchant account in review.
const received = await bank.receiveSource({
  revision: preview.revision,
  workspaceId: preview.workspaceId,
  actor: currentOperator,
  requestId: originalRequestId,
  accountId: selectedBankAccountId,
  statementId: selectedStatementId,
  reviewSha256: preview.reviewSha256,
  source
});
```

`camt` is optional. `messageVersion`, when present, is the exact supported message identifier without the namespace prefix. `detailPolicy` defaults to `PRESERVE_ONLY`; `ENTRY_CURRENCY_TX_AMT` requests an additional check of explicitly stated transaction-detail amounts in the entry currency. Both preserve the original entry amount and all detail records.

The source report adds:

| Location | Original information |
| --- | --- |
| `report.camt` | Namespace, message version, message reference and creation time, message pagination, original XML source tree and node count. |
| `statement.camt` | Statement reference, creation time, sequence numbers, copy/duplicate indicator, pagination, reporting source, balance and summary checks, selected detail policy. |
| `row.camt` | Entry and account-servicer references, current debit/credit direction, reversal indicator, original status, booking/value dates, bank transaction code, batch groups, all transaction details, charges, original amount information and return data. |
| `statement.excludedRows` | Original exclusion reason and the complete information/noncash entry in each item's `row` field. |
| `statement.balances.closing` | Original `CAMT_BOOKED_BALANCES` candidates with separate opening/closing dates, balance codes, subtypes, reporting period and eligibility. |

Compact workspace projections retain the message, statement and entry metadata. The complete XML tree remains in the downloadable parsed source report. Source locations identify original byte ranges and decoded character positions; they do not repeat entire ancestor XML strings at every level.

`BankImport.camtMessage` contains the message metadata and `BankImport.camt` the selected statement metadata. Transactions retain `camt` from their original entries. The saved report, original XML and those fields travel with the existing statement import and complete account handover.

## Entry status, direction and identity

| Original source | Workspace treatment |
| --- | --- |
| `BOOK` | A posted source entry; account, amount, date and other source problems remain explicit review issues. |
| `PDNG` | A retained pending entry outside posted-cash reconciliation. |
| `INFO` or a proprietary status | A retained noncash source record with its source reason and original fields. |
| `CdtDbtInd=CRDT` | The entry's current credit direction. |
| `CdtDbtInd=DBIT` | The entry's current debit direction. |
| `RvslInd=true` | Original reversal metadata attached to the current signed entry. |
| `AcctSvcrRef` | Account-scoped provider identity used by the existing source overlap and duplicate review. |
| `NtryRef` | Retained entry reference, kept separate from the account-servicer identity. |

The debit/credit indicator describes the current entry. A reversal therefore keeps that current direction; the parser does not reverse its sign a second time. A CAMT reversal is distinct from an OFX correction that instructs replacement or deletion of an earlier transaction. Original party roles stay attached to the source, including returns whose original debtor/creditor roles remain present.

Amounts remain decimal strings throughout parsing. The existing bank account's currency scale governs entry receiving and posting. No binary floating-point addition, implicit exchange rate or inferred minor-unit scale is used to produce cash.

## Batches, detail amounts and charges

A bank may report one cash entry that contains several batches or underlying transactions. The report retains the original batch references, counts, amounts and direction, each detail's original references and parties, direct and typed amounts, exchange information, remittance, creditor references, document numbers, agents, related dates, charges and return information.

The optional detail check uses only explicitly selected amounts in the entry currency. Its `detailTieOut` result records the policy, source entry amount, selected detail total and result. Unavailable amounts and a difference remain visible. The check never creates another cash entry from a detail.

Each charge group retains its reported total and every charge record. Records preserve the original amount/currency, debit/credit indicator, included flag, charge type, rate, bearer, agent and tax information. The group exposes `entryAmountAdjustment: 'NONE'`: receiving keeps the bank's original entry amount. A reported total and its constituent charge rows are separate representations; they are not added together or deducted again.

Use the existing receipt and posting-part workflow to explain a net deposit. For example, an original customer receipt and an explicit negative fee can total the bank's signed credit. The operator selects the actual accounting treatment from the original entry and receipt evidence.

## Original balances and statement close

Opening and closing booked balances retain their original code, subtype, amount, currency and date. An intermediate balance remains an intermediate balance. A nonfinal page can have a valid local arithmetic check while the complete statement's close still requires the final page and complete period.

A `CAMT_BOOKED_BALANCES` candidate uses explicit `FrToDt` calendar dates as the inclusive reporting period. Its opening and closing objects retain their own original dates, which can differ from the reporting start. This matters when an opening booked balance is dated on the previous business day.

Without an explicit reporting period, the original boundary balances remain visible and their candidate `from` and `until` stay null. The existing close screen also supports the operator's explicit statement period and balance basis. It does not invent a full included transaction day from an opening snapshot date.

Complete candidates require eligible opening/closing balances, a complete supported page, unambiguous boundaries and consistent source arithmetic. The existing close writer still verifies the selected account and currency, every posted amount, exact posting parts, receipt coverage and allocations, prior-close continuity and the reviewed close hash. A source issue or incomplete closing candidate does not erase valid booked entries.

## Source material and receiving

The format work follows the published ISO message structures and bank implementation material. The following are primary sources:

- [ISO 20022 cash-management message catalogue](https://www.iso20022.org/iso-20022-message-definitions?search=camt.053).
- [SIX Swiss Payment Standards 2025 cash-management implementation guidelines, version 2.2](https://www.six-group.com/dam/download/banking-services/standardization/sps/ig-cash-management-sps-2025-en.pdf), including pages 35–37 for return roles and pagination, 64–65 for entry amount/direction/reversal/account-servicer reference, and 70/80 for charge fields.
- [Nordea Corporate Access original documentation and example files](https://www.nordea.com/en/our-services/corporate-access?translation=da).
- [Nordea .02 extended account-statement implementation guide](https://www.nordea.com/en/doc/nordea-caar-camt.053.001.02-account-statement-extended-0.pdf).
- [Nordea .02 standard account-statement implementation guide](https://www.nordea.com/en/doc/caar-camt-053-001-02-account-statement-standard.pdf).

Eight original Nordea example archives were received on 13 October 2026, preserving their exact ZIP and XML bytes, original and final URLs, lengths and SHA-256 values. They contain 109,613 bytes of original XML across the standard and extended Denmark, Finland, Norway and Sweden examples. The complete source inventory is retained with the receiving operation.


### Goldman Sachs .08 published examples

The following original XML examples were received from Goldman Sachs Transaction Banking's published HTML code blocks on 13 October 2026. The retained source contains every XML line, original comment and field value; retrieval line labels and the surrounding page presentation were removed. The receiving record keeps the complete retrieved page windows and the exact resulting XML identity.

| Published example | Original XML bytes | Actual source outcome |
| --- | ---: | --- |
| [CBPR sample](https://developer.gs.com/docs/services/transaction-banking/camt053-cbpr-sample) | 14,015 | One USD statement, two entries and two transaction details. Booked net is -25.95 and the original page balances agree. Page 1 is nonfinal and its closing balance is intermediate, so the complete account-period close stays ineligible. |
| [Itemized European sample](https://developer.gs.com/docs/services/transaction-banking/camt-053-itemized-eu-txn) | 56,930 | Three EUR statements with 3, 10 and 0 entries. Their original booked nets are 190, 1511.6 and 0. Each complete 5 November 2024 reporting period has an eligible original opening/closing pair. Five original entries retain reversal metadata. |
| [Structured remittance sample](https://developer.gs.com/docs/services/transaction-banking/camt-053-v8-struct-remi) | 14,926 | The published XML opens `AdrType` and closes `PstlAdr` without closing that element. The unchanged reader returns `CAMT_XML_CLOSE`, retaining both original tag names. |

The Itemized example includes a signed entry amount of -10 and a transaction-detail amount of 50. The entry remains the bank cash movement; selecting the detail check retains the informational difference. The zero-entry account retains its original 4200 opening and closing balances and complete statement period. CBPR's detail-level bank references and UETR remain source details, separate from entry-level duplicate identity.

The merged source parser received all four valid statements, 15 cash entries and 15 details. The unchanged workspace preview and CAMT renderer then received those complete reports, preserving statement metadata, all five reversal flags and the original close classifications. These source and consumer runs used the connected JavaScript runtime. The complete HTTP, account, CLI, statement-close and cold-reopen operation is maintained in [the issuer-example receiving directory](../../../../../operations/merchant-bank-camt053-receiving-dff77-20261013/README.md); its saved result records the actual native application outcome.


The installed application supports the explicitly named .02/.08 message structures. The ISO catalogue's newer message versions are separate structures and do not change the interpretation of a file that declares an older version.
