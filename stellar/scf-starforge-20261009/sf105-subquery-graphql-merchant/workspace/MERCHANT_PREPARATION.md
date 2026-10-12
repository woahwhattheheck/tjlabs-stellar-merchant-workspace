# Saved merchant preparation and recovery

This workflow prepares the existing SF105 merchant and schema-revision packages
from an exact committed draft. It records the request and each native attempt
before calling the original onboarding compiler. The browser, installed CLI,
MCP tools and project receiver use the same workspace and native files.

Preparation compiles retained source and writes merchant/buyer files. It does
not query the GraphQL provider, pay an HTTP 402 challenge, start a seller,
stage a release, or deploy a host. Those existing operations remain explicit
steps after a complete package is selected.

## Complete browser workflow

1. Open the original private GraphQL workspace, select the project, finish its
   schema/query/plan edits, save the draft, and use **Review merchant**.
2. Choose **Export current project**. Before dispatch, the browser retains the
   exact preparation UUID, project revision, input digest and request body in
   its own durable request store. The native workspace then records that same
   request, source revision and first attempt before invoking the exporter.
3. Read **Saved merchant preparations**. A complete result identifies the
   original export and every retained native file. The existing saved-export,
   runtime and deployment controls use that same export.
4. For a schema or merchant revision, select the original baseline, use
   **Compare current draft**, save any pending edits, and choose **Prepare
   revised package**. The preparation freezes the exact baseline reference and
   comparison digest, then calls the existing revision compiler.
5. Open a preparation to inspect its immutable generations, original draft,
   baseline, attempt requests and outcomes. **Read frozen source** displays the
   exact original schema, approved queries and plan without replacing the
   current editor.
6. If an operation was interrupted, use **Recover current original result**.
   This verifies the files already produced. A complete native merchant is
   attached to the current project; later saved schema/query/plan edits stay
   intact. Incomplete output remains available as a partial attempt.
7. Only after inspecting a current **PARTIAL** generation, choose **Continue in
   a new attempt**. This retains a new explicit attempt UUID for the same frozen
   source. Every previous request and directory remains unchanged.
8. Choose **Prepare complete current packet** for the offline report and exact
   files. Use **Project handover** for an editable receiving workspace.

A lost HTTP response does not require guessing whether to export again. The
**Original request and recovery** section retains the exact pending request.
**Retry exact original request** resubmits those unchanged bytes and UUID. If
the response was accepted but the browser did not finish its display update,
**Reopen accepted result** reads the saved result without another preparation.

The browser can also inspect an original preparation UUID directly. The native
catalog includes requests saved before their first project attachment, so its
history remains available even after browser storage or the listening port
changes. The caller must still open the correct private workspace and project.

Recovery does not overwrite unfinished browser editor text. A result can be
retained on the server while the browser keeps its local edits. Reopen the
current saved project when ready to adopt the retained export in that editor.
A definitely refused request may be cleared only after the original host
reports no preparation under its UUID. Accepted or uncertain work retains its
request for recovery.

## Native state and original identity

| State | Retained work | Next deliberate action |
| --- | --- | --- |
| READY | Original request, committed draft hash and exact baseline; no attempt has started | Retry the same preparation request to start its first attempt, or read/recover its attachment |
| PREPARING | Original attempt UUID and directory retained before exporter entry | Let its owning writer finish; after that writer ends, inspect/recover the existing native files |
| PARTIAL | Original attempt outcome and all bounded partial file identities | Read the native error and source; explicitly continue into a new attempt if the same source should be retried |
| COMPLETED | Verified complete native package and original project/export references | Use the existing merchant, revision, deployment or receiving workflow |

The preparation UUID is distinct from a later continuation UUID. The first
attempt uses the preparation UUID; each deliberate continuation has a new
version-4 UUID. Retrying any retained request keeps its original UUID. A
continuation must include the inspected current generation and record SHA-256.

Each preparation supports up to 32 attempts and 256 immutable generations.
Records live under `merchant-preparations/<preparation UUID>/<generation>.json`.
Native attempt files live under
`packages/<project>-r<original revision>-preparation-<attempt UUID>/`.
The complete native output still uses the original merchant/revision format.
No alternate compiler, merchant implementation or project store is introduced.

The original workspace lock excludes a second process from its writer.
In-process mutations remain serialized through the native server. An active
preparation prevents recovery or file selection from treating a currently
written directory as an ended attempt. File selection also rejects a capture
that spans a preparation start-and-finish interval.

### What recovery verifies

