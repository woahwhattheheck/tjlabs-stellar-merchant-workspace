# Accreditation migration workbench

A complete editable programme for original accreditation data, source editions, assessments, Word forms, exact fee calculations and native receiving. The browser, command-line client, source model, SQLite receiver, document extractor/filler and portable receiving utility ship together.

## Open the application

Use Node.js 20 or later and Python 3.11 or later. The application and receiver use their standard libraries. Run these commands from this directory:

~~~sh
node cli.mjs init --workspace /path/to/ianz-project
node cli.mjs serve --workspace /path/to/ianz-project
~~~

Open the exact loopback URL printed by the server, normally http://127.0.0.1:8116. The chosen directory holds the saved project and its receiving database. Use a separate directory for each programme. The same workspace is opened by one application process at a time; stop its server before using the mutating CLI commands against that directory.

A selected runtime or existing receiving database can be supplied explicitly:

~~~sh
node cli.mjs serve --workspace /path/to/ianz-project --python /path/to/python3 --database /path/to/actual-target.sqlite --port 8116
~~~

The browser saves edits to project.json. Each save checks the revision opened by the editor and records the original and changed record values. Source files, binary originals, native requests, returned observations, mappings and document-fill selections travel with the project.

## Eight working views

| View | Working operation |
| --- | --- |
| Sources | Retain complete original files, review source editions, choose the selected edition and import CSV through explicit original-column mappings |
| Accounts and sites | Edit issuer accounts and facilities with their original keys, published labels and links |
| Accreditations and scope | Work with accreditation and scope records; inspect published edition changes and the recorded ISO transition profile |
| Assessments and documents | Edit cases, assignments, participants, findings and decisions; retain full original documents; inspect native Word controls and create filled successors |
| Billing | Select published tariff lines, exact quantities, account/period groups, explicit tax and rounding; retain cap allocation and original source amounts |
| Target mapping | Read an actual native schema and save all 15 entity mappings with external keys, field bindings and value/blank policies |
| Receiving | Save the original full request, receive or recover it, read the actual current target and review all returned differences |
| Handover | Download the saved project, complete application delivery and standalone receiver; reopen the same project and its history |

## Included original source cohort

examples/original-cohort.json contains 16 complete public source, data and contract files from the original IANZ workshare. Each file retains its original byte count and SHA-256. The source register contains 28 observations with original URLs and locations. The first project materializes 82 records across the complete 15-entity, 191-field contract:

- 28 source editions.
- 19 programmes.
- Three issuer accounts, three published facilities and three accreditation records.
- 24 selected scope transcription rows.
- Two published fee profiles.

The source links and interpretation details remain in the original source register and delivery/source-transcription-notes.md within that retained packet. The public cohort includes source observations and selected transcriptions. Receive the actual Word/PDF bytes in Assessments and documents to attach their complete originals and inspect their structures.

Accreditation publication observations, recorded standard editions, expiry/status decisions and actual legal-party identifiers are separate fields. The original published MicroAquaTech, IAWAI and MEC NZ observations preserve their individual issue numbers, source dates and conditions. Earlier Hamilton/IAWAI labels and superseded method references remain in the retained edition comparison.

