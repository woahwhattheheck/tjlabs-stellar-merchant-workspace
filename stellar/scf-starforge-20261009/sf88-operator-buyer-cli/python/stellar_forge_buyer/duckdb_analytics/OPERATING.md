# Analytical customer workbooks

This application turns an acquired dataset edition into a complete analytical workbook. It runs inside the original Stellar Forge DuckDB workspace and retains the original source rows, dictionaries, saved queries and warehouse identity.

## Open the customer application

Use Python 3.11 or later and the original pinned DuckDB 1.5.6 runtime:

```sh
python -m pip install 'duckdb==1.5.6'
PYTHONPATH=application python -m stellar_forge_buyer.duckdb_cli \
  --workspace /absolute/private/working-warehouse serve --open
```

Choose **Analytical workbooks** in the original dataset operator. The same private localhost listener and launch capability serve the analytical application at /analytics/. The application reads original imported editions; source acquisition and import remain in the original Dataset workspace.

1. **Source and fields:** select a retained edition, inspect original field meanings, native types, NULL counts and distinct values.
2. **Analysis builder:** choose dimensions, measures, explicit filter rules and optional selected-value pivots. Review the native definition, save its revision, and execute the saved revision.
3. **Results and comparisons:** page the complete immutable results, review independent overall totals and pivot coverage, then compare two results using the full unique group key.
4. **Workbook editor:** arrange table, bar, line and editorial pages. Each result page retains an exact result identity. Save the ordered workbook revision and publish that revision.
5. **Published reports:** export a complete HTML/CSV/Parquet/source/application/warehouse package. Download the whole ZIP or any original declared file.
6. **Requests and history:** inspect an interrupted operation and continue its original retained request. Older definitions and workbook editions reopen by their exact revision.

## Native analysis contract

An analysis selects one immutable source edition. Every dimension and measure refers to a reviewed original SQL column; its source field, native type and dictionary meaning remain available in the result. Labels are data and are escaped in the browser and exported report.

Dimensions group by the original value or by day, ISO week, month, quarter or year. Calendar grouping is allowed only on DATE, TIMESTAMP and TIMESTAMPTZ. TIMESTAMPTZ calendar groups use UTC; original TIMESTAMP values keep their native time interpretation. NULL dimensions form their own group.

Measures support source row count, non-null count, distinct non-null count, SUM, AVG, MIN and MAX. SUM and AVG require a native numeric source. Their explicit NULL rule either excludes NULL or supplies a native typed zero. Other measures exclude NULL as their aggregate contract requires. Counts return zero for an empty selected overall input; SUM, AVG, MIN and MAX return NULL. An empty dimensioned selection contains zero groups. No implicit rate, weight, currency conversion or missing-value replacement is added.

Filters use the original typed native comparison. All filter clauses are joined with AND. NULL inclusion is explicit. IN/NOT IN and BETWEEN retain their complete declared values; BETWEEN includes both endpoints. Pass large integers and decimal values as exact strings in browser JSON or agent arguments. The original Python importer conversion and explicit native casts preserve their types.

A selected pivot creates one measure column for each chosen value. NULL and other non-null values can each be included explicitly. The result records selected and unselected source-row coverage. Overall totals are computed directly from the selected source rows; averages and distinct counts are never obtained by adding grouped results.

The reviewed definition includes SQL, bound parameters, original source identity and field meanings. A preview contains at most100 rows and is labeled. Execution materializes every native result group and retains its complete ordered typed fingerprint, exact original query recipe and separately computed source totals.

Default row order uses the complete dimension keys with NULL last. An explicit order may select output columns, direction and NULL placement. Remaining dimension keys resolve ties. Measures over a single overall row need no key.

## Exact edition comparisons

Select two retained analysis results whose complete output names and native types match. Choose keys that uniquely identify a group on both sides. The application checks uniqueness in the complete native tables before matching. NULL keys match using native NULL-safe equality.

Every group receives added, removed, changed or unchanged status. Before and after values retain their original native types. Missing sides and present NULL values remain distinguishable through status and the separate columns.

