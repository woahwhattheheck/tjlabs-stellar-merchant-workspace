# Dataset query studies

Use the original Dataset workspace to keep a complete named query, return to an earlier edition, and download every row from a saved successful query. The same dataset engine continues to own column types, equality and range filters, sorting, snapshot selection and continuation cursors.

A study retains both guided and raw input, including incomplete filter values and an unfinished name. Its source binding includes the original dataset description and snapshot, file/service mode and selected public resource. Its latest successful page remains distinct from newer edits that have not run successfully.

## Open the workspace

For a direct dataset configuration, select a separate private studies directory:

```sh
mkdir -m 700 /private/query-studies
starforge dataset-workspace --dataset /private/dataset.json --studies /private/query-studies
```

The parent of that directory must already exist. The workspace keeps generated files in the selected private directory rather than beside the input CSV.

For an already running original versioned dataset service:

```sh
starforge dataset-workspace --state /private/dataset-state
```

The default studies directory is query-studies beneath that private service directory. An explicit --studies directory overrides it. The original service remains the only snapshot writer.

The installed Applications form also accepts **Private query studies directory**, alongside the original dataset file/state, resource and catalog selections. Select an existing private directory there. The existing managed application operation retains the selected inputs and launches the same workspace command.

Open the printed loopback session URL on the trusted host. Its token is private. All study reads, mutations and result downloads use that original authenticated session.

Without native studies storage, the browser still works with queries and complete working-file downloads. Choose a studies directory when native named saves and full-result jobs are needed.

## Work with a named query

Create a study, choose its output columns and fill the original guided query fields, or use raw URL parameters. Changing editing modes keeps both forms. Invalid or unfinished filter strings can be retained without executing a query.

Run the original query. A successful result records the exact submitted parameters, returned snapshot, complete current page and execution time. A failed query keeps the previous successful page; it does not relabel that page as the failed request.

Save the complete working study. Native storage uses a separate, increasing storage revision. If another tab saved first, reopen that revision or preserve the local work as a fork. Retrying identical saved bytes at the same expected revision recovers the original publication, even if a later native revision now exists.

The study's own editions retain its previous names, complete input, source binding and compact successful-query summaries. Returning to an older edition preserves the current work first. Editions do not duplicate every old result page; the complete latest successful page remains in the working document. A study retains up to 200 editions and an 8 MiB complete working file. Overflow is reported explicitly; history is not dropped.

A complete JSON working file preserves unfinished edits and can be reopened without native storage. Import into native storage creates a distinct fork with original ancestry. Rebinding to the displayed source is explicit and preserves the prior source/input as an edition. Direct-file sources must retain their exact snapshot. A service study can select its retained historical snapshots through the original service.

## Export a complete result

Save a successful original query, then choose its complete-result export. The job binds the selected native study revision, original successful query and returned snapshot. Later editor changes and later native study revisions do not change that job.

The exporter begins at the first page of that same query: it removes the former continuation cursor and selects the same retained snapshot. It retains all other original query parameters. Each subsequent request uses the exact returned next cursor. The unchanged SF100 page and cursor validators verify the original query signature, source meaning, field order, row types, total and consecutive boundaries.

The browser displays retained page and row progress. **Complete** means the original result reached its declared total with a null continuation cursor and the complete output files were durably retained. A first page with zero rows still produces a valid header-only CSV and empty JSONL.

Complete outputs are:

| File | Contents |
| --- | --- |
| dataset.csv | All selected rows in original result order, quoted with original text unchanged. Null is an empty cell; an actual empty string is quoted. |
| dataset.jsonl | One original typed row per line, preserving null, empty string, numeric, Boolean and text distinctions. |
| study.json | The complete saved working study used by this job. |
| manifest.json | Original source/query/snapshot and saved revision, total, every original page descriptor and all output hashes. |
| semantics.json | The complete original source meaning document, when the dataset publishes one. |
| page-00000.json and following | Each retained original response and its actual request cursor, exact query and preceding-page hash. |

CSV remains original data; software opening it should treat text as data. JSONL is the exact typed representation. The export is a local operator preview, so its metadata does not create buyer intents, payment records or customer acceptance.

## Resume and recover

