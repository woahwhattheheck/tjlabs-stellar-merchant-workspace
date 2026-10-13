# Humanitarian reporting and complete round receiving

This product turns selected operational tables into a reviewed administrative register, complete donor and cluster layouts, and an editable package that another analyst can reopen. The original table bytes, administrative reference edition, column mapping, named alias decisions and saved requests travel with the review.

The product uses the existing Stellar Forge Dataset engine for each selected table build. Its humanitarian domain adds administrative resolution, source-row issues, duplicate business-key review, exact decimal aggregation and comparison of two reporting editions. The installed application is **Humanitarian reporting**; its command is **dataset-humanitarian**.

## What the operator can do

The console provides source intake, complete header inspection, reference selection, editable mappings and reporting layouts, named alias review, saved review history, output paging and full package transfer. The same operations are available through the command line, authenticated HTTP service and typed JavaScript client. See [OPERATOR.md](OPERATOR.md) for the complete interface and [receiving/INPUTS_AND_HANDOVER.md](receiving/INPUTS_AND_HANDOVER.md) for the analyst handover.

A review selects one or two complete editions. Each edition binds its own original source and mapping; both editions use the same retained reference and ordered business-key fields. Column order and labels may differ between editions because each mapping explicitly selects its own physical input positions.

The report keeps these results together:

- Every normalized record, its original source row, complete selected values and administrative resolution.
- Unresolved codes or names, conflicting locations, missing keys and duplicate business keys.
- Complete output layouts with explicit row coverage, selected units and aggregation grain.
- Added, removed, changed and unchanged records between the two selected editions.
- Every original source, configuration, named decision, saved revision and complete request needed for independent receiving.

Full exports contain the entire selected review. A browser page, search field or results page does not limit their membership.

## Source formats and interpretation

The reader accepts UTF-8 comma-separated CSV, JSON record arrays, JSON tables with complete columns and rows arrays, GeoJSON FeatureCollections and XLSX worksheets. The saved source retains its original complete bytes. Choose the actual worksheet or table, its header row and optional immediately following HXL row.

CSV uses the comma delimiter and standard CSV quoting. A semicolon or tab-separated file needs an explicitly prepared CSV edition with its original retained separately. Dates remain named string columns. Formula cells in XLSX are rejected; the operator must supply an approved values edition when the workbook contains formulas.

JSON numeric source cells retain their original lexical number representation before column typing. Select decimal for exact decimal measures, number for the Dataset engine's numerical behavior, and string for identifiers and codes. Nested JSON values remain explicit source-cell text.

The inventory preview is only a navigation aid. It shows at most eight physical rows, sixty-four columns and two hundred forty characters per preview cell. The authenticated source-table reader supplies the complete selected row, including a wider or longer header. Save a mapping only after confirming the complete original header.

The principal limits are:

| Selection | Supported bound |
| --- | --- |
| Original source | 100 MiB |
| Source table | 250,000 data rows; 256 physical columns |
| Selected mapping | 1–63 original columns, plus generated source_row |
| Header selection | Physical rows 1–100 |
| Administrative levels | 1–6 consecutive levels within 0–5 |
| Review editions | 1 or 2 |
| Reporting layouts per mapping | 1 or 2 |
| Output columns | 1–64 |
| Aggregate measures | Up to 16 per layout |
| Mutation request | 1 MiB complete JSON |
| Full source-table page | 1–20 complete physical rows, up to 4 MiB returned |
| Register/output/comparison page | 1–1,000 records |
| Complete portable archive | 2 GiB |

These are product limits. A customer work order can set smaller input and delivery bounds.

## Pin the actual administrative reference

Retain a complete reference source and an exact reference definition. The definition names the source SHA-256, complete header, consecutive levels, code/name selections and optional alias or geometry selections. A selection is either an original zero-based column index or an explicit constant.

Record the real publisher, title, acquisition URL, source edition, retrieval timestamp with time zone, and supplied licence or attribution. A null licence means no licence was supplied in this selection. The application does not infer permission from the platform hosting a dataset.