For a complete merchant, recovery verifies the original native manifest and
every declared leaf, the exact schema/query/plan bytes, and the original
compiler's service/query binding. For a revised merchant, it also verifies the
complete previous bundle, candidate bytes, original revision metadata files,
baseline identities and inspected comparison report.

A surviving original workspace-export record remains bound to its exact SHA.
If only that small wrapper publication was interrupted, recovery reconstructs
the original documented return shape around the already verified native
output. It does not invoke the exporter a second time. If the native output is
incomplete or inconsistent, the attempt retains that observed outcome.

Project attachment uses the latest committed input and preserves later edits.
A preparation still names the immutable source revision that it originally
selected. Thus a recovered export may intentionally refer to older source than
the current editor; normal export/runtime source checks continue to apply.

## Installed CLI and original agent tools

Use the installed `starforge graphql-product` entrypoint from the complete
GraphQL product recipe. Open the product through its existing launcher first.
Every command below reads the same private `connection.json` and uses its
original MCP/native owner. It does not start an independent workspace server.

Keep request JSON files in your private working directory. Obtain actual
project revisions, source aliases and hashes from the original operator.
The example UUIDs below illustrate distinct stable identities; choose your own
once and retain them before the first invocation.

### Prepare a merchant

`prepare-merchant.json`:

```json
{
  "project": "sixfeetup-merchant",
  "source": "indexer",
  "id": "13f7d927-7d7a-4f11-8a12-f7bce4126990",
  "expectedRevision": 7,
  "kind": "merchant"
}
```

```sh
starforge graphql-product prepare-merchant \
  --dir /PRIVATE/graphql-product \
  --request /PRIVATE/prepare-merchant.json
```

Replace the example project/source/revision with the inspected selection.
Optional `inputDigest` pins the original input digest as well. A revision
request uses `"kind": "revision"` plus the original `baselineExportId` and
`comparisonDigest` returned by the existing evolution comparison.

If the reply is lost, retain this file and rerun this exact command. The native
core recognizes the original preparation request before checking a newer
project head. It does not repeat an attempt that already started.

The corresponding tool is `merchant_graphql_preparation_prepare`; it also
requires the host-declared `workspace` alias. The installed client supplies
that alias from its existing product connection.

### List, inspect and recover

`preparation-list.json` contains
`{"project":"sixfeetup-merchant","offset":0,"limit":10}`. Keep the returned
`snapshotSha256` as `expectedSnapshotSha256` when paging the same list.

`preparation-selection.json`:

```json
{
  "project": "sixfeetup-merchant",
  "preparationId": "13f7d927-7d7a-4f11-8a12-f7bce4126990"
}
```

```sh
starforge graphql-product merchant-preparations \
  --dir /PRIVATE/graphql-product --request /PRIVATE/preparation-list.json
starforge graphql-product merchant-preparation \
  --dir /PRIVATE/graphql-product --request /PRIVATE/preparation-selection.json
starforge graphql-product recover-merchant-preparation \
  --dir /PRIVATE/graphql-product --request /PRIVATE/preparation-selection.json
```

Inspection accepts optional `generation` and `recordSha256` for an exact
historical generation. Recovery always reconciles the current preparation and
takes only `project` and `preparationId`. It does not require a current-project
revision because it attaches the original result while preserving later input.

Tools: `merchant_graphql_preparations`, `merchant_graphql_preparation`,
and `merchant_graphql_preparation_recover`.

### Explicit continuation

After inspecting a current PARTIAL result, retain this shape with the actual
returned generation and SHA-256:

```json
{
  "project": "sixfeetup-merchant",
  "source": "indexer",
  "preparationId": "13f7d927-7d7a-4f11-8a12-f7bce4126990",
  "id": "9d523b43-3f4b-4b08-bc12-196a6f048386",
  "expectedGeneration": 3,
  "expectedRecordSha256": "REPLACE_WITH_THE_INSPECTED_64_HEX_SHA256"
}
```

```sh
starforge graphql-product continue-merchant-preparation \
  --dir /PRIVATE/graphql-product --request /PRIVATE/continue-preparation.json
```

This calls `merchant_graphql_preparation_continue`. The source alias is
compared to the same frozen draft's original endpoint and credential reference.
It never changes that draft to the latest editor contents. To prepare changed
source, save/review it and create a separate new preparation request.

### JavaScript client

```js
const client = new GraphqlProductClient({
  connectionFile: '/PRIVATE/graphql-product/connection.json'
});
await client.ready();
await client.prepareMerchant(originalPrepareRequest);
await client.listMerchantPreparations({ project, offset: 0, limit: 10 });
await client.inspectMerchantPreparation({ project, preparationId });
await client.recoverMerchantPreparation({ project, preparationId });
// Only after inspecting the actual PARTIAL generation:
await client.continueMerchantPreparation(originalContinuationRequest);
```

