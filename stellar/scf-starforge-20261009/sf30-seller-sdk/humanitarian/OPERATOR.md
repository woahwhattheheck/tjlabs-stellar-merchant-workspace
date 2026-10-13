# Humanitarian reporting operator

This operator turns retained table editions into reproducible administrative reporting and a complete editable handover. It uses the original Dataset and Workspace engines for extraction, typed columns, queries and saved builds. The humanitarian workspace adds pinned administrative references, explicit geographic resolution, named alias decisions, ordered business keys, reporting layouts, whole edition comparison and immutable review history.

## Open the original workspace

From the source SDK, use the installed Node entry and an existing Python 3.11 or newer:

```sh
node humanitarian/cli.mjs --workspace /absolute/private/humanitarian init
node humanitarian/cli.mjs --workspace /absolute/private/humanitarian serve --port 0
```

The command returns its actual loopback console URL with a private token. Open that complete URL in the browser. The application binds only to its original local server; it uses no external page scripts or analytics. Keep the returned link private. The Python source root, original workspace identity and selected Python executable are part of the managed binding.

Within an installed distribution the command is `dataset-humanitarian`. Applications also exposes **Humanitarian reporting**. Select the existing initialized workspace and absolute existing Python executable, review its complete application request, save it, start it and open the returned console. The original Applications service owns process startup and Stop. Its provider verifies the complete 21-file humanitarian/Dataset source selection against the retained installation. Both the Python binding and Node provider carry the same source list. A changed workspace identity, Python selection or source body requires a new application review.

The standalone typed client imports from `humanitarian/client.mjs`; the installed package exports `./seller/humanitarian/client`. It accepts the returned console URL or complete launch connection. Client close seals admission and waits for accepted response bodies to finish or be cancelled.

## Receive original sources and inspect complete headers

The Sources view retains original CSV, JSON or XLSX bytes and inventories the real tables and physical rows. A source has a SHA-256 identity. Original intake is limited to 100 MiB per source; JSON operation requests are limited to 1 MiB. The inventory preview intentionally shows at most eight rows, 64 columns and 240 characters per cell.

Reference and Mapping both offer **Load complete original header**. This calls the native table reader for the exact selected physical header row, with offset `headerRow - 1` and limit one. It retains every complete header cell, including empty trailing columns. The parser compares the entire expected header when extracting. A header containing embedded line breaks stays available in the full input editor. The full source-table reader returns up to 20 complete original physical rows per page and rejects a response above its 4 MiB bound.

Use each original source filename and label. Source retention and packet intake preserve their complete Blob in browser storage before sending. If browser storage cannot hold the original, the request is not dispatched; the CLI can use that same full file directly.

## Pin an administrative reference

Select a reference source, table, header row and optional immediately following HXL row. Define contiguous administrative levels 0–5. Each level has explicit code and name selectors; the ordinary controls choose a zero-based source index or a constant. Optional aliases and actual GeoJSON geometry may also be selected. The complete JSON editor supports all exact selector forms.

Retain provenance: publisher, title, URL, source edition, retrieval timestamp and observed license. The operator does not assign an open license to a reference whose original source provides none. The saved reference retains its complete definition, source identity, row counts and native nodes.

## Map reporting columns and layouts

A mapping selects one pinned reference and the complete original table plan:

- Explicit semantic type: string, integer, number, boolean or decimal.
- Original zero-based source column index, label, nullability and trimming decision.
- HXL tag and unit where supplied.
- Administrative level and selected code, name and optional parent scope fields.
- One to twelve ordered business-key fields.
- One or two complete reporting layouts with ordered columns.

Dates use explicitly named string columns. Codes should remain strings when leading zeroes matter. Decimal measures preserve exact decimal text; missing values remain distinct from zero.

