# SeaTable provider acquisition and complete receiving

This guide connects the original SeaTable source reader to a real authorized provider instance and carries that same observation into the source workspace, publisher and SF82 operator. The acquisition record and the product's receiving result are separate retained records within one operation.

The runnable source is [cli.mjs](cli.mjs), with the full contracts in [README.md](README.md). The [workspace guide](WORKSPACE.md) covers source review, immutable versions, browser/CLI/MCP and managed Applications. The receiving owner can continue from complete capture-backed source files without a second provider extraction.

## Select the existing provider

Use an existing authorized SeaTable base when one is available. Resolve the actual server, base UUID, table ID and optional saved view ID from that service. Keep token values in its existing private credential mechanism; a source file contains only the environment variable reference.

For internal commissioning when no suitable base exists, use an existing equipped host and the actual official SeaTable deployment. Record the concrete image version and digest, observed server-info response and native storage location. Do not replace the provider with a local route returning hand-written API responses.

The official [edition comparison](https://admin.seatable.com/introduction/editions/) states that Developer Edition is license-free and may be used internally; it cannot be used to provide a SaaS service or as part of such a service. Enterprise licensing and the free limited-user offering have different conditions. This internal acquisition does not sell hosting or provision a paid plan. A later production delivery uses the customer's authorized existing service or an appropriate agreed edition.

Follow the current [official basic setup](https://admin.seatable.com/installation/basic-setup/) and [requirements](https://admin.seatable.com/introduction/requirements/). Retain the official compose/configuration and concrete image identity with the private host record. The standard service includes its original database/cache/storage and reverse-proxy configuration. Retain that original state through the same operation; do not restart an unrelated fleet service or create another untracked provider instance.

A public read-only API token is not assumed to exist. An operator with actual access must create or select the base-specific read token through the provider's normal interface. The source reader validates the selected base against the token-exchange response. It does not retrieve account credentials from another product.

## Required private acquisition record

Return a small JSON declaration with actual values, alongside the original provider/capture files. The source paths must be readable by the receiving process on that same host:

~~~json
{
  "schema": "stellar-forge.seatable-provider-acquisition.v1",
  "operationId": "ACTUAL_ORIGINAL_OPERATION_ID",
  "observedAt": "ACTUAL_UTC_TIMESTAMP",
  "provider": {
    "server": "ACTUAL_SEATABLE_SERVER",
    "version": "ACTUAL_SERVER_VERSION",
    "edition": "ACTUAL_SERVER_EDITION",
    "imageDigest": null,
    "baseId": "ACTUAL_BASE_UUID"
  },
  "sourceRoot": "/absolute/path/to/installed/package/source",
  "sourceManifest": {
    "file": "/absolute/path/to/installed/package/manifest.json",
    "sha256": "ACTUAL_MANIFEST_SHA256"
  },
  "selections": [
    {
      "id": "sql",
      "mode": "sql",
      "tableId": "ACTUAL_TABLE_ID",
      "viewId": null,
      "sourceFile": "/absolute/private/sql-frozen.json",
      "sourceSha256": "ACTUAL_SOURCE_SHA256",
      "captureFile": "/absolute/private/sql-capture/capture.json",
      "captureSha256": "ACTUAL_CAPTURE_SHA256",
      "rowCount": 0,
      "pageCount": 0,
      "countVerified": true
    },
    {
      "id": "view",
      "mode": "view",
      "tableId": "ACTUAL_TABLE_ID",
      "viewId": "ACTUAL_VIEW_ID",
      "sourceFile": "/absolute/private/view-frozen.json",
      "sourceSha256": "ACTUAL_SOURCE_SHA256",
      "captureFile": "/absolute/private/view-capture/capture.json",
      "captureSha256": "ACTUAL_CAPTURE_SHA256",
      "rowCount": 0,
      "pageCount": 0,
      "countVerified": false
    }
  ]
}
~~~

This is a declaration template. Placeholder strings and zeros are not a completed provider record. Populate every actual observation from returned CLI receipts; use null for an image digest only when the existing managed service does not expose one. Keep operational token references and other private host configuration outside the shared declaration.

The original manifest is authoritative for row count, page count, mode and completeness. A summary cannot substitute for its bytes and every referenced raw resource. Return the actual capture-backed source file and complete capture packet or private original directory for each selection.

## Choose coherent real input

An existing authorized customer base is the preferred input. Select a useful scalar table and a real saved view with a clear business meaning, then retain the existing IDs and provenance. Avoid publishing private fields just because they are visible to the read token.

For a new internal base, a coherent real upstream dataset is suitable for loading into the actual provider. The already-retained Sakila actor and film source used by the original NocoDB operation can be reused if its original files are available. Its actual tables contain 200 actors and 1,000 films. The original upstream intake utility and guide are retained at [provider_fixture.py](../nocodb/provider_fixture.py) and [PROVIDER_INPUT.md](../nocodb/PROVIDER_INPUT.md); use their source URL, license/provenance and file hashes. Do not regenerate an invented API fixture and call it a SeaTable capture.

Import the real CSV through the provider's normal operation into a separate internal base. Retain the upstream ID as a distinct column. SeaTable assigns its own native `_id`; these identities serve different purposes and must not be conflated. Inspect the actual imported metadata after the provider has applied its chosen field types. A CSV number imported as text remains text until an explicit source-side type change is made and observed.

Record any intentional native view filter, sort and hidden-column settings. For example, a reviewer may create a saved film view with a particular actual category or title filter; preserve that provider configuration and exact view ID. Its result size comes from the actual complete view enumeration, never an assumed fraction of the source table.

There is no need to capture the same provider table twice merely to test the product. One complete SQL selection and one complete native view selection exercise the two different supported contracts. Later aliases, public column subsets and output order use these retained observations.

## Discover actual metadata

Prepare a private source file from [example-source.json](example-source.json). Supply the actual server/base/table and token environment reference. During discovery, queries may be empty and SQL sourceOrder may be empty; this is only for choosing actual metadata.

~~~sh
install -d -m 700 /absolute/private/seatable-provider
SEATABLE_CLI="$SEATABLE_SOURCE_ROOT/stellar/scf-starforge-20261009/sf30-seller-sdk/seatable/cli.mjs"

node "$SEATABLE_CLI" discover \
  --source /absolute/private/seatable-provider/sql-rest.json
~~~

Save the returned metadata and source declaration privately. Discovery includes the actual server version/edition, base/table identity, field keys, lower-case provider types, native identity and saved view settings.

For SQL, select the exact supported scalar field union and include `_id` in sourceOrder. Metadata keys, not display names or spreadsheet column positions, identify fields in the declaration. A field display name is used only by the reader's parameterized SQL construction after the actual ID/type match.

For a native view, use its real viewId, null where and empty sourceOrder. Select only public fields that are visible in that view. The List Rows response can contain all other visible fields; the complete raw capture remains private even when the public projection is narrower.

SQL schema/cardinality and view metadata are taken from:

- [Official base-operation OpenAPI at the qualified revision](https://github.com/seatable/openapi/blob/c6d0ad9c93af77718c2ab7fcea5939c333a7a915/base_operations.yaml).
- [Official authentication OpenAPI at that revision](https://github.com/seatable/openapi/blob/c6d0ad9c93af77718c2ab7fcea5939c333a7a915/authentication.yaml).
- [Official server-info OpenAPI](https://github.com/seatable/openapi/blob/c6d0ad9c93af77718c2ab7fcea5939c333a7a915/ping_and_info.yaml).
- [Current Models](https://api.seatable.com/reference/models), [SQL reference](https://api.seatable.com/reference/querysql), [List Rows](https://api.seatable.com/reference/listrows) and [changelog](https://api.seatable.com/reference/changelog).

If an installed version returns a materially different schema, retain those actual bytes and resolve that source contract in this adapter. Do not rewrite an original response to match the expected schema.

## Capture through the original reader

Only the original reader makes the provider page requests:

~~~sh
node "$SEATABLE_CLI" capture \
  --source /absolute/private/seatable-provider/sql-rest.json \
  --out /absolute/private/seatable-provider/sql-capture

node "$SEATABLE_CLI" capture \
  --source /absolute/private/seatable-provider/view-rest.json \
  --out /absolute/private/seatable-provider/view-capture
~~~

SQL uses the actual API-gateway v2 SQL endpoint. SELECT fields are quoted from current metadata; filter values are native parameters. `server_only:false` retains the provider's normal combined-store behavior instead of silently dropping a supported provider storage family. The source order includes native identity. The reader retains actual count-before, all unique pages including the empty terminal page, count-after, metadata-before/after and server-info-before/after.

Native view mode uses the original List Rows route with table_id, view_id, start, limit and convert_keys=false. It supplies no synthetic SQL equivalent and no removed order_by/direction override. It retains the actual view page bodies through an empty terminal page and the before/after metadata/server observations.

Page offsets advance by the actual returned row count. A short nonempty page does not establish completion. Duplicate native IDs, changed metadata/base version, different server identity or inconsistent SQL counts leave the capture incomplete. The reader does not publish a manifest claiming completion in those cases.

### Limits and rate handling

The source's complete capture limits are explicit:

| Setting | Default | Allowed maximum |
| --- | ---: | ---: |
| SQL pageSize | 100 rows | 10,000 rows |
| View pageSize | 100 rows | 1,000 rows |
| maxPageBytes | 16 MiB | 16 MiB |
| maxCaptureBytes | 64 MiB | 256 MiB |
| maxPages | 10,000 | 10,000 |
| maxRows | 1,000,000 | 1,000,000 |
| timeoutMs per read | 300,000 ms | 3,600,000 ms |
| requestIntervalMs | 250 ms | 30,000 ms; minimum 200 ms |

The provider may impose stricter account or endpoint limits. The original error retains safe status/request/retry metadata; it does not continually retry an unknown request in the background. Preserve its exact returned retry guidance and use explicit same-operation resume after the underlying condition is corrected. Do not lower the declared limits after a capture has begun; they are part of the retained intent.

The in-memory parser and packet encoder require capacity for the full selected raw bytes and projections. Select a realistic declared capture size for the actual base and use the existing host's complete operation budget. A 256 MiB maximum is a validation ceiling, not a claim that the operation always uses only 256 MiB of memory.

### Resume the existing capture

Inspect the original attempt before changing it:

~~~sh
node "$SEATABLE_CLI" attempt \
  --capture /absolute/private/seatable-provider/sql-capture

node "$SEATABLE_CLI" capture \
  --source /absolute/private/seatable-provider/sql-rest.json \
  --out /absolute/private/seatable-provider/sql-capture --resume
~~~

The attempt uses the original selection/bounds intent and native kernel lease. Each committed body and receipt is checked before reuse. A complete stage interrupted immediately before rename is reconciled by exact request/size/hash and published; it does not require another successful GET. An incomplete unpublished stage can be discarded under that original lease because it has no complete request-bound receipt. A conflicting complete stage is preserved for review.

Token rotation can be supplied through the same reference. Correcting a missing private host variable, transient provider outage or interrupted file write does not require a new request UUID. Changing the table, selected fields, filter, order or limits does. Source-consistency failures require a fresh observation after the source settles. The workspace's stable UUID records distinguish these cases.

If the capture manifest already exists, resume validates every retained resource and the full projection and returns that completed observation without provider calls. The original completion timestamps are preserved. Do not delete retained capture directories to manufacture a new clean-looking run.

## Freeze and carry the same original observation

Freeze both actual captures:

~~~sh
node "$SEATABLE_CLI" freeze \
  --source /absolute/private/seatable-provider/sql-rest.json \
  --capture /absolute/private/seatable-provider/sql-capture/capture.json \
  --out /absolute/private/seatable-provider/sql-frozen.json

node "$SEATABLE_CLI" freeze \
  --source /absolute/private/seatable-provider/view-rest.json \
  --capture /absolute/private/seatable-provider/view-capture/capture.json \
  --out /absolute/private/seatable-provider/view-frozen.json
~~~

Use the returned source and manifest SHA256 values in the acquisition declaration. The frozen source connection points to the complete capture and its exact digest. It no longer needs the provider credential to inspect, project, publish or package the retained observation.

Export complete private capture packets when the original directory cannot be shared:

~~~sh
node "$SEATABLE_CLI" packet-export \
  --capture /absolute/private/seatable-provider/sql-capture/capture.json \
  --out /absolute/private/seatable-provider/sql-capture.packet.json

node "$SEATABLE_CLI" packet-export \
  --capture /absolute/private/seatable-provider/view-capture/capture.json \
  --out /absolute/private/seatable-provider/view-capture.packet.json
~~~

Transfer the actual frozen source bytes and packet bytes through the authorized private receiving surface. Receiver import validates all original members and relocates only the local capture path through a new frozen source. No raw provider page is synthesized, omitted or rewritten. Native response request URLs contain no token credentials; original response headers are restricted to the reader's safe allowlist.

The source workspace can then import the frozen source or its full source packet, inspect every captured value, save a reviewed version and prepare the same original publisher. The workspace-level packet binds its claimed origin capture SHA256 to this provider manifest.

## One complete product receiving continuation

The authoring receiving operation uses those two completed sources sequentially. It should perform the actual meaningful operating workflow, preserving original IDs and files:

1. Verify the selected source manifest and both source/capture hashes before opening private work.
2. Import each retained source into its original authoring workspace, inspect the full capture, save a draft and preview every projected row.
3. In the real browser, review the original mode/count/time/source fields, choose the explicit projection and save a reviewed immutable source version.
4. Exercise exact request replay and same-workspace close/reopen. Export and import a complete source packet into a separate receiving workspace and compare original observation identity.
5. Open the original publisher from the reviewed source, select a useful public subset/order, review and publish the actual candidate. A second edition may deliberately use another extraction order over the same retained capture; it must not be labeled a later provider observation.
6. Review and prepare the exact five-file SF82 package; stage it, open the actual original release console, exercise readiness/activation and original pinned-edition behavior, then stop its owned services.
7. Use the same retained workspace through the registered merchant MCP and managed Applications lifecycle. The Apps helper must validate the actual source/settings/workspace identity and current private startup URL.
8. Finish with an operator result that identifies source/capture/version/plan/candidate/publication/release IDs, real row counts, actual browser artifacts, retained source packet and original close/reopen state.

This operation does not need another seller/payment engine. A buyer request requiring payment demonstrates the original HTTP route/quote only. A paid transaction, if separately authorized for the operation, must use the original buyer/facilitator/settlement and preserve its actual records; it must never be implied by a simulated receipt.

The portable receiving entry and guide are composed by the source-authoring owner against these exact public APIs. Until its actual process completes, record source-ready/provider-acquisition or native-receiving-in-progress as appropriate. Do not turn implementation source or a queued host request into a claim of an installed successful run.

## Final handover

Retain one complete operator package containing:

- Exact selected source/archive/installation identity and the operating guides.
- The acquisition declaration, actual service version/base/table/view identity and original upstream provenance when applicable.
- Complete private source/capture packets with original raw page manifests.
- Saved authoring versions, the original publisher and release state, actual generated public files and private operator reopen instructions.
- The actual native receiving result and useful browser views showing its installed workflow.
- Credential-reference/setup instructions for the existing host, with secret values kept in their original private custody.

A commercial introduction can describe this complete source product and its actual demonstrated state. Customer-specific base mappings, production URLs, acceptance dates and paid terms become agreed inputs only when that customer accepts them. The proposed integration scope and internal provider commissioning are distinct records.

## Qualified source identities

Provider reference retrieval used the original SeaTable OpenAPI v6.2 branch at commit `c6d0ad9c93af77718c2ab7fcea5939c333a7a915`:

| Original file | Git blob |
| --- | --- |
| base_operations.yaml | 4f4c30d9bcfbe534968e454e509c0d7ace4bb08a |
| authentication.yaml | a9a3767e8ca91794f4d9e16314d9132dba247096 |
| ping_and_info.yaml | b10375e1de077da9b26c3546b478ab07232acba |

The current first-party changelog documents the gateway migration, parameterized SQL, explicit null-valued cells and saved-view ordering behavior. Retain the actual installed version alongside every new capture; the reference version is source qualification and does not override the observed server.
