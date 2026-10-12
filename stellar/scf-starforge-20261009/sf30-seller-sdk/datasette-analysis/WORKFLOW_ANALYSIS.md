# Original request to native source and customer Analysis

The workflow adapter receives the original business request from an installed profile, captures or acquires its full Datasette source, produces the selected customer SQL and report in the existing Analysis application, and returns complete native delivery files. The original source CLI, query and report engines, workbook producers and workspace archive receiver remain the implementation.

Import **workflow_analysis.NativeWorkflowAdapter** from this directory. The request orchestrator owns the business request, external callback or messaging conversation, its installed configuration and the outer editable handover. This adapter owns the native source and analytical operation inside that same request.

## Interface

~~~python
from pathlib import Path
from workflow_analysis import NativeWorkflowAdapter

adapter = NativeWorkflowAdapter(
    configuration,
    workspace=Path("/absolute/private/original-request/native"),
    progress=record_original_progress,
)
result = adapter.run(original_request, run_id)
~~~

The caller supplies one stable 32-character lowercase hexadecimal run_id. All subsequent invocations of that original request use the same ID, exact configuration, request body and adapter workspace.

The result contains:

| Key | Complete returned work |
| --- | --- |
| edition | The original prepared Datasette edition, source, reviewed fields, collections, native version and baseline products |
| analysis | Customer query definitions and revisions, native query/export results, report publication, optional comparison and actual completion status |
| files | Complete local deliverables, each with name, absolute path, bytes, sha256 and contentType |
| archive | The original complete Analysis workspace archive with name, absolute path, bytes and sha256 |
| nativeIds | Original capture, edition, Datasette request, Analysis job, report publication and archive identifiers |

Every returned file lives inside the caller's adapter workspace. The original native archive also appears in files. Root orchestration can assemble the complete installed source, native files, flow definitions, request history and operating guide into its independent customer handover.

The sourceArchive configuration used by that outer handover describes the complete installed software distribution. It is independent of the source feed configuration below.

## Installed environment

Use Python 3.11 or later with the original Stellar Forge buyer SDK and its existing workbook extra. Open the selected **Datasette customer Analysis** application before dispatch. The adapter reads the original private launch record and verifies the actual workspace and operation on the running numeric-loopback listener.

Fresh source capture additionally uses the original running Datasette source workspace and its private connection file. Its CLI is the maintained sibling datasette/cli.mjs under the selected source installation. Node 24 is the product's installed source runtime. The native-edition source package uses that same edition SDK.

The source and Analysis listeners run on the selected worker host, where their declared source paths and the adapter's private output directory are accessible. Their existing application controllers retain ownership of start, stop and source installation.

The companion report/export HTTP client uses the original Datasette connection, workspace checks, capability, no-proxy opener and redirect refusal. Its additional routes are the maintained Analysis report, query-export and comparison-export endpoints. Customer request fields never select a URL, capability or HTTP route.

## Installed profile and original request

A configuration has the following structure:

~~~json
{
  "schema": "stellar-forge.source-workflow-configuration.v1",
  "profile": "supplier-review",
  "source": {},
  "analysis": {
    "workspace": "/absolute/private/customer-analysis",
    "operationId": "ORIGINAL_32_CHARACTER_LOWERCASE_HEXADECIMAL_ID",
    "prefix": "supplier",
    "query": {
      "name": "supplier_exceptions",
      "title": "Supplier exceptions",
      "sql": "SELECT * FROM {{plants}} WHERE {{column:status}} = ?",
      "parameterNames": ["status"],
      "maxRows": 100000,
      "note": "Use the original source status and retained record identifiers."
    },
    "report": {
      "title": "Supplier exceptions",
      "introduction": "Original supplier records selected by the installed business rule.",
      "note": "Source edition, full query outputs and editable SQL retained together."
    },
    "waitSeconds": 3600
  },
  "delivery": {
    "queryFormats": ["csv", "jsonl", "sqlite"]
  }
}
~~~

The capitalized ID and absolute paths stand for the actual installed values. SQL columns and the report's rules must match the selected source. The profile is trusted installation configuration; credentials remain ordinary private connection references.

The business request uses the orchestrator's original schema:

~~~json
{
  "schema": "stellar-forge.source-workflow-request.v1",
  "requestId": "original-client-request-1042",
  "correlationId": "original-api-or-broker-correlation",
  "profile": "supplier-review",
  "parameters": {
    "status": "needs-review"
  }
}
~~~

