# Original FCDO organisation publication

This example retains the complete publisher file returned by
[the FCDO organisation endpoint](https://iati.fcdo.gov.uk/iati_files/organisation.xml)
on 12 October 2026.

| Observation | Original value |
| --- | --- |
| HTTP status | 200 |
| Full source bytes | 99,013 |
| SHA-256 | c18e63db2d543eaeb5525a4df21cd16561f0316dab831789bfdd176e1accdfce |
| Git blob | 4382410c0b198d62daa969ea664e3a679d3be4f3 |
| Publisher Last-Modified | 15 June 2026, 15:37:08 GMT |
| IATI version | 2.03 |
| Organisation identifier | GB-GOV-1 |
| Financial register | 6 total budgets; 101 recipient-country budgets; 30 recipient-region budgets; 11 total-expenditure records |
| Document register | 80 complete document links |
| Current catalogue dataset | 3faa890f-b58c-497c-86af-2f6adda0ba1a |
| Current catalogue publisher | 4da32e41-a060-4d75-86c1-4b627eb22647 |
| Catalogue licence | uk-ogl |

The original current catalogue declares
`http://iati.fcdo.gov.uk/iati_files/organisation.xml` as its source URL.
The retained HTTP request followed the publisher's HTTPS endpoint and received
the complete source above. The actual original acquisition observations,
response headers and source identities are in
[publisher-receipt.json](publisher-receipt.json).

FCDO data is attributed to the Foreign, Commonwealth & Development Office under
[the Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
Preserve the publisher's original licence and attribution with downstream use.

[The complete organisation receiving programme](../../receiving/ORGANISATION.md)
uses this exact file. Its two document URL whitespace corrections preserve every
original financial element, date, document category and FCDO explanatory extension.
The original file remains unchanged in this example.
