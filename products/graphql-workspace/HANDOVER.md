# Continue a GraphQL project on a receiving host

A project handover retains every committed revision through the selected revision and the complete original files referenced by those revisions: completed source previews, merchant and buyer packages, schema-evolution baselines and reports, deployment generations and generated host packets. The recipient reopens that same project ID in the original SF105 store and continues its normal editor, comparison and merchant workflow.

The source revision JSON and original artifact records keep their exact bytes and hashes. A private per-project path history resolves those original paths inside the receiving workspace. New drafts and newly generated outputs use the receiving workspace normally. This makes an older merchant usable as a real schema baseline after transfer without rewriting its source history.

## Prepare from the source product

Use the installed complete distribution and the source product's existing browser and agent. Save the current editor, then choose **Project handover → Prepare complete saved project**. Preparation returns the private folder, source project/revision, handover hash and actual file/count totals. The browser retains the preparation UUID so the same selection can continue after a lost response.

The corresponding installed command is:

~~~sh
starforge graphql-product prepare-handover \
  --dir /srv/private/source-product \
  --id 4530e067-a3a5-45c1-800a-acac7c6a2f2d \
  --project stellar-data --revision 12
~~~

Replace the example project, revision and UUID with the saved project selection and a new UUID for that preparation. Retain that exact UUID and selection when repeating an interrupted command. The original source workspace owns the preparation; opening another writer on the same directory is unnecessary.

For the existing resumable agent transfer, select the new native **handover** kind. Store this JSON in a private selection file:

~~~json
{
  "project": "stellar-data",
  "revision": 12,
  "kind": "handover"
}
~~~

Then use the same source product client and original downloader:

~~~sh
starforge graphql-product receive \
  --dir /srv/private/source-product \
  --export-id stellar-data-history-r12 \
  --selection /srv/private/handover-selection.json \
  --out /srv/private/received-stellar-data-r12
starforge graphql-product inspect-received \
  --dir /srv/private/received-stellar-data-r12
~~~

The selected transfer ID, native manifest, per-file hashes, read IDs and chunk offsets retain their existing recovery behavior. Repeat the same command and output directory to continue a partial download. The resulting directory contains project-handover.json, the complete selected original files and the existing transfer manifests. A complete local prepared folder can also be transferred through the operator's existing private file-transfer route.

Preparation pins one immutable handover index. Reading subsequent transfer files checks each selected file's identity without repeatedly hashing every artifact in the entire project.

## Open the receiving product

Initialize the receiving product through the same graphql-product init workflow, supplying that host's explicit source aliases and environment-reference names. Use its own private product directory and the existing installed runtime:

~~~sh
starforge graphql-product init \
  --dir /srv/private/received-product \
  --sources /srv/private/receiving-sources.json \
  --workspace indexer --name "Stellar data operations"
starforge graphql-product open --dir /srv/private/received-product --port 0
~~~

Applications provides the same Review → Save → Start → Open sequence. It opens the original writer used by the receiving browser and agent. Token and backend credential values stay in the operator's environment.

In that browser, enter the complete downloaded folder in **Project handover → Received handover directory**, then **Inspect handover**. Inspection checks all files, the original record references and full revision history. It shows the source revision, target's actual current revision, file totals and intended result. **Reopen original project** applies that inspected selection through the same writer.

For CLI operation, inspect the receiving host's folder against the target product:

~~~sh
starforge graphql-product inspect-handover \
  --dir /srv/private/received-product \
  --from /srv/private/received-stellar-data-r12
~~~

Use the returned handoverSha256 and expectedRevision in a new receiving request:

~~~sh
starforge graphql-product reopen-handover \
  --dir /srv/private/received-product \
  --id 2ed1660e-b69f-4c93-9e2a-e25b33e3c586 \
  --handover-sha256 RETURNED_HANDOVER_SHA256 \
  --expected-revision 0 \
  --from /srv/private/received-stellar-data-r12
~~~

Here 0 is illustrative for an absent target project. Use the actual inspected value if the target already has this project. The result returns the selected source revision, received revision and current local revision.

## Continue after an interruption or restart

Receiving publishes its original UUID, selected handover hash and expected target revision before installing files. Each immutable destination file is published only after its complete bytes are synced. The project head advances after the entire selected file closure and local path history are retained.

Repeat the same receiving UUID/hash/expected revision after a lost response. Matching existing history is reused. A target with later matching revisions keeps those later edits. Divergent original history or a same-path file with different bytes is reported as a conflict and is never overwritten; select the appropriate existing project or initialize a separate receiving workspace.

**Receiving history** in the original browser lists the retained requests and receipts even after the browser port, token or MCP process changes. Continue an unfinished item with its original request. Enter the input folder when files remain to be copied. If all required files already arrived before the interruption, the same native operation can finish from those retained files even if the input directory is unavailable.

The original agent exposes merchant_graphql_handover_receivings, merchant_graphql_handover_inspect and merchant_graphql_handover_receive. Receiving history is paged with offset/limit and an exact snapshot hash. The product CLI can call these tools with an exact private request JSON through its existing call command.

If another draft has unsaved browser edits, receiving retains the project and leaves that editor open. Save the draft before selecting **Open received project**. Native receiving does not discard or reinterpret that local editor text.

## Continue authoring, baselines and deployment

Open the received project and use its original revision selector. Its raw schema, approved queries and merchant plan remain editable; incomplete drafts remain available. Completed preview requests/responses retain their original source and operation identities. Schema comparison reads the retained merchant and its original native bundle through the local path resolver.

Before requesting new source data, select the receiving host's actual declared source. The existing agent checks that the saved query origin, path and authorization environment name match that source alias. If the endpoint changed, save the explicit query-connection edit and capture/review the appropriate schema through the original editor. Earlier source captures and previews remain historical records.

A received merchant can be reviewed and compared with its original baseline through the normal workflow. Export the reviewed saved change to produce its next merchant and buyer package.

Deployment and host files retain their original installed-adapter and host bindings. Their original bytes and runbooks remain readable. Select **Prepare this merchant for this installation** to invoke the existing deployment compiler using the received merchant and the current installed source. Then stage, inspect, activate, run and recover through the original SF82 release console, and prepare the target's host packet through the original SF99 compiler.

Running processes, release-store selections, private credential values and machine-specific environment files are outside this committed-project transfer. A received historical deployment is never presented as a newly running merchant.

## Capacity and file scope

The handover uses the existing native retained-file transport. A selection supports up to 510 original files, plus its handover and transfer manifests; individual original files remain within 8 MiB and the selected originals within 255,000,000 bytes. Every committed revision through the selected revision must fit together. Preparation reports the actual totals and rejects an incomplete selection instead of silently dropping earlier history.

Only files referenced by those committed revisions are included. Unattached or still-running previews remain with their original operation. The receiver verifies that each listed source file belongs to the selected project closure, rejects unsafe paths and conflicting parent/file names, and preserves original IDs and hashes throughout.

The same original runtime, workspace API, merchant compiler, revision compiler, deployment compiler and release console remain the operating system for the received project.