The request supplies business values and selects the installed profile. The outer orchestrator retains the original request and correlation, derives run_id, and supplies the adapter workspace. A changed source selection, SQL rule or business parameter becomes a deliberate successor request under that original customer project.

### Use several report sections

Instead of analysis.query, analysis.queries accepts one to twelve configured query objects with distinct names. The native report pins each saved query revision and runs every section against the same observed Analysis view bindings. Each query receives its own complete native CSV, JSONL and SQLite export plus manifest.

The original prepared source's complete row collection is named plants in the existing Datasette component. The adapter resolves {{plants}} or {{collection:plants}} to that edition's real quoted Analysis table name. Other {{collection:NAME}} tokens resolve only when that native prepared collection exists.

{{column:NAME}} resolves the original source's reviewed column mapping and requires that column in the prepared full-source collection. An explicit installed SQL identifier remains unchanged. parameterNames supplies the ordered values for native SQL question-mark placeholders. Values go through Analysis parameters_text; they are never substituted into SQL text.

The native query preview accepts maxRows from 1 through 100,000. Full native query exports independently stream the complete selected query with the original SQL, parameter values and pinned views. A native preview limit remains visible as previewTruncated, previewRows and the actual exported row count.

## Source modes

### Receive an existing handover

~~~json
{
  "kind": "handover",
  "path": "/absolute/private/retained-source/handover.json",
  "sha256": "EXACT_SHA256_OF_THAT_ORIGINAL_HANDOVER"
}
~~~

The adapter checks the original complete handover bytes and retains them as Original_Handover.json. It resolves the original member paths through the maintained source reader and preserves that normalized selection as Source_Handover.json.

The native handover schema is stellar-forge.datasette-analysis-handover.v1. The original source reader supports native-edition, retained-source and finalized deliveries. Preparing the edition invokes its full original source reader, member hashes, page continuation and native importer. The completed native workspace archive carries the actual source closure.

### Receive a named native edition

~~~json
{
  "kind": "native-edition",
  "edition": "/absolute/private/datasette/editions/original-edition/edition.json",
  "sha256": "EXACT_EDITION_SHA256_RETURNED_BY_THE_PUBLISHER",
  "node": "/absolute/installed/node"
}
~~~

The adapter constructs the original native-edition handover. It also calls readDatasetteEdition and exportDatasetteEdition from the installed SDK to retain the complete original source package as Source_Edition.datasette.json.gz.

The native package carries the original edition, review, capture, response bodies and declared member closure. Each actual member is reopened by the maintained reader before the source enters customer Analysis.

### Capture a complete fresh source

~~~json
{
  "kind": "datasette",
  "connectionFile": "/absolute/private/datasette/connection.json",
  "workspaceId": "ORIGINAL_SOURCE_WORKSPACE_UUID",
  "node": "/absolute/installed/node",
  "editionName": "Supplier source observation",
  "selection": {
    "url": "https://original-source.example/database/suppliers.json?_shape=arrays",
    "kind": "table",
    "database": "database",
    "table": "suppliers",
    "continuation": "auto",
    "approvedOrigins": ["https://original-source.example"],
    "metadata": {
      "title": "Original supplier source",
      "source": "Original publisher"
    }
  },
  "key": ["supplier_id"],
  "urlParameters": {
    "status": "status"
  }
}
~~~

This example describes field positions. Use the actual endpoint, original source schema, attribution, connection and reviewed key from the installed client workflow. selection is passed to the maintained capture API. When response pages omit columns, include their original ordered column names in selection.columns.

urlParameters is optional. Each key names one configured URL query parameter; its value names the business request parameter supplying that filter. The adapter percent-encodes that scalar value while keeping the selected source origin, path and remaining query parameters. The original capture API still enforces its source and continuation rules.

The complete native pipeline is:

1. source.capture with a stable UUID derived from run_id and the exact installed source selection.
2. source.review across the complete original rows and configured key.
3. A second source.review with the explicit selected projection.
4. editions.create with the same capture, key, projection and stable edition ID.
5. editions.inspect to retain the actual editionFile and editionSha256.
6. The native source package export and original customer handover.

A configured projection uses the publisher's original schema. Without one, the installed workflow explicitly adopts suggestedProjection from the complete native review and rereviews that same projection. The suggestion comes from every original source row, including numeric precision, nulls, empty strings and structured values. A named edition retains its actual immutable review and source observations.

No page limit is supplied by this adapter. A source capture follows the original source's complete continuation. On an interrupted transport, the same native input and capture UUID continue the saved acquisition.

