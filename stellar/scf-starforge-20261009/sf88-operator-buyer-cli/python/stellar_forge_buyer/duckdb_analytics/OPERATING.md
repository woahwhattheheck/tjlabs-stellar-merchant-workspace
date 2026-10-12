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

A selected pivot creates one measure column for each chosen value. Categories must remain distinct after native conversion to the source column type; different decimal spellings, values that round to the same FLOAT, and equal timestamp instants cannot create overlapping columns. NULL and other non-null values can each be included explicitly. The result records selected and unselected source-row coverage. Overall totals are computed directly from the selected source rows; averages and distinct counts are never obtained by adding grouped results.

The reviewed definition includes SQL, bound parameters, original source identity and field meanings. A preview contains at most 100 rows and is labeled. Execution materializes every native result group and retains its complete ordered typed fingerprint, exact original query recipe and separately computed source totals.

Default row order uses the complete dimension keys with NULL last. An explicit order may select output columns, direction and NULL placement. Remaining dimension keys resolve ties. Measures over a single overall row need no key.

## Exact edition comparisons

Select two retained analysis results whose complete output names and native types match. Choose keys that uniquely identify a group on both sides. The application checks uniqueness in the complete native tables before matching. NULL keys match using native NULL-safe equality.

Every group receives added, removed, changed or unchanged status. Before and after values retain their original native types. Missing sides and present NULL values remain distinguishable through status and the separate columns.

Numeric change is the exact decimal subtraction of the two native integer/decimal values. For FLOAT/DOUBLE, it is the exact subtraction of their native binary values expressed as decimal strings. It does not round a large integer into a JavaScript number or force a result into a narrower decimal. Missing values and non-finite comparisons yield NULL change. The report retains both analysis definitions and source-meaning comparison so a change in rules can be assessed alongside the change in values.

## Workbook editions and report behavior

A workbook is an ordered set of pages. Table pages contain all selected result rows and fields. Bar/line pages declare a chart selection from the retained order, from 1 to 2,000 groups, and up to eight numeric series. Their complete result table remains included below the chart. NULL and non-finite chart values leave gaps. The graph uses a common linear scale, includes zero and retains exact values in point titles and tables. Chart positions are a visual representation; the native table and export carry exact values.

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

Extract the ZIP as a new private directory with directory permissions 0700 and file permissions 0600. Preserve all member bytes. Use the exact manifest SHA-256 provided by the completed export.

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

Request IDs are 32 lowercase hex, native record IDs are 64 lowercase hex. Save request files before sending them and keep the same ID/body after a lost response. `analytics request ID` reads the actual retained state; `analytics resume ID --workspace-id ID` continues that original analytical operation. HTTP export requests use the original operator request/resume route.

## Original MCP agent and client

The original merchant paid-agent action remains duckdb. Register the existing separately owned DuckDB service through the maintained host registration flow; an agent argument is a registered alias, never a raw capability or host path.

The additive analytics operations cover source review, saved definitions, full execution, result grids, exact comparisons, workbook revisions, publication, request recovery and complete export. They are declared in native-duckdb-analytics-schema.mjs and dispatched through the original authenticated get/post functions. The original workspace identity is supplied by the existing host registration.

Use analytics-export-manifest for the small manifest and whole-ZIP file descriptors. The existing file operation reads exact retained bytes in at most 64 KiB ranges with original SHA-256 checks. It neither reruns SQL nor starts another receiver. For large source contexts use paged records/grids and the full report/query/source files in the exported package.

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


## Keep the complete browser workspace with the customer

**Browser workspace** saves the entire working analysis and report authoring state. It retains incomplete raw JSON, every dimension, measure, filter and pivot control, ordered report pages, chart controls, source and result selections, the original selected definition revisions, and complete original request bodies and accepted results. The state is limited to eight MiB. Native review, SQL execution and report publication continue to require their original valid definitions.