The ordinary controls support tabular outputs and aggregated outputs. Aggregates select grouping fields and named sum, count, count-distinct, min or max measures. Equality filters require the mapped scalar type: strings remain strings, booleans use true or false, integer/number fields use their corresponding JSON numeric values, and decimal fields use quoted exact decimal text. The complete submitted request remains retained. Grouped layouts require a named measure. There are at most 16 measures, 12 grouping fields, 16 filters and 64 output columns per layout. The mapping chooses at most 63 original reporting columns; generated administrative fields are additionally available.

Opening a saved normalized mapping reconstructs its original column selectors while preserving filters, ranges, sorts, limits, nullability and semantic decimal types. Editing ordinary controls preserves these retained plan settings. The full JSON editor can explicitly edit every supported plan setting. It remains the route for a layout or selector that cannot be represented faithfully in ordinary controls.

## Record reviewed geographic resolution

The Resolution view saves immutable alias decisions against one exact administrative reference. Choose the administrative level, whether the original value is a name or code, the exact source value, optional parent scope, selected canonical code, reviewer and reason.

Decisions are explicitly selected into each review. They do not modify the source file or globally substitute an unreviewed spelling. Each normalized row retains original values, its resolution, complete issues and business key. Duplicate or missing keys and unresolved geography remain visible.

## Save one or two editions

A review uses a named ID beginning with a letter, at most 80 letters, digits, underscores, dots or hyphens. Its first save includes `expectedRevision: 0`. Later saves select the last observed positive revision. **New review** prepares a separate stable review ID while retaining the editable edition controls.

Select one edition or two comparison editions, each with source, mapping, label and reporting period. Compared editions must share the same pinned reference and ordered business keys. Select the applicable saved aliases and record reviewer, notes and row policy:

- **Require complete** retains the report with status `needs-review` when invalid rows remain.
- **Valid rows** explicitly produces a partial report, with excluded rows and coverage retained.
- Fully valid editions produce status `ready`.

Every output shows included, excluded and total source rows, completeness and row policy. Results also show the count of valid rows matching that layout's filter. Native output descriptors retain row counts; the UI reads their full data through bounded native pages. The page filter is explicitly limited to the currently loaded page. The complete exports always contain the entire selected output.

The comparison view pages every retained added, removed or changed key and opens the full original before/after values, per-field presence changes and declared mapped type changes. The complete change descriptors include beforeType and afterType alongside the original values. A count of unchanged keys does not imply those rows were omitted from the complete normalized edition data. The source-row view independently pages every normalized row or only rows with issues.

## Retained browser requests and continuation

Each reference, mapping, alias or review mutation has an original letter-prefixed `requestId`. The browser saves the complete body and its identifier to IndexedDB before dispatch. Uploads and package receives retain the full original Blob, name, size and SHA-256. The digest is calculated in bounded streaming chunks. Web Locks serialize operation dispatch for the same local workspace.

Before a JSON mutation is sent, the browser reads that exact native request ID. An existing result must match the operation kind and complete original input. Only the native **Unknown completed request** result with an explicit absence marker permits first dispatch. After a returned save, the browser reads the request again and compares the full input and result. Transport failure retains the original operation for **Continue original operation**. A successful native save whose HTTP reply was lost is therefore received through its original request record.

Completed browser receipts are saved before clearing the pending pointer. A failure while refreshing the page or opening the selected revision reuses that same saved result on continuation. Draft autosaves preserve the current pending pointer. A reused request identifier with different complete content is rejected.

The pending panel can download its complete original request or upload file. Only an explicitly rejected input can be closed to prepare a new operation, after native request reconciliation. The rejected input remains retained. Do not generate a replacement identifier merely because a save response is delayed.

The full JSON editor's **Save this exact input** keeps its existing request ID. **Review complete input** prepares a new complete input from the ordinary controls; saving those controls creates a new request only at that explicit action. Historical review selection is separate from the latest revision and is preserved through reload.

## Complete handover and independent reopen

**Download complete report ZIP** returns all native report files: original selected layouts as CSV/HXL and Excel-import CSV, complete normalized rows and issues, comparison data, SQLite reporting data, local Kobo choices/source tab sets, JSON and offline HTML. The reporting engine determines the exact file membership.