The published tariff sources are [IANZ AS19, July 2026](https://www.ianz.govt.nz/media/bkjfhlun/as19-fee-schedule-drinking-water-laboratory.pdf) and [IANZ AS14, July 2026](https://www.ianz.govt.nz/media/gcompp0b/as14-fee-schedule-inspection-bodies.pdf). Their source-selected NZD rates exclude GST. Tax is an explicit calculation input. The assessment, finding, participant, decision and customer charge tables can then receive their actual selected source records.

## Receive original records

The CSV importer reads complete UTF-8 input and preserves quoted multiline fields. Select the canonical entity, map each original column or constant, and choose how blank cells behave. The preview shows the original row/key and whether it updates an existing record. It reports typed field errors before any records are saved.

Existing source keys are immutable. A correction updates the corresponding record and records its before/after values. A different original identity is received as a distinct record. Original CSV bytes, field mappings, source row locations and the resulting source edition remain available after import.

The equivalent CLI operation is:

~~~sh
node cli.mjs import-csv --workspace /path/to/ianz-project --entity issuer_account --input /path/to/original-accounts.csv --mapping /path/to/column-mapping.json --source-id actual-source-id --source-url https://original.example/source
~~~

column-mapping.json is a complete array of selected fields. Each entry uses field, source_column or constant, and blank_policy. The policies are preserve, clear or reject. Exact canonical column names map automatically when --mapping is omitted.

## Work with the actual original documents

Add the complete original file, its logical document key, source URL, original source ID, role, access class and any accreditation association. To attach bytes to an existing published source edition, enter that exact source edition ID. The application enriches an edition that has no original bytes; an edition already bound to other original bytes requires a new edition.

~~~sh
node cli.mjs add-document --workspace /path/to/ianz-project --input /path/to/application-for-accreditation-lab.docx --document-key laboratory-application --role application --source-id S21 --source-url https://www.ianz.govt.nz/media/002n2sux/application-for-accreditation-lab.docx
node cli.mjs map-document --workspace /path/to/ianz-project --document-key laboratory-application
~~~

After multiple editions exist for one logical key, use the exact composite document key returned by add-document or shown in the project. It is the canonical JSON array of the logical key and original source edition ID.

Read form controls opens the actual DOCX ZIP and XML. The saved map retains every original member and its complete bytes, actual paragraphs/runs, tables and merges, content controls, field instructions, original choices, relationships and source locations. Download complete form map exports that full result; the record editor displays the useful counts and actions.

Fill template opens those actual locations. Select a native control/field or supported original paragraph/run, inspect its current text and choose either an explicit value, an original native choice or a field from a saved canonical record. Add every intended selection, then create the filled document. Source-field selections retain their record key, canonical field, exact value and project revision. Empty source values require an explicit choice.

The receiver validates all selected locations against the retained original SHA-256 before editing. It returns the complete successor DOCX and its changes. The application reopens the actual successor map, saves a new document edition and links it to the prior template. Both files, their maps and the exact saved field selections remain in the project and full handover.

The CLI accepts the same complete bindings object:

~~~sh
node cli.mjs fill-document --workspace /path/to/ianz-project --document-key '["laboratory-application","document-ORIGINAL_SHA256"]' --mapping /path/to/saved-bindings.json
~~~

The placeholder composite key must be replaced by the actual returned document key. saved-bindings.json has a bindings array. Every binding names the actual part and locator from the saved map. A text binding contains mode: "text" and text, or source: {entity, external_key, field}. A native choice binding uses mode: "choice" and choice_value, or a source value matching one original choice. The server freezes the actual replacement and original visible text into the native mapping file.

The native command, exact result format and supported original Word structures are explained in [NATIVE_RECEIVING.md](NATIVE_RECEIVING.md). The same parser/filler exposes inspect_docx_bytes and fill_docx_bytes for an existing Python Project to call directly.

## Calculate published fees

Billing retains original decimal strings and uses rational arithmetic through multiplication, cap allocation and tax. It supports published work/travel rates, annual fees, recognition caps, actual-cost lines and explicit waiver inputs. Account, currency, tax basis, period and the source cap key determine the cap group.

Choose a rounding mode, decimal precision and line/invoice scope. Exact calculated amounts and allocated rounded amounts are separate saved values. With invoice rounding, the rounded line allocations sum to the rounded group total.

The included full source-based calculation input can be run directly:

~~~sh
node cli.mjs fees --workspace /path/to/ianz-project --input examples/fee-calculation.json
~~~

Its AS14 annual main, branch and satellite controls produce NZD 2760, 690 and 69. Six recognition lines at 276 total 1656 before the published 1380 cap, so the allocation records a 276 reduction. These calculations retain their tariff editions and chosen account/period grouping.

## Receive into an actual target

Initialize or inspect SQLite target reads the included receiver's actual schema and persistent environment identity. The browser binds every canonical entity and field to returned native tables/columns. Save later mapping changes as complete mapping editions.

For another receiving implementation, import its actual schema in the same documented native schema format and supply its returned result to Receiving. Its mapping must name the actual selected environment. The included local server operates the supplied SQLite receiver; an existing Project can integrate through the source-level and native interfaces in the contracts and guide.

A complete CLI sequence is:

~~~sh
node cli.mjs target --workspace /path/to/ianz-project
node cli.mjs prepare --workspace /path/to/ianz-project --request-id original-intake-001
node cli.mjs receive --workspace /path/to/ianz-project --request-id original-intake-001
node cli.mjs extract --workspace /path/to/ianz-project --request-id original-intake-001
~~~

prepare saves the original UTF-8 request before native receiving. Its hash includes the final newline. The request contains the complete selected records, native column mapping, original relationships and full source/document asset bytes.

receive first looks up that exact request ID in its selected native database. An existing committed result is recovered. A request absent from the native journal is applied using its original frozen bytes. The native database commits records, relations, assets, the original request and returned result together.

A later intentional change gets a new request ID. Previously returned native IDs and versions guard updates to existing rows in the same environment. An independently initialized target has its own environment and native IDs. The first accepted APPLIED result and each later EXTRACTED observation are retained separately.

The workbench compares the complete returned keys, mapped fields and representations, links, assets and original byte identities. Native records absent from the prepared source remain visible in the comparison. Each review action records the actual difference, chosen correction, reviewer and reason. A review decision preserves the source and target observations.

If an output connection is interrupted, reopen the workspace and run receive with the same request ID. The native lookup returns its original committed result. Actual errors and later recovery remain in the operation history.

## Deliver and reopen the whole programme

Download complete handover packages the current project, all canonical tables, retained source files, original binary assets, mappings, prepared requests, original native results, later observations, review decisions, document-fill operations and complete application source. FILES.json is the application inventory used by the server and packager.

The standalone receive-handover.mjs accompanies the browser download. A recipient can use:

~~~sh
node receive-handover.mjs --input complete-handover.json --output /path/to/clean-received-programme
node /path/to/clean-received-programme/application/cli.mjs serve --workspace /path/to/clean-received-programme
~~~

Or use the installed application's CLI:

~~~sh
node cli.mjs export --workspace /path/to/ianz-project --output /path/to/complete-handover.json
node cli.mjs receive-handover --input /path/to/complete-handover.json --output /path/to/clean-received-programme
~~~

The receiving utility checks each complete member and manifest before creating the destination files. Open the received project, inspect its original records and documents, make the intended successor changes, prepare the appropriate new request and export that current full programme.

To move an existing SQLite target with its native IDs and request journal, use a consistent closed database copy or SQLite's online backup. The editable project delivery carries the original requests/results; the selected live native database remains an explicit receiving environment.

## Maintained implementation

| Source | Responsibility |
| --- | --- |
| workbench.mjs | Canonical project, source/edit history, exact billing, mapping, native comparison and form bindings |
| workbench-ui.mjs, index.html, workbench.css | Complete industrial browser interface |
| server.mjs | Persistent workspace, local application routes, native process continuation and complete delivery |
| cli.mjs | The same saved workflow from the command line |
| receiver.py | Actual SQLite receiving, original lookup/extraction and full Word inspection/filling |
| receive-handover.mjs | Independent complete application receiving |
| lib/data.mjs, lib/sha256.mjs | Exact data, CSV, JSON, byte and decimal operations |
| contracts/ | Complete canonical definitions and process contract |
| examples/ | Original public source cohort and source-based fee calculation |

The bundled SHA-256 source retains its original MIT notice. Public source and contract files retain their original register and attribution. Keep case-specific private records and document bytes in their authorized operating workspace and complete recipient delivery.
