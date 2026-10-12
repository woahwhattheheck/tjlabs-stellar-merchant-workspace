# Complete FCDO organisation planning and receiving

This programme operates the complete original FCDO organisation publication
retained on 12 October 2026. It uses the installed IATI workspace, organisation
engine, original command, typed client, Merchant Source Workspaces, retained-file
reader and operator browser.

The input is a complete 99,013-byte publisher XML file with SHA-256
`c18e63db2d543eaeb5525a4df21cd16561f0316dab831789bfdd176e1accdfce`.
It contains organisation `GB-GOV-1`, 148 financial records and 80 document
links. The financial register contains six total budgets, 101 country budgets,
30 region budgets and 11 expenditure records. The original source and actual
retrieval record are retained in
[the FCDO example](../examples/fcdo-organisation-2026/SOURCE.md).

## Complete operated workflow

The Python programme retains the original source in one private IATI workspace
and reads every financial and document record. It selects the two actual document
URLs with trailing spaces, obtains their original XML-bound attribute targets,
and removes only those spaces in a new saved revision. It compares every
financial record's original node identity and bytes across that correction.

The assessment date is 12 October 2026, with the publisher's April fiscal-year
start and a three-year forward horizon. The selected PWYF reference is the
technical paper updated on 3 June 2026. Named review retains every required
manual finding and the source's indicative forward-planning explanations.
The programme requires actual successful validation of the complete candidate
against the installed official organisation XSD before creating the reviewed
release.

It then reopens that release with the original command parser, writes all five
complete files, and exports the native ZIP. Two original consoles provide the
sender and receiver interfaces for the same customer continuation. Their private
connection files exist only for those running consoles.

The [Node continuation](organisation.mjs) uses the original typed client and
Merchant Source Workspaces to page the complete registers and inspect exact
selected XML elements. It preserves the original save, review, release and
comparison requests, continues the sender with a receiving note, and reopens
those earlier action results. It downloads the complete ZIP, original and
candidate XML, HTML report and both CSVs. A released temporary file read is
reopened at its saved offset and continues to the complete original hash.

The receiver imports that complete packet, records its own receiving note, then
receives the same earlier packet again. The imported historical selection and
the receiver's current local revision remain explicit. Closing and reopening
the MCP preserves the original retained exports. The original receiving command
then reopens the same current plan after both consoles close.

The [browser continuation](organisation-browser.mjs) opens the actual saved
plan, reads both document pages, selects exact document and descendant title
XML, inspects the supported URL editor, reads the validation and complete
history, and downloads the original XML. Desktop and phone-sized screenshots
accompany the native output.

## Run from the selected installation

Use Python 3.11 or newer with Expat 2.6 or newer and `lxml`, and the original
Node runtime supported by this installation. The browser continuation takes
the installed Chromium executable and Playwright module paths.

Run the programme from the complete repository or installed source tree:

~~~bash
python -B stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/organisation.py \
  --source stellar/scf-starforge-20261009/sf30-seller-sdk/iati/examples/fcdo-organisation-2026/organisation.xml \
  --acquisition stellar/scf-starforge-20261009/sf30-seller-sdk/iati/examples/fcdo-organisation-2026/publisher-receipt.json \
  --output /private/fcdo-organisation-customer \
  --mcp-directory stellar-forge/mcp-merchant-operator \
  --node /absolute/original/node \
  --browser-driver stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/organisation-browser.mjs \
  --chromium /absolute/installed/chromium \
  --playwright /absolute/installed/playwright/index.mjs
~~~

Keep the same output directory and original input when continuing an interrupted
operation. The programme reuses the same source, plan and request IDs. Actual
subprocess attempts retain their own complete logs and are referenced from
`operation-state.json`. Native request replay selects the original result
before a later revision can change its meaning.

The Node programme can also continue already running sender and receiver
consoles using the private configuration prepared by Python:

~~~bash
node organisation.mjs /private/original-continuation.json
~~~

Its input selects the original IATI and MCP source directories, private sender
and receiver connection files, retained export directory, output directory,
source and organisation IDs, released plan/revision, four exact saved requests
and original register counts. The full reference implementation validates this
selection before calling the existing product.

## Customer output

| Path | Complete material |
| --- | --- |
| `publisher/` | Actual original XML, retrieval record and source profile |
| `delivery/FCDO_Organisation_Planning.zip` | Complete native released handover |
| `delivery/organisation-source.xml` | Original publisher bytes |
| `delivery/organisation-candidate.xml` | Reviewed complete XML with the two URL corrections |
| `delivery/organisation-report.html` | Readable dated planning and review report |
| `delivery/organisation-budgets.csv` | Every financial record in its original context |
| `delivery/organisation-documents.csv` | Complete document register |
| `reports/` | Exact requests, released plan, comparison, findings, corrected URLs, source binding, command reopen and actual process logs |
| `merchant/` | Complete client/MCP receiving outputs, original file material and continuation observations |
| `browser/` | Operator screenshots, complete original XML download and browser observations |
| `sender-workspace/`, `receiver-workspace/` | Original editable workspaces with retained source and full plan history |
| `merchant-exports/` | Original complete retained exports, reusable after the MCP closes |
| `operation-state.json` | Current customer result, source identities, completed stages and actual continuation attempts |

The customer handover retains the publisher's source attribution, original
financial values and native methodology references. The named internal review
records the actual selected planning and document observations. The original
publication and its explanatory FCDO extensions remain available alongside the
reviewed candidate.

Read [the complete organisation guide](../organisation/GUIDE.md) for the source,
assessment, correction and receiving contract, and
[the IATI operator guide](../OPERATIONS.md#organisation-planning-and-complete-customer-handover)
for daily browser, command, client and merchant operation.