The same workflow can use a supplied local code table or an appropriately selected public reference, such as an original national authority or an OCHA Common Operational Dataset obtained through its actual publisher record. Choose the precise file and edition used in the work; a portal home page is not a substitute for those original bytes. Preserve the original retrieval and licence with the review.

Codes and names support administrative resolution even when geometry is absent. If geometry is selected, retain its actual GeoJSON values and source. The product does not infer a boundary edition or coordinate transformation from an administrative name.

The required reference request shape is:

~~~json
{
  "requestId": "reference-original-001",
  "name": "Selected administrative edition",
  "source": "REPLACE_WITH_THE_ACTUAL_64_CHARACTER_SOURCE_SHA256",
  "table": "data",
  "headerRow": 1,
  "hxlRow": null,
  "expectedHeaders": ["country_code", "country_name", "region_code", "region_name"],
  "levels": [
    {"level": 0, "code": {"index": 0}, "name": {"index": 1}, "aliases": []},
    {"level": 1, "code": {"index": 2}, "name": {"index": 3}, "aliases": []}
  ],
  "provenance": {
    "publisher": "Actual source publisher",
    "title": "Actual reference title",
    "url": "https://publisher.example/selected-reference",
    "edition": "Actual selected source edition",
    "retrievedAt": "2026-10-13T00:00:00Z",
    "license": null
  }
}
~~~

The example is a shape, not a supplied reference or a permission statement. Replace every placeholder with the actual selected source and metadata. The complete request is saved and replayed under its original requestId.

## Map canonical fields and reporting layouts

Each column selects an original physical index and a canonical field name, label, type, nullability, trimming rule, optional HXL tag and unit. Supported types are string, integer, number, boolean and decimal. Keep location codes and business identifiers as strings, including values with leading zeroes.

The mapping also selects:

- Administrative level, code field, name field and optional parent/scope code.
- One to twelve ordered business-key fields used to compare editions.
- One or two complete output definitions.
- Original Dataset filters, ranges, sort capabilities and row/byte limits when needed.

A tabular output lists selected fields in exact order. An aggregate output selects groupBy fields and named sum, count, count-distinct, min or max measures. Equality filters are part of the saved output definition. Measures and currencies remain separate unless an explicit input or mapping defines a conversion.

Decimal sums are returned as exact decimal text. Missing values remain missing. A nullable blank amount does not become zero; count of all rows and count of nonmissing amounts can have different meanings. Keep the chosen measure's denominator and coverage visible.

When locations cannot be resolved from the pinned reference, inspect the original code/name, level, scope and candidate records. Save an explicit alias decision with reviewer and reason. Its reference, source value, scope and destination code remain immutable. Select that decision in a new review revision rather than changing a historical reference or source.

## Save reviews and retain their original requests

Review and request identifiers are named, letter-prefixed identifiers of at most eighty characters. Source, reference, mapping, alias, build and report identities are SHA-256 values.

The first save uses the chosen review id and expectedRevision:0. Later saves select the actual observed saved revision. A repeated requestId with the identical complete input returns its original result, even after later revisions exist. The same requestId with different input is rejected.

The console retains its complete pending JSON request or upload Blob before dispatch. Reloading can continue that same operation through the native request lookup. A request lookup is considered absent only when the original service explicitly returns the documented missing-request response. The console retains a complete receiving result before clearing the pending operation.

Review status is derived from explicit coverage:

| State | Interpretation |
| --- | --- |
| ready | Every selected row is included |
| needs-review | require-complete was selected and one or more rows have errors |
| partial | valid-rows was explicitly selected and some original rows are excluded |

Partial reporting remains an explicit decision. The report keeps total, included and excluded row counts, original issues and row policy. Two duplicate rows are both excluded from keyed comparison until the original source selection is corrected.

## Command line workflow

Use the installed dataset-humanitarian command, or invoke the selected source entry with Node:

~~~sh
node /absolute/repo/stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/cli.mjs \
  --workspace /absolute/private-workspace init
