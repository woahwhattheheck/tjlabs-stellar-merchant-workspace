# Source workspaces through the merchant MCP

The source-workspace adapter operates the same private XML, NDJSON or IATI console that
an operator uses in the browser. Source intake, mapping, native queries, edition
comparisons and exports run through that console's original HTTP handlers and
retained workspace. An agent can finish a browser-started dataset, and a browser
can inspect an agent's saved source and mapping immediately.

The installed module is `@tokenjunkielabs/starforge-merchant/merchant/mcp/source-workspaces`.
It contributes dataset and IATI tools to the existing merchant MCP and uses its
current HTTP or stdio transport. The underlying source console owns the workspace lock, native
dataset worker and application lifecycle.

## Start the original console

Create a private directory for the work and start its original NDJSON console.
Use an existing initialized workspace when continuing a dataset.

~~~sh
mkdir -m 700 ./private
starforge dataset-ndjson --workspace ./private/source init
starforge dataset-ndjson --workspace ./private/source serve \
  --connection-file ./private/source-console.url
~~~

The console writes its original private URL into a 0600 file. Keep the console
running. The browser uses the printed URL; the adapter reads that same URL from
the declared file. Graceful console shutdown removes its connection file only
when the file still identifies that process. A restart can reuse the path and
the MCP reads the new connection on the next call.

For an original XML console, use its existing `dataset xml` source entry and
declare `"format": "xml"`. The environment form below accepts its printed URL,
including the fragment. For either format, a crashed console may leave a stale
connection file: inspect the original process, remove its stale file after it
stops, then restart the same workspace.

## Declare the existing workspaces

Save this connection document as a private file, such as
`./private/source-workspaces.json`, with mode 0600:

~~~json
{
  "schema": "stellar-forge.source-workspace-connection.v1",
  "workspaces": {
    "publisher": {
      "label": "Supplier editions",
      "format": "ndjson",
      "consoleUrlFile": "./source-console.url",
      "files": {
        "current": {
          "kind": "source",
          "path": "./supplier-current.ndjson",
          "label": "Current supplier edition",
          "name": "supplier-current.ndjson"
        },
        "received": {
          "kind": "packet",
          "path": "./received-source-project.zip"
        }
      }
    }
  }
}
~~~

Paths are relative to this connection document. File handles select complete
host-declared source or project files. A source handle can include a reviewed
`sha256`; the adapter verifies the complete file before intake.

Use exactly one `consoleUrlFile` or `consoleUrlEnv` for each alias. The environment
form names an environment variable containing the original private console URL;
the value stays in the MCP host environment. The adapter forwards the console's
existing bearer capability to its exact loopback origin. Tool arguments use
workspace aliases and source handles.

Configure and start the existing merchant MCP:

~~~sh
starforge merchant-mcp init-source-workspaces \
  --dir ./private/source-mcp --connection ./private/source-workspaces.json
starforge merchant-mcp serve --config ./private/source-mcp/merchant-mcp.json
~~~

Set the transport's existing `MCP_ACCESS_TOKEN` environment value before serving.
The ordinary merchant `init` command also accepts
`--source-workspaces CONNECTION_JSON`. To attach consoles to a saved merchant,
add `sourceWorkspaceConnection` to that merchant's configuration with the
connection document's path.

## Operate a complete dataset

1. Call `merchant_source_workspaces`, then `merchant_source_status` for the selected
   alias. The status gives original retained counts. Use
   `merchant_source_inventory` to page sources, plans, builds or comparisons.
2. Ingest a complete declared file with `merchant_source_ingest` and its `file`
   handle. For small documents, `merchant_source_ingest_text` accepts up to
   128 KiB of complete text. The returned `native.id` identifies the original
   source bytes. `merchant_source_inspect` reads its complete field inventory.
3. Save the complete native mapping with `merchant_source_plan_save`. Its
   `definition` is the original XML or NDJSON mapping document, including explicit
   exposed columns, types, source paths, filters, sorts and comparison keys.
   `merchant_source_plan` retrieves the exact saved definition.
4. Call `merchant_source_build` with that source and plan. The original engine
   validates the complete source, produces the native dataset and retains its
   lineage and review. Save the returned build ID.
5. Use `merchant_source_query` with that build and the native query parameter
   object. Parameter values are strings, for example
   `{"limit":"25"}`; use the dataset's declared filter and sort names, then continue its returned
   `page.nextCursor` as `cursor` with the same query selection.
6. Ingest a later edition and build it with the same saved mapping. Call
   `merchant_source_compare` with `before` and `after` build IDs. The original
   mapping's unique keys determine added, removed, changed and unchanged rows.
   Page the complete retained changes with `merchant_source_changes`, following
   `nextOffset` until null.