Numeric change is the exact decimal subtraction of the two native integer/decimal values. For FLOAT/DOUBLE, it is the exact subtraction of their native binary values expressed as decimal strings. It does not round a large integer into a JavaScript number or force a result into a narrower decimal. Missing values and non-finite comparisons yield NULL change. The report retains both analysis definitions and source-meaning comparison so a change in rules can be assessed alongside the change in values.

## Workbook editions and report behavior

A workbook is an ordered set of pages. Table pages contain all selected result rows and fields. Bar/line pages declare a chart selection from the retained order, from1 to2,000 groups, and up to eight numeric series. Their complete result table remains included below the chart. NULL and non-finite chart values leave gaps. The graph uses a common linear scale, includes zero and retains exact values in point titles and tables. Chart positions are a visual representation; the native table and export carry exact values.

Editorial notes are plain text. No HTML, script or external visualization service is executed from source labels or notes.

Saving uses the current expected revision. A historical analysis or workbook can be opened without changing it, then deliberately saved as a following revision. Publishing captures the exact saved workbook revision and all result/source identities. Following source editions, analyses and publications do not rewrite prior reports.

## Complete export

The original native exporter produces one retained customer directory and analytical-workbook.zip:

| Path | Contents |
|---|---|
| report.html | Complete original table rows, declared SVG charts, editorial notes and source context |
| report.json | Exact captured workbook/report and complete result definitions |
| queries/result-ID/ or queries/comparison-ID/ | Original retained SQL query, full CSV, typed Parquet, native schema and dictionary/source meanings |
| sources/EDITION/ | Every original source file embedded in that edition, plus its source-receiving index |
| application/ | Actual installed Python application source, package assets and available original package metadata |
| warehouse/ | Original native sparse warehouse snapshot and its handoff request/manifest |
| OPERATING.md | This complete operating and receiving guide |
| analytics-request.json | The original export request, exact report, source application identities and view bindings |
| manifest.json | Exact identities of every package member |

The whole ZIP contains the members described by manifest.json, including the complete manifest itself. Its file identity is returned separately by the original export record to avoid a circular manifest.

CSV retains exact textual values. Parquet uses the original exporter’s explicit source/stored type representation. In particular, the pinned DuckDB writer’s HUGEINT/UHUGEINT representation is handled by the original lossless export path. Consult each native query manifest for the stored type and lossless restoration expression.

Source metadata, mappings, dictionaries and nested original pages preserve their exact filenames and bytes. Derived analytical query exports identify their original source editions and retain their result definitions alongside the original meanings.

The workspace remains the sole database and query owner. The package uses its original CHECKPOINT, sparse-copy and backup behavior. A snapshot is stored outside the working workspace; snapshots are never recursively embedded inside the database.

## Independently receive a complete workbook

Extract the ZIP as a new private directory with directory permissions0700 and file permissions0600. Preserve all member bytes. Use the exact manifest SHA-256 provided by the completed export.

```sh
PYTHONPATH=/absolute/private/package/application python \
  -m stellar_forge_buyer.duckdb_analytics.package inspect \
  --directory /absolute/private/package \
  --manifest-sha256 EXACT_MANIFEST_SHA256

PYTHONPATH=/absolute/private/package/application python \
  -m stellar_forge_buyer.duckdb_analytics.package receive \
  --directory /absolute/private/package \
  --destination /absolute/private/received-workspace \
  --manifest-sha256 EXACT_MANIFEST_SHA256 \
  --workspace-id ORIGINAL_32_HEX_WORKSPACE_ID

PYTHONPATH=/absolute/private/package/application python \
  -m stellar_forge_buyer.duckdb_cli \
  --workspace /absolute/private/received-workspace serve --open
```

Receiving verifies the complete package and copies the exact original native snapshot into a distinct working directory. It reopens the original workspace identity, report, result records, complete typed fingerprints and source editions. The immutable package remains the receiving input; the new working warehouse can subsequently retain new analysis and workbook revisions.

The original receive request records COPY_PREPARED and COPY_PUBLISHED before native reopening. If interrupted, run the same command against the same manifest and destination. After completed receiving, the original receipt remains reusable even as the working warehouse adds revisions. A changed package, mismatched destination or changed original result is rejected with a specific binding error.