An interrupted job keeps its request and every complete original page. Reopen the same studies directory, select that existing result and choose Resume. A reopened unfinished job is Ready; an interrupted live attempt is Paused. Neither state starts a different query automatically.

If the original service has expired the selected snapshot, its original expiry response is shown. The already retained page files remain available. Restore or retain the original source through its existing service operation before continuing; selecting a newer snapshot would be a separate study result.

A stable request UUID identifies the original full-result action. An uncertain HTTP response can be retried with that exact UUID and original saved selection. Reusing it for a different query or revision is rejected. Concurrent resume/status calls share the same running state.

The engine's existing page limits still apply. Complete results retain at most 4,096 original pages, 256 MiB of original response archives and 256 MiB of combined CSV/JSONL/source-meaning output. If the page count is too large, preserve the existing result and explicitly run a new supported query with a larger page size. Byte-limit errors retain completed pages and do not truncate the result into a success.

Native study revisions and result files are create-only publications. A saved record points to its preceding complete record; no head pointer can overwrite competing work. Files and newly created directory links are synced before acknowledging successful saves. Downloads verify a retained file's hash through the same open file handle before streaming it.

## Native commands

The installed command is **dataset-studies**. The same source can be run with Node through dataset-study-cli.mjs.

```sh
starforge dataset-studies list --studies /private/query-studies
starforge dataset-studies open --studies /private/query-studies --id STUDY_ID --output /private/saved-study.json
starforge dataset-studies history --studies /private/query-studies --id STUDY_ID
starforge dataset-studies save --studies /private/query-studies --input /private/working.json --expected-revision 3
starforge dataset-studies import --studies /private/query-studies --input /private/working.json --title 'Separate analysis'
```

A query command deliberately executes the original engine and saves its successful page into the selected native revision:

```sh
starforge dataset-studies query --dataset /private/dataset.json --studies /private/query-studies --id STUDY_ID --expected-revision 4 --query 'fields=region,total&limit=250'
starforge dataset-studies export --dataset /private/dataset.json --studies /private/query-studies --id STUDY_ID --expected-revision 5 --request-id ORIGINAL_UUID
starforge dataset-studies exports --studies /private/query-studies --id STUDY_ID
starforge dataset-studies resume --dataset /private/dataset.json --studies /private/query-studies --export-id RESULT_SHA256
starforge dataset-studies download --studies /private/query-studies --export-id RESULT_SHA256 --name dataset.jsonl --output /private/complete-result.jsonl
```

Use --state instead of --dataset for the original running versioned service. Export/resume waits for completion or a retained pause and prints the actual resulting status. Output paths are create-only; an existing file is preserved.

## Private API

| Route | Operation |
| --- | --- |
| GET /api/studies | Native enabled state and saved study summaries. |
| GET /api/studies/ID | Complete latest native study and storageRevision. |
| GET /api/studies/ID?revision=N | One original saved native revision. |
| GET /api/studies/ID/history | Complete revision metadata and original hashes. |
| POST /api/studies/save | Exact study and expectedRevision; null creates a new identity. |
| POST /api/studies/export-result | studyId, expectedRevision, query, snapshot and stable requestId. Returns the original job. |
| GET /api/studies/exports?studyId=ID | Existing jobs for the selected study. |
| GET /api/studies/exports/RESULT | Actual progress and original output descriptors. |
| POST /api/studies/exports/RESULT/resume | Empty JSON body resumes that exact retained job. |
| GET /api/studies/exports/RESULT/files/NAME | Authenticated hash-checked complete file stream. |

The original /api/query and /api/activate behavior remains available. Study mutations use the same origin checks, bearer session and JSON content type. The native save body has a 9 MiB transport limit; the validated complete study has its own 8 MiB budget.

## Installed source and receiving

The dataset contribution adds the native command, original workspace/study exports, typed store interface and complete browser asset manifest. The existing local-dataset selection includes this capability alongside its original Frictionless, DuckDB, publisher, payment and buyer receiving flows.

Use the original dataset receiving operation with its actual saved configuration/service, known successful query and multiple-page result. Operate the outgoing desktop and narrow layouts, edit and save unfinished values, fork/reopen an original study, preserve a failed query, export every row, interrupt and resume the same result, and independently reopen its JSON/CSV/manifest. Return the actual rendered views and exact retained output files through that original course. This feature requires no buyer payment or new source engine.