Import `GraphqlProductClient` from the installed
`products/graphql-workspace/client.mjs`. These methods use the existing
transport, preserve product/workspace identity across reconnects and issue only
the requested native operation. The client does not automatically replay a
write after an uncertain response.

## Complete files, offline reading and editable receiving

Prepare the selected packet with the actual current saved project revision:

```json
{
  "project": "sixfeetup-merchant",
  "revision": 10,
  "preparationId": "13f7d927-7d7a-4f11-8a12-f7bce4126990"
}
```

```sh
starforge graphql-product merchant-preparation-packet \
  --dir /PRIVATE/graphql-product --request /PRIVATE/preparation-packet.json
```

Tool: `merchant_graphql_preparation_packet`.
Client: `prepareMerchantPacket(selection)`.

The packet includes an offline `index.html`, `preparation-files.json`, exact
source revision, all preparation generations/attempts, complete and partial
native files, and any selected original revision baseline. Packet directories
are content addressed. A later source change or continuation does not rewrite
an already retained packet.

For complete directory receiving, use the existing
`merchant_graphql_export_prepare` with one retained transfer `exportId` and
this file selection:

```json
{
  "project": "sixfeetup-merchant",
  "revision": 10,
  "kind": "preparation",
  "preparationId": "13f7d927-7d7a-4f11-8a12-f7bce4126990"
}
```

Then use the existing `GraphqlProductClient.receiveFiles`, CLI `receive`,
or native retained-file tools to finish the byte-verified folder. Pin the
returned manifest SHA-256 and continue the same transfer/output directory.
The original native and transport manifests remain included. Every file keeps
its original length and SHA-256; partial downloads verify their retained
prefix. A completed folder can be read offline through `open-files`.

For editable work, prepare a **whole project handover** using the original
handover API/CLI. It now includes saved preparation records and every accepted
attempt/file alongside all selected project revisions, previews, request runs,
comparisons, merchant/evolution packages, deployment and host records. Native
receiving validates this complete closure before publishing the project head.

A receiving workspace retains original preparation/attempt IDs and absolute
source metadata. Its existing local path map resolves those files inside the
receiving root. Recovery can attach a verified original output after receiving;
an explicit new attempt writes only its new local directory. Compatible later
destination history and current editor text remain preserved. A receiving
archive does not itself start an exporter or merchant.

See [README.md](README.md) for the original workspace and
[the product handover guide](../../../../products/graphql-workspace/HANDOVER.md)
for its existing retained-transfer and receiving commands.

## Native HTTP compatibility

| Route | Request |
| --- | --- |
| GET `/api/preparations` | `project`, optional `offset`, `limit`, `expectedSnapshotSha256` |
| GET `/api/preparation` | `project`, `preparationId`, optional `generation`, `recordSha256` |
| POST `/api/preparation/prepare` | Stable `id`, `project`, `expectedRevision`, optional `inputDigest`, `kind`; revision baseline/digest when applicable |
| POST `/api/preparation/recover` | `project`, `preparationId` |
| POST `/api/preparation/continue` | New attempt `id`, `project`, `preparationId`, exact `expectedGeneration` and `expectedRecordSha256` |
| POST `/api/preparation/packet` | `project`, `revision`, `preparationId` |
| GET `/api/preparation/file` | Original packet selection, `file`, `expectedManifestSha256` |

All routes use the existing local host/origin checks and workspace token.
Writes use the original serialized mutation path. Native completion/attachment
returns HTTP 201 with `project`, `record`, `recordSha256`, `reference` and
`exported`. `exported` is null for a retained unfinished preparation; inspect
the actual state and error before deciding on continuation.

Existing `/api/export` and `/api/evolution/prepare` request bodies still work.
They accept an optional `preparationId` to retain a caller's original UUID.
Without it, the server assigns a UUID and exposes the result in native
preparation history. Existing `merchant_graphql_prepare` and
`merchant_graphql_prepare_revision` tools preserve their prior fields and
return an additional preparation reference/state. New callers should use the
explicit saved preparation tools for exact request recovery.

## Validation scope

Source verification must distinguish compiler recognition and recovery from a
live GraphQL/provider run. Preparing or recovering a merchant uses the original
retained-source compiler only. Actual source requests, payment challenges,
runtime startup and deployment retain their own original observed results.