~~~

The Node entry retains the actual Node executable for the original Dataset engine. Select Python with the existing runtime environment or the wrapper's --python /absolute/python option. Python 3.11 or later is required.

The following examples use the installed command. All input JSON files are complete original mutation requests.

~~~sh
dataset-humanitarian --workspace /absolute/private-workspace source \
  --file /absolute/reference.csv --label "Original administrative reference"

dataset-humanitarian --workspace /absolute/private-workspace source-table \
  --source ACTUAL_SOURCE_SHA256 --table data --offset 0 --limit 1

dataset-humanitarian --workspace /absolute/private-workspace save-reference \
  --input /absolute/reference-request.json

dataset-humanitarian --workspace /absolute/private-workspace save-mapping \
  --input /absolute/mapping-request.json

dataset-humanitarian --workspace /absolute/private-workspace save-alias \
  --input /absolute/alias-request.json

dataset-humanitarian --workspace /absolute/private-workspace save-review \
  --input /absolute/review-request.json
~~~

Read selected revisions and complete pages:

~~~sh
dataset-humanitarian --workspace /absolute/private-workspace history --id reporting-round

dataset-humanitarian --workspace /absolute/private-workspace report \
  --id reporting-round --revision 2

dataset-humanitarian --workspace /absolute/private-workspace rows \
  --id reporting-round --revision 2 --edition 0 --offset 0 --limit 50 --issues

dataset-humanitarian --workspace /absolute/private-workspace output-rows \
  --id reporting-round --revision 2 --edition 0 --output donor --offset 0 --limit 50

dataset-humanitarian --workspace /absolute/private-workspace comparison-rows \
  --id reporting-round --revision 2 --offset 0 --limit 50

dataset-humanitarian --workspace /absolute/private-workspace request \
  --id original-save-request

dataset-humanitarian --workspace /absolute/private-workspace query \
  --build ACTUAL_BUILD_SHA256 --params '{"limit":"1000"}'
~~~

The call command accepts a complete {"operation": "...", "args": {...}} input file. See OPERATOR.md for the exact operation names and typed client methods. Request identifiers and full input bodies are part of durable receiving, not transient progress labels.

## Complete reporting outputs

The report-export command creates the complete output package for the selected revision:

~~~sh
dataset-humanitarian --workspace /absolute/private-workspace report-export \
  --id reporting-round --revision 2 --output /absolute/Reporting_Round_Report.zip
~~~

The package includes complete ordinary donor and cluster CSV layouts, HXL CSV when tags are selected, Excel import CSV with code-preservation guidance, complete normalized rows and issues, comparison records, JSON, SQLite with saved edition views, local Kobo choices and XLSForm survey/choices/settings source tabsets, and an offline HTML report.

XLSX is a supported input format. The core output for Excel is CSV prepared for explicit import; the core does not claim to generate a native XLSX workbook. The Kobo tables are source tabsets for the owner's XLSForm workflow. They preserve actual code/label/parent relationships and a reversible lookup where the original codes need a safe form identifier.

The SQLite and normalized outputs contain the complete selected records. Keep them private to the authorized reporting audience when the source contains operational or personal information. Any wider publication or disclosure configuration belongs to the actual source owner and reporting agreement.

## Independent receiving and history

The export command produces a full receiving package. It adds every selected original source, native Dataset build, reference, mapping, alias, historical review and original request to the reporting outputs.

~~~sh
dataset-humanitarian --workspace /absolute/private-workspace export \
  --id reporting-round --revision 2 --output /absolute/Reporting_Round_Complete.zip

dataset-humanitarian --workspace /absolute/receiving-workspace init

dataset-humanitarian --workspace /absolute/receiving-workspace receive \
  --file /absolute/Reporting_Round_Complete.zip

dataset-humanitarian --workspace /absolute/receiving-workspace history \
  --id reporting-round

dataset-humanitarian --workspace /absolute/receiving-workspace review \
  --id reporting-round --revision 1
~~~

