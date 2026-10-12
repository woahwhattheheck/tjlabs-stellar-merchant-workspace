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


## Organisation budgets and documents

The organisation workflow uses the same IATI alias, original publisher source
intake and browser workspace. It works with IATI organisation XML rather than
the activity datasets used by the finance and participant workflows. Configure
a complete publisher file as a source handle and use the existing
`merchant_source_ingest`. Its returned source ID refers to those exact
retained bytes.

The complete workflow is exposed by the existing source-workspaces provider:

| Tool suffix after `merchant_source_iati_organisation_` | Original operation |
| --- | --- |
| `status` | Read workspace identity, organisation sources and latest plans |
| `profile` | Inspect a retained source and its original organisation keys |
| `plan` / `history` | Reopen an exact saved plan or page its revisions |
| `request` | Resolve an unchanged request ID after an interrupted reply |
| `rows` / `detail` | Page budgets, documents and findings; read organisation, budget and document XML-bound targets |
| `save` | Save the complete source selection, dated assessment and cumulative corrections |
| `review` / `release` | Record a named review and prepare its original complete handover |
| `compare` | Compare explicit saved revisions and original compatible budget contexts |
| `export` / `file` | Retain a complete organisation ZIP or an original XML, HTML or CSV file |
| `receive` | Reopen the complete ZIP through the original receiving console |

Every operation takes the configured `workspace` alias. Read and mutation
results preserve the original object under `native`; export/file operations
return the existing retained-file descriptor, including `exportId`,
`bytes` and `sha256`. The current selected organisation plan,
revision and file kind remain explicit even when two selections share identical
file bytes.

### Select and correct the original source

Read `profile` with the exact `sourceId`, then retain the returned
opaque organisation keys. Read `rows` using either that `sourceId` or
a saved `id` with an explicit `revision`. Select
`section: "budgets" | "documents" | "issues"` and
`view: "source" | "candidate"`. Candidate view requires a saved plan.
An optional `organisationKey` narrows the view to one actual organisation.
A saved plan defaults to its candidate view; a source ID selects its original
source view. Set `view` explicitly when reading the saved plan's source.

Rows return the complete native page, including `total`,
`snapshotSha256` and `nextOffset`. Continue with the same
source/revision/section/view, returned `nextOffset`, and
`expectedSnapshot: snapshotSha256` until `nextOffset` is null.
History paging uses its separate returned `snapshot` and the existing
`expectedSnapshot` contract.

`detail` takes the immutable source or saved plan/revision, an original `rowId`,
and optional view, organisation key, expected snapshot and `targetId`. A selected
target is returned as `selectedTarget` with its exact element XML and original
binding; it must belong to the chosen row. The read omits the rows-only
`section` field and returns the row, exact XML and correction targets. An organisation's own key
can select its root detail for supported append operations. Each target retains
its original `id`, `beforeSha256`, node identity, current value
and allowed operations. Use these returned targets for the full cumulative
`edits` array; the original engine validates the selected source, XML
structure and IATI child order.

A `save` call carries this original object in `definition`:

~~~json
{
  "requestId": "organisation-plan-001",
  "name": "Reviewed organisation budget and document edition",
  "sourceId": "<exact retained source SHA256>",
  "organisationKeys": ["<original organisation key>"],
  "assessment": {
    "asOf": "2026-10-12",
    "fiscalYearStart": "2026-04-01",
    "forwardYears": 3,
    "methodology": "iati203"
  },
  "edits": [],
  "notes": "Original source selection and dated review context",
  "actor": "<actual operator>"
}
~~~

Use the actual assessment dates and fiscal-year start for the selected publisher.
The other explicit methodologies are `fcdo2023` and
`pwyf2026`; the original assessment preserves its dated methodology and
source. Optional `operatingCountries` are the reviewed country codes.
Optional `acquisition` retains the actual `sourceUrl`,
`retrievedAt`, `licenceUrl`, `licence` and
`notes`. The adapter leaves exact amount strings and all native source
associations intact.

Each edit is
`{targetId,beforeSha256,operation,value?,attribute?,xml?}`,
where `operation` is one of the target's supported
`text`, `attribute`, `replace`, `remove`
or `append` operations. Editing an existing plan adds its `id`
and `expectedRevision` and uses a new request ID. Edits always describe
the full cumulative change from the original immutable source. Plan/history
readback preserves the source, edited XML, assessment and review for each saved
revision.

### Review, release and compare

A `review` definition has
`{requestId,id,expectedRevision,decision,actor,note,acknowledgedIssueIds}`.
Choose `approve` or `request_changes` from the actual review.
A `release` definition selects
`{requestId,id,expectedRevision,reviewId,actor?}`. It returns the original
new plan, release and complete file descriptors.

A `compare` definition has:

~~~json
{
  "requestId": "organisation-comparison-001",
  "before": { "id": "<saved plan SHA256>", "revision": 1 },
  "after": { "id": "<saved plan SHA256>", "revision": 2 },
  "actor": "<actual operator>",
  "notes": "Reviewed original editions"
}
~~~

When `rowPairs` is omitted, the original engine pairs preserved identities
from the same source. It suppresses automatic pairing when divergent edits
remove an element or replace a whole organisation, because those changes can
move source row identities. The response explains that selection. Explicit
`rowPairs: []` requests a contextual comparison without any row pairs.
Comparing distinct source editions requires explicit unique
`rowPairs: [{beforeRowId,afterRowId}]` where that pairing was reviewed.
The native response retains all changes. Amount differences are calculated only
for compatible original budget families, recipients, statuses, currencies,
periods and value dates; other changes retain their context.

Save, review, release and comparison retain their original request IDs. After a
lost reply, call `request` with that same ID. `RECORDED` returns
the original saved input and result; `NOT_RECORDED` allows the caller to
continue its unchanged original request. A later plan edit does not turn a replay
into a fresh mutation.

### Deliver and independently reopen

Call `export` with the exact saved `id` and `revision`.
The console produces the complete original organisation ZIP, preserving original
source and candidate XML, revision history, requests, named reviews and reports.
A `file` call selects the same explicit plan/revision and
`kind: "source" | "candidate" | "report" | "budgets" | "documents"`.
These are complete XML, HTML and CSV files.

The adapter verifies the original HTTP descriptor's byte count and SHA256 while
streaming the response, then publishes it through the existing private export
store. It accepts the original 4 GiB archive capacity and 64 MiB file capacity;
organisation XML correction remains within the core's 32 MiB limit. Agent JSON
requests retain the provider's existing 128 KiB bound; use the original declared
source-file intake for complete publisher XML.

Read a retained result with `merchant_source_file_read` and preserve its
`exportId`, `readId` and `nextOffset` across pages.
The complete bytes remain available after the temporary read is released or the
MCP restarts. `merchant_source_exports` reopens results whose initial
export reply was lost.

Start a separate original receiving IATI workspace, configure its existing alias,
and call `merchant_source_iati_organisation_receive` with that alias,
the complete `exportId` and original `fromWorkspace`. A receiver
can instead select a host-declared `packet` file handle. The native
importer checks the complete archive and restores its original history in the
receiving workspace. Read its returned plan identity there and reopen the exact
revision before continuing edits.

The original source console owns its workspace and application lifecycle.
Closing the merchant MCP drains its own calls and file reads while preserving
the complete retained exports and the operator's console.