Every source, mapping, build and comparison comes from the original workspace.
After an interrupted mutation reply, read status and inventory to recover its
content-addressed ID before repeating the change. Inventory pagination returns a
snapshot; repeat it as `expectedSnapshot` on later pages. If another operator
changes the inventory, resume from a fresh page-zero snapshot.

## Deliver and receive the original work

`merchant_source_export` retains one complete native export. Choose:

| Kind | Selection | Contents |
| --- | --- | --- |
| `project` | `build` | Original source, mapping, native dataset and reconstruction metadata |
| `dataset` | `build` | Native data.csv, dataset.json and source lineage |
| `changes` | `comparison` | Complete original edition-changes JSON Lines file |

For an NDJSON product, `merchant_source_merchant_prepare` takes the exact
`build`, reviewed public `payment` object, public `origin` and route `path`.
The original merchant preparation returns a complete ZIP containing the source,
mapping, native dataset, seller configuration, OpenAPI, generated customer SDK
and merchant manifest. The NDJSON operator guide explains the native payment
configuration and `dataset-ndjson-merchant` launch command.

The adapter streams each native export into the existing private customer export
directory. Completed files have SHA256 identities and atomic metadata records;
`merchant_source_exports` recovers them after a lost reply or process restart.
Each retained export can be read up to the existing 256,000,000-byte delivery
capacity. Larger originals remain available through the native console.

Call `merchant_source_file_read` with `workspace`, `exportId`, optional `offset`
and `limit` (up to 196608 bytes). Decode each returned base64 `data` chunk. Continue
with its `readId` and `nextOffset` until null, and verify the assembled file
against `exportId`. A read uses the original retained bytes. It does not ask the
console to regenerate the package for each chunk. Completed reads release their
temporary snapshot; `merchant_source_file_release` releases an unfinished one.
After a read expires or the MCP restarts, reopen the same `exportId` at the saved
byte offset.

To receive the complete project, start an original console for the receiving
workspace and add its alias to the connection document. Call
`merchant_source_import` with the receiving alias, `exportId`, and the original
`fromWorkspace`. Both aliases must use the same source format. The native import
reconstructs and verifies the original source, mapping and dataset in the
receiving workspace. Alternatively, import a configured `packet` file handle.

Closing the MCP drains its active calls and temporary file reads. The original
source consoles continue to own their workspaces and browser sessions; complete
retained export files are available to the next MCP process.

## IATI aid-finance portfolios

An IATI console uses the same source-workspace connection and private bearer capability. Add `format: "iati"` to a declared alias and point `consoleUrlFile` or `consoleUrlEnv` at the original `dataset-iati ... serve` process. Source handles refer to complete publisher XML; packet handles can refer to a complete native project or a full portfolio archive. This adapter borrows that existing process and closes only its own requests and file reads.

The eight `merchant_source_iati_*` tools expose original presets, profile, portfolio listing/get/history/save, reports and portfolio comparison. The existing inventory accepts `portfolios` for IATI; existing plan/build/query/change tools operate on the same original dataset engine. Financial strings, source associations and field reviews are returned without conversion or additional aggregation.

For a save, `definition` is the original object:

```json
{
  "requestId": "iati-portfolio-review-001",
  "name": "Reviewed publisher selection",
  "sources": ["<full retained publisher source SHA-256>"],
  "selection": { "transactionTypes": ["3"], "dateFrom": "2025-01-01", "dateTo": "2025-12-31" },
  "review": { "status": "reviewed", "reviewer": "<actual reviewing operator>", "note": "<review observations>" }
}
```

Use an actual retained source ID and named reviewer. Omit selection arrays/dates to retain their full source coverage. Editing adds the exact saved `id` and `expectedRevision` together and uses a new requestId. Retrying an interrupted save repeats the exact original object/requestId; it returns the original revision even if a later edit now exists. Read portfolio history to select a historical revision explicitly.

`merchant_source_iati_compare` takes `definition: {id, beforeRevision, afterRevision, pairs?}`; each explicit pair is `{before: sourceId, after: sourceId}`. The native response includes coverage additions/removals, selection changes and the original keyed comparison summaries. It does not silently treat two different publisher cohorts as one unchanged set.

For full receiving, call `merchant_source_export` with `kind: "portfolio"`, the original `portfolio` ID and optional `revision`. For the complete readable report, all CSV rows, review JSONL and changes, select `kind: "report"`. Each IATI archive retains up to the core's 4 GiB package capacity; other export kinds keep their existing bounds. `merchant_source_file_read` uses the maintained read-only FileHandle path and verified bounded chunks, so it does not load a complete archive into a JavaScript Buffer. Retained export metadata and original data bytes remain available across service restart.

A receiving IATI alias can use `merchant_source_import` with that retained portfolio `exportId` and its original `fromWorkspace`. The native importer verifies every member and reconstructs all referenced datasets, full report bytes, request identities and revisions before publishing the portfolio history. Report-only archives are delivered for reading and are not importable portfolio packets.