To recover every original file from a received edition:

```sh
PYTHONPATH=PACKAGE/application python -m stellar_forge_buyer.duckdb_cli \
  --workspace RECEIVED_WORKSPACE source-files EDITION_ID --destination NEW_PRIVATE_SOURCE_DIRECTORY
```

## Original CLI

Every command uses the original CLI:

```sh
python -m stellar_forge_buyer.duckdb_cli --workspace WORKSPACE analytics status
python -m stellar_forge_buyer.duckdb_cli --workspace WORKSPACE analytics source EDITION_ID
python -m stellar_forge_buyer.duckdb_cli --workspace WORKSPACE analytics review --definition-file analysis.json
python -m stellar_forge_buyer.duckdb_cli --workspace WORKSPACE analytics save-analysis --request-file save-analysis.json
python -m stellar_forge_buyer.duckdb_cli --workspace WORKSPACE analytics run --request-file run-analysis.json
python -m stellar_forge_buyer.duckdb_cli --workspace WORKSPACE analytics rows results RESULT_ID --offset 0 --limit 100
python -m stellar_forge_buyer.duckdb_cli --workspace WORKSPACE analytics compare --request-file comparison.json
python -m stellar_forge_buyer.duckdb_cli --workspace WORKSPACE analytics save-workbook --request-file workbook.json
python -m stellar_forge_buyer.duckdb_cli --workspace WORKSPACE analytics publish --request-file publication.json
python -m stellar_forge_buyer.duckdb_cli --workspace WORKSPACE analytics export --request-file export.json --destination NEW_PRIVATE_PACKAGE
```

Save-analysis requests contain request_id, workspace_id, definition, expected_revision and review_sha256 from the native review. Run requests contain request_id, workspace_id, analysis_id and exact revision. Compare requests contain request_id, workspace_id, before_id, after_id, keys and optional title. Workbook saves contain request_id, workspace_id, definition and expected_revision. Publications contain request_id, workspace_id, workbook_id and revision. Exports contain request_id and report_id, and use the original retained export directory owner.

Request IDs are32 lowercase hex, native record IDs are64 lowercase hex. Save request files before sending them and keep the same ID/body after a lost response. `analytics request ID` reads the actual retained state; `analytics resume ID --workspace-id ID` continues that original analytical operation. HTTP export requests use the original operator request/resume route.

## Original MCP agent and client

The original merchant paid-agent action remains duckdb. Register the existing separately owned DuckDB service through the maintained host registration flow; an agent argument is a registered alias, never a raw capability or host path.

The additive analytics operations cover source review, saved definitions, full execution, result grids, exact comparisons, workbook revisions, publication, request recovery and complete export. They are declared in native-duckdb-analytics-schema.mjs and dispatched through the original authenticated get/post functions. The original workspace identity is supplied by the existing host registration.

Use analytics-export-manifest for the small manifest and whole-ZIP file descriptors. The existing file operation reads exact retained bytes in at most64KiB ranges with original SHA-256 checks. It neither reruns SQL nor starts another receiver. For large source contexts use paged records/grids and the full report/query/source files in the exported package.

## Installation and source distribution

The analytical subpackage is included in the original Python package list and package data. No new service, database daemon or browser dependency is introduced. Native model and report rendering use the pinned DuckDB runtime and Python standard library.

The canonical standalone distribution selection is analytical-workbooks. It composes the existing buyer/dataset/Python/DuckDB/source-delivery/merchant/MCP/runtime components and this operating guide. It preserves the original source application, reconciliation, GIS and VGI products.

## Native engine references

The implemented aggregate and NULL behavior follows the original DuckDB SQL contract:
https://duckdb.org/docs/current/sql/functions/aggregates

Selected pivot measures use the native FILTER clause:
https://duckdb.org/docs/current/sql/query_syntax/filter

Calendar grouping uses native date_trunc/date parts, with explicit UTC conversion for TIMESTAMPTZ:
https://duckdb.org/docs/current/sql/functions/datepart