**Download complete workspace ZIP** additionally retains original sources, plans and native Dataset builds, reference/mapping/alias definitions, every selected review revision and original request. Full packet intake reconstructs the original native reports and history before accepting the review. The receiving result identifies its current review, received revisions, existing-prefix status and request count. Receiving an older prefix preserves a later local continuation.

Use a separate initialized private workspace for independent receiving. Import the complete original ZIP, select **Open received review**, choose a saved revision and inspect its report, rows, outputs and original requests. Close the server, reopen that workspace and read the same saved revision. A report ZIP is for reporting; the complete workspace ZIP is the editable source/history transfer.

Original tables may contain sensitive data. These are complete private exports; the operator does not automatically anonymize source records or infer publication approval.

## CLI reference

All commands begin:

```sh
node humanitarian/cli.mjs --workspace /absolute/private/humanitarian COMMAND
```

| Command | Arguments |
|---|---|
| init, list, binding | No additional arguments |
| source | `--file FILE --label LABEL` |
| source-table | `--source SHA [--table data] [--offset 0] [--limit 8]` |
| save-reference, save-mapping, save-alias, save-review | `--input COMPLETE_JSON_FILE` |
| reference, mapping, alias, history, request | `--id ID` |
| review, report | `--id REVIEW_ID [--revision N]` |
| rows | `--id REVIEW_ID [--revision N] [--edition 0] [--offset 0] [--limit 50] [--issues]` |
| output-rows | `--id REVIEW_ID --output OUTPUT_ID [--revision N] [--edition 0] [--offset 0] [--limit 50]` |
| comparison-rows | `--id REVIEW_ID [--revision N] [--offset 0] [--limit 50]` |
| export, report-export | `--id REVIEW_ID [--revision N] --output ZIP` |
| receive | `--file COMPLETE_WORKSPACE_ZIP` |
| query | `--build SHA [--params JSON]` |
| dataset | `--build SHA --output DIRECTORY` |
| serve | `[--port 0] [--expected-binding SHA] [--startup-format json]` |
| call | `--input OPERATION_FILE` |

The generic call file is exactly `{"operation":"review.save","args":{...complete original request...}}`. Other operations are state, source, source.add, source.table, reference.save/reference, mapping.save/mapping, alias.save/alias, review.save/review, reviews, history, report, rows, output.rows, comparison.rows, request, review.export, report.export, receive, query and dataset.export. Export operations use args.output; source.add and receive use args.file. JSON calls preserve every submitted request field.

## Authenticated HTTP and typed client

All original console API calls require the returned Bearer token. The inherited server enforces its local host and request rules.

GET routes under `/api/humanitarian/` are state, source, source-table, reference, mapping, alias, reviews, review, history, report, rows, output-rows, comparison-rows, request and export. Saved-revision routes use `id` and optional `revision`; output paging also uses `edition`, `output`, `offset`, `limit`. Export selects kind workspace or report.

POST reference, mapping, alias and review accept their complete original JSON requests. POST `/api/source` accepts complete source bytes with URI-encoded X-Humanitarian-Name and X-Humanitarian-Label headers. POST `/api/import` receives a complete workspace ZIP. The original Dataset query/export routes remain available.

The typed client exposes matching methods, including sourceTable, outputRows, comparisonRows and request. Review IDs and original request IDs are named identifiers; source/reference/mapping/alias/build/report identities are SHA-256. Consume or cancel every returned export Response body before awaiting close. `downloadHumanitarianFile` streams a complete response into a private stage under an output lease, verifies size and SHA, then publishes or reuses matching complete output. A conflicting existing output is retained and rejected.

## Verification and source responsibility

Source registration, UI and API use this same native workspace. A successful parse or source publication is not an installation or data-receiving result. The operated handover should retain actual source selection, installation/Applications receipts, full original inputs, native saved requests, complete outputs, independently received history and cold reopen results. Root receiving owns the whole native programme; this integration introduces no separate model or case writer.