Full native CLI/client and Applications operations: [IATI operator guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/iati/OPERATIONS.md). The original source interpretation and limits are documented in [IATI DOMAIN](../../stellar/scf-starforge-20261009/sf30-seller-sdk/iati/DOMAIN.md).

## IATI native DQA customer cases

The same IATI alias exposes provider profiles, original DQA assessments, saved
customer case revisions and finding decisions. The source console owns these
records in its existing workspace. Configure the existing original DQA service's
authorization value in that console's environment; the profile stores only its
environment variable name.

| Tool | Native operation and selection |
| --- | --- |
| `merchant_source_iati_dqa_providers` | Page saved provider profiles |
| `merchant_source_iati_dqa_provider` | Save the complete provider `definition` with its original request ID |
| `merchant_source_iati_dqa_capture` | Capture the complete native assessment from its `definition` |
| `merchant_source_iati_dqa_assessments` | Page retained assessment summaries |
| `merchant_source_iati_dqa_assessment` | Read a complete saved `assessment` |
| `merchant_source_iati_dqa_findings` | Page actual native findings for `assessment`, with optional `status` and `search` |
| `merchant_source_iati_dqa_cases` | Page latest customer case summaries |
| `merchant_source_iati_dqa_case` | Read a `case` and optional original `revision` |
| `merchant_source_iati_dqa_history` | Page the complete saved `case` history |
| `merchant_source_iati_dqa_save_case` | Save the complete case `definition`, selected assessments and review edits |
| `merchant_source_iati_dqa_compare` | Compare complete `before` and `after` native assessments |
| `merchant_source_iati_dqa_comparison` | Read a `comparison` and page its complete activity changes |
| `merchant_source_iati_dqa_operations` | Recover original capture/save request records after an interrupted reply |
| `merchant_source_iati_dqa_export` | Retain the complete customer `case` ZIP at an optional `revision` |
| `merchant_source_iati_dqa_file` | Retain one complete original `assessment` file by `kind` |

Every tool also takes the existing `workspace` alias. Paginated lists use
`offset`, `limit` and their declared snapshot contract; native findings,
comparison pages and operation recovery use their actual `nextOffset`.
Findings preserve the provider's `pass`, `fail` and `not_applicable` statuses.

A provider definition has `requestId`, `name`, an exact HTTPS `endpoint`
ending in `/dqa`, `authorizationEnv`, and optional `timeoutSeconds`, `notes`
and predecessor `previous`. An original local provider can use its own loopback
HTTP origin. Requests preserve the raw provider Authorization value from the
declared environment variable.

A capture definition has `requestId`, `provider`, native `parameters`,
`label`, `operator` and optional `notes`. The parameters retain the original
organization/cohort, segmentation and rule options. The response retains the
provider's complete raw bytes, actual configuration observations, native counts,
financial year, generated time and returned activity details. A capture can take
up to the selected provider timeout; retain its original request ID across a
lost tool reply and recover it through the operation list before retrying.

A saved case definition has `requestId`, `name`, `client`,
`assessmentIds` and `review: {status, reviewer, note}`. Optional `portfolios`
select original `{id, revision}` finance portfolios. A case edit adds both
`id` and `expectedRevision`. Its `reviewEdits` select actual
`{assessment, finding, status, owner, note, dueDate}` decisions; use
`{assessment, finding, remove: true}` to remove one. Each saved revision
preserves its full selected assessments and accumulated finding decisions.
Replaying an unchanged original request returns that original revision after
later edits.

The comparison response carries its saved native comparison and a `page`
containing full changed activity records. Compare actual received activity lists:
the change kinds distinguish newly listed, no longer listed, changed and unchanged
records. The original service can return details for failing activities only;
read its native counts and inclusion options alongside the returned list.

For original files, choose `kind` from `response`, `request`,
`configuration-before` or `configuration-after`. The tool's returned
`assessment` and `fileKind` preserve the current selection even when another
assessment uses the same original bytes. The retained `exportId` is the SHA-256
of that complete file. Read it with the existing `merchant_source_file_read`
and keep the same ID across restarts.

A complete DQA export carries the selected case's full revision history,
assessments, original observations, review reports, related comparisons, provider
history, full guides and any selected original finance portfolios. It uses the
native 4 GiB package capacity and the existing complete-file reader. To receive it,
call `merchant_source_import` with the receiving IATI alias, original
`exportId` and `fromWorkspace`, or select a declared complete packet file.
The original IATI importer verifies the complete package and reconstructs the
same customer case in its receiving workspace.

See [the full DQA operator guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/iati/DQA.md)
and [installed receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/DQA.md)
for executable CLI examples, the browser workflow, native source operation and
complete customer delivery.