## Complete customer output

Each configured customer query is saved under its configured name plus the retained run identifier. Its original revision, SQL, parameters and native view bindings remain with the customer project. Native query jobs and streaming query-export jobs retain separate identities.

For every query, the default delivery includes:

| File | Native content |
| --- | --- |
| QUERY_rows.csv | Full original query export with the native spreadsheet-safe CSV behavior |
| QUERY_rows.jsonl | Full typed source values through the native JSONL exporter |
| QUERY_rows.sqlite3 | Complete native query SQLite output |
| QUERY_manifest.json | Native complete export declaration, view bindings, source identities and output hashes |

The customer report uses AnalysisReports.save, the original report job, report publication and report-export operations through the same listener. It pins the exact saved query revisions, source edition and view bindings. The complete native exports are Customer_Report.html, Customer_Report.json and Customer_Report_Tables.zip.

The original Datasette baseline report, source-wide workbook, workbook handover and complete workspace archive travel alongside these customer outputs. The archive snapshots the actual editable Analysis database, source documents, queries, query results, report definitions and publications, workbooks, exports and operator history.

### Compare a retained earlier edition

Add an actual existing earlier edition and its reviewed source keys:

~~~json
{
  "comparison": {
    "before": "ORIGINAL_EARLIER_ANALYSIS_EDITION_SHA256",
    "keys": ["supplier_id"]
  }
}
~~~

Place comparison inside analysis. The native Datasette comparison uses the earlier and newly prepared editions. It preserves the original key review, view and result identities. The adapter exports all actual comparison rows through the native change-export engine into Source_Comparison.json and Source_Comparison.csv. The comparison's native selection hash comes from its returned original page.

## Continuation and actual status

The private native-workflow.json binds the exact configuration, business request and run ID. It retains the original native inputs, stage identifiers, query view bindings and result. The adapter's per-request filesystem lock keeps concurrent callers on that same journal.

Source inputs and complete native CLI receipts are retained under native-inputs and native-records. Each native CLI attempt preserves its own stdout and stderr. A completed receipt is reused after a lost transport or late close error.

Datasette prepare, compare and export use their original retained request IDs. Interrupted requests continue through the existing controller's resume operation. Analysis query/report/export jobs retain their original IDs; where the native engine preserves a failed job as immutable, a new recorded attempt derives from the same run and stage. Existing complete jobs and files are reused.

Progress contains stage names, run and native IDs, status and useful counts. It carries no loopback capability, credential or raw source payload. Native command and connection configuration remain in the private installed operation.

analysis.status is COMPLETE when the requested preview and native customer report completed fully. It is PARTIAL when the actual native query preview is truncated or the native report returns its concrete section, result or time limit. The result retains each query's actual preview/export counts and the report's native error. Full available query exports, baseline products and native archive still reach the original caller.

Other native failures retain their original operation and raise WorkflowAnalysisError or the original client error. The orchestrator can continue the same business request after the concrete source or native condition is resolved. Waiting time ends the caller's wait without creating another business request.

## Independent receiving

~~~python
received = adapter.receive(
    archive_path="/absolute/private/delivery/Datasette_Analysis_Workspace.zip",
    sha256=original_archive_sha256,
    destination="/absolute/private/received-customer-analysis",
    operation_id=original_receiving_operation_id,
)
~~~

receive calls the maintained restore_archive function with the complete original archive, exact SHA-256, separate destination and stable receiving operation. The original native receiver preserves subsequent customer edits when a completed receiving operation is repeated.

Open the received **Datasette customer Analysis** application with its original Analysis operation ID. Its saved source, customer queries, report definitions, native results and workbook remain editable. A deliberate later request or source observation can continue that same project and produce its retained successor export.

## Maintained source references

- [Datasette product](../../../../products/datasette/README.md) and [operating guide](../../../../products/datasette/OPERATING.md)
- [Customer Analysis operator and client](README.md)
- [Original source CLI](../datasette/cli.mjs), [workspace operations](../datasette/workspace.mjs) and [edition SDK](../datasette/editions.mjs)
- [Original Analysis workspace](../../sf88-operator-buyer-cli/python/stellar_forge_buyer/analysis_workspace.py), [query exports](../../sf88-operator-buyer-cli/python/stellar_forge_buyer/analysis_exports.py) and [report engine](../../sf88-operator-buyer-cli/python/stellar_forge_buyer/analysis_reports.py)

Copyright TokenJunkieLabs. MIT.