Current work is saved automatically in this browser after input changes. Each tab has its own working edition. Opening another source, applying a JSON definition, changing a report page or importing another saved workspace retains the previous complete form edition. **Earlier complete form editions** provides both reopening and full JSON download. A failed local write leaves the current form visible and gives its actual storage error.

Use **Save browser workspace** to put a named immutable revision in the existing DuckDB warehouse. This saves through the same native operation journal, process guard and transaction as the other analytical actions. The current browser identity and saved revision are displayed together. **Save under a new identity** prepares the same complete draft as another named workspace; it keeps the earlier saved history.

A later save includes the expected current browser revision. If another operator has changed that saved workspace, the original save returns a revision conflict. Open the actual current or historical revision deliberately, or save the retained draft under a new identity. Browser storage from another tab remains available in the earlier-editions list.

### Continue the selected native definition accurately

A reopened analysis retains both its original native record and the exact rendered editor baseline associated with that record's ID and revision. The baseline also follows a submitted save while later edits remain in the form. Numeric filter controls remain editable text without making an unchanged native definition appear to be a new analysis. Native ordering defaults do not discard the selected revision. A JSON-typed source string is displayed with its JSON quotes, so reopening it preserves the intended string value.

The same baseline rule binds a workbook's ordered pages to its selected native revision. A field, page, source or interpretation change makes the current draft require its next native review or save. The raw JSON editors are retained exactly and are replaced only through their explicit controls. An unfinished raw JSON edit can therefore travel with a completed native analysis without changing that analysis's saved source.

A saved browser workspace can contain a result page whose native result has not yet been selected. Its controls remain an unfinished page. Choosing **Load selected fields** opens the actual selected result fields before that page can be used for publication.

### Original request continuity

The native **Requests** screen reads the actual analytical and export journals. **Read original** retains that complete native request and its actual accepted result in the browser's request history. Each entry exposes its full body, original ID, route and completion state. A saved browser workspace carries these records with its other raw controls.

An uncertain send keeps its original ID and body. Continuing it first reads the existing native record, adopts an already completed result, or resumes that same native operation. A secondary catalog or page refresh failure does not discard an accepted result. The request history also retains a completed receipt after a later status-read failure.

### Export and import the full working edition

In **Browser workspace**, use **Export complete browser JSON** to download the current complete state. The transfer includes the original warehouse identity, named browser workspace identity/revision and the entire raw form state. Use **Import complete browser JSON** to reopen that file in the same original warehouse or its independently received editable copy.

Import checks the complete file and warehouse identity before changing the form. If the selected file or current form changes during reading, the later selection stays available and the operator chooses Import again. Previous complete form editions are retained before adoption. The imported source, analysis and workbook contexts are checked against their exact saved native revisions.

For the whole customer deliverable, **Export complete workbook** on the reports screen saves the current browser workspace and includes that exact revision in the original analytical package. The package contains:

- The original report, complete tables, original source files and application.
- The immutable warehouse snapshot and its ordinary editable receiving path.
- The complete selected browser draft in browser-workspace.json.
- The browser workspace ID, revision, state SHA-256, full JSON byte count and file SHA-256 in the package manifest.

The exporter reopens the exact saved browser revision when continuing an interrupted package. Independent receiving checks that revision and full JSON against the received warehouse before reopening it. Later definitions and browser revisions can be added to the editable copy while the original package and selected report remain available.

The native export request accepts an optional browser_workspace selection:

~~~json
{
  "request_id": "ORIGINAL_32_HEX_REQUEST_ID",
  "report_id": "ORIGINAL_64_HEX_REPORT_ID",
  "browser_workspace": {
    "id": "ORIGINAL_32_HEX_BROWSER_ID",
    "revision": 1,
    "state_sha256": "ACTUAL_64_HEX_SAVED_STATE_SHA256"
  }
}
~~~

Use the actual IDs and returned SHA from the original workspace. Existing exports that omit this optional selection continue to use their original package format.

### Native CLI and agent receiving

The original CLI also operates the complete named browser state:

