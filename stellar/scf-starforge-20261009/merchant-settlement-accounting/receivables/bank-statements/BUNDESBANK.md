# Receive the complete Bundesbank original delivery

The maintained bank product includes the original Bundesbank EBICS and SWIFT example archives published for the 29 October 2024 edition. Together they contain 22 XML files: twenty CAMT.052 account reports and two CAMT.053 statements. The two complete ZIPs, every original XML byte, original archive paths and exact member identities are retained in `BUNDESBANK_ORIGINALS.json`.

Use this delivery to work through complete source interpretation, collection review, original extraction and independent receiving. It opens in the existing Bank desk and uses the maintained bank parser and collection commands.

## Open the whole delivery

From the bank-statements directory in the installed source package, run:

```sh
node BUNDESBANK_RECEIVE.mjs \
  --workspace-id ORIGINAL_WORKSPACE_SHA256 \
  --out /absolute/new-bundesbank-delivery
```

Use the original accounting SHA-256 identity of the workspace where you will open the collection and a new directory. The command uses Node built-ins and the included original source; it requires no network connection, accounting database or additional package installation.

The receiving directory contains:

- `archives/`: both complete original ZIPs.
- `originals/`: all 22 unchanged XML files, retaining their original basenames.
- `original-files.json`: the complete editable file/mapping/inclusion manifest.
- `collection.json`: the entire delivery for **Bank → Statement collections → Receive collection**.
- `review.json`: the current parser/domain review of both statement files and the explanations for the twenty retained CAMT.052 files.
- `reports/`: both full original CAMT.053 reports, all entries/details/source positions and complete original bytes.
- `complete-extraction/`: the same full collection, each original file and its separate interpretation record.
- `received-collection.json`: a separately received collection with all originals and mappings preserved.
- `RECEIVING_RESULT.json`: the actual completed receiving result.

The twenty CAMT.052 files are retained with explicit exclusion notes because they are account reports for a CAMT.052 reader. Both CAMT.053 files are selected for the maintained statement reader. Original files and inclusion decisions remain editable in the collection; the financial intake uses the existing reviewed-source operation.

## Interpret the actual XML

Both statements start with an unqualified `Document` element and declare `xmlns:n0="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"`. The prefix is declared but is not used on their elements. Consequently the actual element namespace is empty.

For these original files the collection selects:

```json
{
  "format": "CAMT053",
  "columns": {},
  "accountNamespace": "Deutsche Bundesbank",
  "camtMessageVersion": "camt.053.001.08",
  "camtNamespaceMode": "UNQUALIFIED",
  "camtReferencePolicy": "SOURCE_ENTRY",
  "camtDetailPolicy": "PRESERVE_ONLY"
}
```

The parser preserves the original empty namespaces, unused prefix declaration, XML bytes and source positions. It records the explicitly selected .08 interpretation in the report. A different selected version conflicts with the .08 declaration; a normally qualified document continues through its declared namespace.

The SWIFT example omits its account-servicing institution. The explicit institution namespace identifies this published Bundesbank example and remains part of the source interpretation. For an operating account, retain the existing stable institution reference used by that bank workspace.

### Separate the cheque and fee

Both files give their third and fourth entries the same account-servicer reference. These are separate cash entries: a cheque debit of EUR20,000 and its EUR15 fee. The `SOURCE_ENTRY` policy preserves both entries independently and retains their original account-servicer references as source information. It leaves the cross-file provider identity empty so overlapping imports enter the existing source comparison/review.

The normal `ACCOUNT_SERVICER_REFERENCE` policy remains the default for banks where that reference identifies one booking. Choose the separate-entry policy when the actual source requires it. The existing file/review identity, exact repeated-import recovery and explicit replacement/overlap decisions continue to govern financial intake.

## Original statement results

| Original statement | Date and sequence retained | Booked entries / nested details | Credit | Debit | Net |
| --- | --- | ---: | ---: | ---: | ---: |
| EBICS `20240313C0098170` | 13 March 2024; electronic sequence 1 | 11 / 11 | EUR475,015.00 | EUR475,015.00 | EUR0.00 |
| SWIFT `20240306S0097336` | 6 March 2024; electronic sequence 3 | 11 / 11 | EUR475,015.00 | EUR475,015.00 | EUR0.00 |

Both files retain page `00001` and final-page true. Each reports opening and closing booked balances of zero and its original entry arithmetic matches those balances. These are separate published examples on different dates, not consecutive pages of one statement.

Neither file supplies `FrToDt`. The complete report retains that absence separately from the dated balance observations. The original booked rows are available for financial intake, while the existing close review requires an explicitly supported account period. The receiver preserves `CAMT_REPORTING_PERIOD_REQUIRED` on automatic complete-period closing candidates.

The declared detail policy preserves all eleven underlying details per file. Their direct amounts and references remain inspectable without changing the eleven original cash entries.

## Review in the maintained product

Receive `collection.json` into the existing workspace. The collection lists every original; filter to included files to open either CAMT.053 statement. **Review original** restores its explicit namespace, message-version and booking-reference interpretation into the source editor. The statement summary displays those choices.

Review the original account and every entry, then use the existing account selection and **Retain original statement** action. The cheque and fee have separate source rows even though their displayed bank reference repeats. Match their actual amounts through the existing receipt/expense/fee workflow. When an earlier interpretation of these same bytes already exists, select that prior import for the ordinary source-replacement review.

The same explicit source options are available through the installed preparation command:

```sh
starforge bank-statements prepare-source \
  --file /private/original-statement.xml \
  --format CAMT053 \
  --message-version camt.053.001.08 \
  --namespace-mode UNQUALIFIED \
  --reference-policy SOURCE_ENTRY \
  --account-namespace "Deutsche Bundesbank" \
  --out /private/new-source-request.json
```

The API uses `camt.namespaceMode` and `camt.referencePolicy`; the browser/collection fields use `camtNamespaceMode` and `camtReferencePolicy`. Both reach the same parser and source-review identity.

## Source continuity

The original archives were received through the existing SCF bank source operation and retain these complete identities:

| Original archive | Bytes | SHA-256 |
| --- | ---: | --- |
| EBICS | 16,054 | `eab4feca5b973648dfa8b33c056e41e5a5b1ce2dbcf8b1fa2ec595691b98cb7b` |
| SWIFT | 12,640 | `7f3f6ee8391aad124fb397f50307ec519e3e27b79ff61d4dda80b5e966c43788` |

The included source packet records each original official URL, all 24 ZIP member records, all 22 XML byte identities and the unchanged archive/member names. It was reconstructed from retained archive blob `83bcda37282f6dce83cd521fd446925f83721644`, with member SHA-256 and CRC checks against the complete originals.

Continue complete customer receiving in the existing operation `SCF-BANK-CAMT053-SOURCE-DFF77-20261013`. The [collection guide](SOURCE_COLLECTIONS.md), [CAMT guide](CAMT053.md) and [complete page assembly](PAGE_ASSEMBLY.md) describe the same installed product.