The receiver verifies the full package and reconstructs native builds and complete reports from the retained inputs. It compares the original requests and saved results before accepting the selected history. A rejected package does not publish a partly accepted review history. Receiving an older package again preserves a later local review revision.

Close the source and receiving processes, reopen the same workspaces, and inspect the selected earlier revision and the receiving analyst's later continuation. Retain the actual archive descriptor and complete returned receiving record with the handover.

## Complete engineering operating case

The source-owned receiving driver is receiving/operate.py. It accepts a real complete administrative reference and its exact save-reference request; it generates clearly labelled engineering operational records for the application exercise. It never describes those records as beneficiary observations or customer data.

Run it under one stable private directory:

~~~sh
python3 -B /absolute/repo/stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/receiving/operate.py \
  --reference-source /absolute/selected-reference.csv \
  --reference-definition /absolute/exact-reference-request.json \
  --directory /absolute/humanitarian-operated-case
~~~

Set SF30_XML_NODE to the absolute existing Node executable when Python cannot discover the selected native runtime. The reference request's source must equal the SHA-256 of the complete supplied reference file. JSON and GeoJSON references use the same input contract and their actual selected headers and levels.

The operation is HUMANITARIAN-COMPLETE-RECEIVING-7108-20261013 and the review is humanitarian-receiving-example. The driver keeps its original whole-case lock, stable source selection, complete input files and native request IDs across retries.

The case exercises:

1. Thirty-two generated records using actual deepest reference nodes, cycling those nodes if the reference has fewer than thirty-two. The complete reference remains retained.
2. An original before edition with a duplicate R002 and an after edition with one unresolved example name: 65 total rows, 62 included and 3 excluded.
3. A complete corrected before edition and a named alias decision: 64 total rows, all included, with the original source and first revision preserved.
4. A physically reordered and renamed after table mapped to the same canonical fields, with one added record, one removed record, two changed records and twenty-nine unchanged records.
5. Exact decimal aggregation of 0.1 and 0.2 to the text 0.3, with a separate missing amount retained as missing.
6. Full normalized/output/comparison pages and original Dataset queries for both thirty-two-row builds.
7. Identical original request replay and rejection of a changed body under the same request ID.
8. Complete report and history exports, an independent receiver, a later recipient practice revision and preservation of that revision after receiving the older original package again.
9. Source and receiver cold reopen, followed by actual command-line report and history reads.

Every final JSON and archive is published from complete retained bytes. A retry reuses the same original request or completed output. Partial private staging and actual failed CLI logs remain available for diagnosis; they do not become accepted completion records.

The final operated-case.json is written only after this whole workflow succeeds. It contains the exact selected archive descriptors, result counts, source and receiving workspace paths and the identities of all complete selected operating files. The principal exported files are:

- exports/Humanitarian_Engineering_Report.zip
- exports/Humanitarian_Complete_Receiving.zip
- exports/Humanitarian_Recipient_R3_Receiving.zip

Rerun the same command and directory after a recoverable interruption. If the original external files moved, the retained originals/reference.source and originals/reference-definition.json can supply those identical complete bytes. A completed rerun verifies the saved artifact identities and reopens the original selected histories.

Source publication, parsing or configuration review is not a native completion claim. The actual operated-case.json and complete retained archives establish the completed operating result.

## Installed application and handover

Build and receive the full distribution with selections/humanitarian-operator.json, then verify the original READY receipt. Open the existing Applications console, select Humanitarian reporting, choose the original initialized or received workspace and the actual Python executable, review and save the request, and start that saved application.

The application provider binds the whole selected source and original workspace identity. Stop and close it through the existing Applications lifecycle so accepted HTTP requests and native Dataset work finish under the original owner. The typed client's close also drains accepted requests; downloads retain the complete original response through transfer or cancellation.

Keep the source commit, selected distribution manifest, READY receipt, original reference provenance, complete requests, named analyst practice and final receiving package with the handover. A source or reporting-definition change should create an explicit new selection and saved revision. The earlier edition remains available for explanation and comparison.
