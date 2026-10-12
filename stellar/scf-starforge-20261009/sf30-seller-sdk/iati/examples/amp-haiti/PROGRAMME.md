# Original Haiti programme commissioning case

The complete FCDO publication supplies a real programme for the AMP commissioning workflow: the parent `GB-GOV-1-400503` and its subordinate activity `GB-GOV-1-400503-401`. The original subordinate activity contains four financial transactions and five budget periods. The parent contains its programme description, policy markers, source documents and the explicit parent/child relationship.

The source remains the complete **8,496,890-byte FCDO-set-20.xml**, containing **1,332 activities**, generated **24 September 2026 at 05:45:02.027**, in IATI 2.03. The selected two activities both declare recipient country **HT at 100%**. The selection is explicit and applies only to this retained publication.

## Complete source and identities

Original publication: https://iati.fcdo.gov.uk/iati_files/solr/FCDO-set-20.xml

- Full XML SHA256: `98a6bad80d60aa8deaa35fe1a593313515649a9fae7456895d1bfed4ac4a756d`.
- Retained gzip: `iati/examples/fcdo-wadi-2026/FCDO-set-20.xml.gz`, 647,227 bytes; Git blob `6f777c56fc6c977548ff5928943d526849cc0673`.
- Gzip SHA256: `4df991d0ce8bbcc2ff44d0c71644f9f6fb2f4b10c9edd037294d146634433645`.
- Publisher reference: `GB-GOV-1`. Native source/licence and actual acquisition receipt remain in the original FCDO example.
- `selection.json` carries the exact publisher/activity selection and both complete activity records for convenient field review. Its records are excerpts with exact source-text hashes; the complete publisher file remains the ingestion input.

## Programme structure to preserve

| Original field | Parent activity | Subordinate activity |
|---|---|---|
| IATI identifier | GB-GOV-1-400503 | GB-GOV-1-400503-401 |
| Hierarchy | 1 | 2 |
| Reported title | Strengthening Human Rights Compliance of the MSS/GSF Mission to Haiti | Strengthening Human Rights Compliance of the Multinational Security Support Mission to Haiti |
| Recipient country | HT, 100% | HT, 100% |
| Sector | 15160, Human rights, 100% | 15160, Human rights, 100% |
| Planned start | 2024-12-03 | 2024-12-03 |
| Actual start | 2024-12-04 | 2024-12-03 |
| Planned end | 2026-09-30 | 2025-11-15 |
| Relationship | Child ref GB-GOV-1-400503-401 | Parent ref GB-GOV-1-400503 |
| Financial records | None in this record | Four transactions, five budget periods |

The narrative describes an FCDO-supported programme implemented by the Office of the High Commissioner for Human Rights. The original participating organisation has reference `162426`; the source financial provider is `GB-GOV-1` and receiver is `162426`. Those source references remain source identities. The operator selects the corresponding actual organisation records in the installed AMP configuration.

The different parent/child dates and titles remain visible during native mapping. The parent carries Gender Equality and Disability policy markers with significance 1, while the subordinate has its own country-budget item. Preserve each original record's fields and relationship when choosing the AMP project representation.

## Original financial transactions

| Source transaction ref | IATI type / financial family | Date and value date | Currency | Original amount |
|---|---|---|---|---:|
| PUR1118228 | 2 / commitment | 2024-12-06 | GBP | 2,500,000.00 |
| 300001198733008 | 3 / disbursement | 2024-12-11 | GBP | 2,500,000.00 |
| PUR1145667 | 2 / commitment | 2025-06-22 | GBP | 2,500,000.00 |
| 300001484878126 | 3 / disbursement | 2025-07-02 | GBP | 2,500,000.00 |

The commitment family totals **GBP 5,000,000.00**. The disbursement family separately totals **GBP 5,000,000.00**. Each source transaction keeps its reference, date, original amount text, provider, receiver and complete original row. In particular, repeated GBP 2.5 million amounts represent distinct original records; native identity receiving must preserve all four transactions.

## Original planning periods

All five listed budgets use original-budget type 1 and value date 2024-12-03.

| Period start | Period end | Currency | Original amount |
|---|---|---|---:|
| 2024-10-01 | 2024-12-31 | GBP | 2,500,000 |
| 2025-04-01 | 2025-06-30 | GBP | 624,999 |
| 2025-07-01 | 2025-09-30 | GBP | 624,999 |
| 2025-10-01 | 2025-12-31 | GBP | 624,999 |
| 2026-01-01 | 2026-03-31 | GBP | 624,999 |

These five original values sum to **GBP 4,999,996**. The listed values differ from the commitment total by **GBP 4.00**. The source supplies no explanation for that difference. Retain the five planning periods and the difference in the operator report, with their original amounts. The selected source contains no budget row for January–March 2025. Preserve the actual period coverage.

## Whole receiving programme

1. Receive the complete original XML through the existing IATI source engine. Save one portfolio with the two explicit original activity identifiers; inspect the whole nine-row financial review and the parent/child programme data.
2. Capture the selected installed AMP workspace, full field metadata and possible-value responses, actual version/session, and complete original project records. Retain explicit native project coverage.
3. Select the actual GBP currency, FCDO donor organisation, actual adjustment type and complete destination project representation. Preserve required country/programme fields and all existing native funding attributes.
4. Map the two commitments to the actual commitment family and two disbursements to the actual disbursement family. Record the planning-budget disposition and the GBP 4.00 comparison in the full review.
5. Prepare each complete native project and inspect its full destination validation. Receive the original create/update operation through the same persistent journal, preserving returned project, funding and transaction identities.
6. Compare the complete intended and returned project, including full nested fields and each of the four original transaction identities. Export the complete original source, decisions, request/response history and operator report.
7. Independently receive the whole archive, reopen its same saved state, and re-export it. A following publisher edition continues this original programme and its received native identities when that actual next publication is acquired.

The complete source-owned operating programme is `receiving/amp.py`; its manifest and same-case continuation are documented in `receiving/AMP.md`. The retained original source acquisition is `1791828427.059809` under operation `DEVELOPMENT-GATEWAY-AMP-COMMISSIONING-20261012`.