~~~sh
python -m stellar_forge_buyer.duckdb_cli --workspace WORKSPACE \
  analytics catalog browser-workspaces

python -m stellar_forge_buyer.duckdb_cli --workspace WORKSPACE \
  analytics record browser-workspaces BROWSER_ID --revision REVISION

python -m stellar_forge_buyer.duckdb_cli --workspace WORKSPACE \
  analytics save-browser-workspace --request-file ORIGINAL_COMPLETE_SAVE.json

python -m stellar_forge_buyer.duckdb_cli --workspace WORKSPACE \
  analytics browser-workspace-file BROWSER_ID --revision REVISION \
  --destination /absolute/private/browser-workspace.json
~~~

The save file contains request_id, workspace_id, id, title, expected_revision and state. The state is the complete browser-state object emitted by the maintained browser. Keep the full original save request for a continuation. The file destination's private parent directory must already exist; an existing identical file is reused.

The registered duckdb agent operations are:

| Operation | Original input and result |
| --- | --- |
| analytics-browser-workspaces | Paged saved workspace catalog, including every current ID/revision and state SHA. |
| analytics-browser-workspace | Select an exact ID/revision and receive its metadata plus complete JSON file descriptor. |
| analytics-save-browser-workspace | Submit the complete original save body; the host supplies its registered warehouse identity. |
| analytics-browser-workspace-file | Read the exact saved JSON using ID, revision, file SHA, offset and length. |

File reads return base64 bytes, the original total byte count/SHA and the exact next offset. Receive all parts and verify the complete length and SHA. Each part is at most 128 KiB. The eight MiB save limit applies only to this complete browser-state action; the other original tool limits remain in place.

### Complete receiving on the original customer operation

The installed source includes examples/duckdb-browser-workspace-receiving.mjs. Its exported receiveBrowserWorkspace function attaches to the existing whole analytical customer driver after that driver's original source, six-view browser, result, report and complete-package work. The same driver owns the page, registered native caller, listener, warehouse lease and final shutdown.

~~~js
import {receiveBrowserWorkspace} from './duckdb-browser-workspace-receiving.mjs';

const browserWorkspace = await receiveBrowserWorkspace({
  page,
  input,
  nativeCall: call,
  operationId: originalOperationId
});
output.steps.browser_workspace = browserWorkspace;
~~~

Here input is the original driver's complete node-input.json object, including its source root, private receiving directory, original warehouse, edition, analysis, workbook, report and earlier export. The call function is its existing registered native DuckDB caller returning the original operation result. Keep that native client open through this continuation.

The continuation edits the actual mounted authoring controls, retains one original completed request, saves the full browser state, receives its exact JSON through the original native file reader, exports it through the browser, reloads, imports the same complete file and compares all raw fields, dynamic arrays, selected native revisions and request bodies. Comparison excludes only the snapshot's newly recorded updated_at timestamp. It does not submit the unfinished draft for native analysis or report publication.

The same continuation then creates a whole native workbook export pinned to the saved browser revision and downloads its complete ZIP through the browser. It returns that following original export as browserWorkspace.export and retains the ZIP under:

~~~
browser-workspace-receiving/complete-edited-workbook.zip
~~~

The enclosing Python receiving owner carries that following export's actual manifest SHA, warehouse ID and ZIP into its existing independent extraction, receive_package, repeated reopen and packaged CLI step. Preserve its earlier complete export alongside this edited-workspace package. The received warehouse's **Browser workspace** screen can open the exact saved revision; browser-workspace.json supplies its complete portable raw state.

The receiver retains its full input binding, original native save body before dispatch, exact native export request before sending, byte identities and progress in browser-workspace-receiving/receiving.json. Restart it with the same original input and directory. An uncertain save or export reuses its exact recorded native request; an already completed native result is adopted. A completed receiving operation rechecks its local artifacts and immutable native browser revision and returns its original result.

The original source owner keeps the one whole analytical native operation and both original receiving callers. This added function is composed into that operation; it creates no new listener, source acquisition, SQL result or browser driver.
