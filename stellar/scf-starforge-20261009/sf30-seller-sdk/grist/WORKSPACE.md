# Grist source workspace

The Grist workspace is the full source-authoring operator over the original Grist capture, dataset publisher and SF82 release engines. Browser, CLI and merchant MCP use one model and its original private SQLite workspace. Managed Applications starts the same CLI with exact source, settings, connection and workspace identity.

Use the selected build/install commands in [README.md](README.md). The complete path requires the original native profile, mcp feature and operator support. Installed commands are grist-source, grist-workspace, grist-publisher and grist-deployment.

## Initialize and open

~~~sh
install -d -m 700 /absolute/private/grist
GRIST_WORK=/absolute/private/grist/catalog
GRIST_SOURCE="$GRIST_RUNTIME/package/source/stellar/scf-starforge-20261009/sf30-seller-sdk/grist"

node "$GRIST_SOURCE/workspace/cli.mjs" init --directory "$GRIST_WORK"
node "$GRIST_SOURCE/workspace/cli.mjs" serve --directory "$GRIST_WORK" --port 0
~~~

The current process prints the browser URL with its private fragment token. Open that complete URL. The server is loopback only, validates Host and Origin, and requires the token for reads/actions. The browser retains the token in session storage and removes it from the displayed address. This is an operator URL, not a public merchant endpoint.

The workspace retains sources.sqlite, initialization intent, source/capture/version files, original request receipts and the one managed current-source.json. Its original publisher lives in publisher/ and its dataset defaults to dataset/. init --target can bind a separate absolute dataset path. Initialization retains that binding; reopening a different target or an unrelated pre-existing directory fails.

Use serve without --create to reopen existing work. An interrupted initialization can resume only its exact original initialization intent. An invalid existing directory remains intact for deliberate recovery.

One process owns the original workspace lease. Stop the current CLI or Application before another owner opens it. Browser and MCP can share a single MCP-owned model; starting another standalone browser process is not required.

## Declare the source connection

The private connections file holds aliases and environment references. An existing read-token example is:

~~~json
{
  "catalog": {
    "label": "Existing Grist document read access",
    "server": "https://YOUR_EXISTING_GRIST_SITE",
    "tokenEnv": "GRIST_READ_TOKEN"
  }
}
~~~

For a deliberately public document:

~~~json
{
  "public_tasks": {
    "label": "Official public Task Management example",
    "server": "https://public.getgrist.com",
    "allowAnonymous": true
  }
}
~~~

A connection cannot contain both a token environment reference and anonymous permission. The original provider validates the server and optional allowHttp, maxPageBytes, maxCaptureBytes, maxRows, timeoutMs and requestIntervalMs bounds. Credential values remain in the existing host environment; do not paste them into browser fields, source files or packets.

~~~sh
node "$GRIST_SOURCE/workspace/cli.mjs" serve \
  --directory "$GRIST_WORK" --port 0 \
  --connections /absolute/private/grist-connections.json
~~~

The browser lists safe host aliases and configured/missing state. It cannot choose an arbitrary environment key or local input file. A changed host connection file takes effect through normal stop/review/reopen, not by replacing the configuration of an active owner.

The optional --seller and --resource CLI flags bind original public buyer-handoff URLs together. Supplying them does not start a seller, extract data or submit a payment.

## Select a document and actual table

A source can begin with only its existing site connection and document ID. No invented table ID is needed. In **Capture source**, select the host connection, enter the exact document or URL ID, and choose **List document tables**.

This explicit action reads only the native document metadata and `GET /api/docs/DOC_ID/tables`. It saves both complete JSON bodies, permitted response headers, request URLs, timestamps and byte/hash identities before completing one original `DOCUMENT` request. The document catalog is in the same `sources.sqlite` and `inputs/` directory as the rest of the authoring workspace.

Choose an actual ID from **Document tables**, then **Choose this table** and **Inspect actual metadata**. The list uses native table IDs and native table references. It does not invent friendly titles from UI page names. Search and page controls read the saved catalog; they do not call Grist. **Retained document catalogs** reopens previous observations after the browser, CLI or MCP owner has stopped.

The selection records the catalog UUID, complete catalog SHA256, original metadata hashes, actual table ID and native table reference. Field discovery checks the same document, declared connection and read credential. If a credential or host connection changes, make a new explicit document observation before choosing a table from it. This prevents a table choice from silently adopting a different account's metadata.

A catalog entry is metadata visible to the selected account. It is not proof of permission to read all rows. Table inspection, field selection and the complete typed-record capture are subsequent actions with their own native receipts. The source API does not list saved UI views, resolve linked display values, join tables or establish a cross-table transaction.

### CLI selection and recovery

Stop the browser/Application owner before these CLI commands open its same workspace. Each command closes its own original model when complete. When using the shared MCP browser instead, run the equivalent MCP tools through that owner.

~~~sh
node "$GRIST_SOURCE/workspace/cli.mjs" document \
  --directory "$GRIST_WORK" \
  --connections /absolute/private/grist-connections.json \
  --connection public_tasks --document hik1whAV5snj \
  --request 61000000-0000-4000-8000-000000000001
~~~

The example document is the official public Task Management acquisition candidate. The command must return real native table IDs before choosing one; no table names or row counts are supplied as fixtures. Save the actual returned `id` and `catalogSha256`. The example UUID represents one deliberate metadata observation; a later new observation gets a new UUID.

~~~sh
node "$GRIST_SOURCE/workspace/cli.mjs" document-tables \
  --directory "$GRIST_WORK" \
  --catalog 61000000-0000-4000-8000-000000000001 \
  --offset 0 --limit 100

node "$GRIST_SOURCE/workspace/cli.mjs" document-tables \
  --directory "$GRIST_WORK" \
  --catalog 61000000-0000-4000-8000-000000000001 \
  --search ACTUAL_NATIVE_ID_TEXT --offset 0 --limit 100

node "$GRIST_SOURCE/workspace/cli.mjs" discover \
  --directory "$GRIST_WORK" \
  --connections /absolute/private/grist-connections.json \
  --connection public_tasks --document hik1whAV5snj \
  --table ACTUAL_RETURNED_TABLE_ID \
  --catalog 61000000-0000-4000-8000-000000000001 \
  --expected-catalog-sha256 ACTUAL_RETURNED_CATALOG_SHA256 \
  --request 61000000-0000-4000-8000-000000000002
~~~

Use the actual matching `catalogSha256`; the uppercase values are placeholders, not accepted native identities. An ID absent from that retained catalog is refused. The existing direct `discover --document ... --table ...` remains available for an operator who already knows the native table ID. Supplying one of `--catalog` and `--expected-catalog-sha256` requires both.

After a lost response, use `operation --request SAME_UUID` and `resume --request SAME_UUID`. A completed operation replays its original saved result. An interrupted document request adopts only its already retained complete metadata file. If that file was positively never published, recovery ends with `GRIST_DOCUMENT_CATALOG_NOT_RETAINED`; acknowledge that original failure before requesting a new observation. A transient unresolved I/O failure remains interrupted. No reopen, search, export or recovery step silently repeats the metadata reads.

### Private metadata transfer

~~~sh
node "$GRIST_SOURCE/workspace/cli.mjs" document-export \
  --directory "$GRIST_WORK" \
  --catalog 61000000-0000-4000-8000-000000000001 \
  --out /absolute/private/grist-document-observation.json
~~~

The export is the exact retained `stellar-forge.grist-document-observation.v1` envelope. It includes both original body byte sequences as base64, their sizes/hashes, fixed read URLs, safe headers, receive times, anonymous/bearer mode and a one-way read-authority binding. It contains no credential value or token environment reference. It may contain private document names and visible native metadata; keep it with the merchant's private recovery input. It is separate from a complete row capture/source packet and from the projected customer dataset.

MCP uses `merchant_grist_document_list` with workspace alias, declared connection alias, document ID and original UUID. `merchant_grist_document` takes `catalogId`, offset, limit and optional search for the saved IDs. `merchant_grist_discover` accepts the same catalog/hash pair and explicit table ID. `merchant_grist_document_read` streams the exact private metadata through the original retained-file reader, with catalog UUID, read ID, expected SHA256 and offset. Release that read with the existing `merchant_grist_packet_release`. After owner restart or read expiry, omit only the old read ID while retaining the same catalog/hash/offset.

### More than one table

Use a distinct original authoring workspace and dataset output for each independently captured table when both outputs must remain independently operable. Declare both under the existing MCP workspace aliases, or open them one at a time through CLI/Applications. Each table has its own catalog-linked discovery, complete capture, source version, numeric publisher plan and release history. Reopening a saved edition does not retarget its original capture. There is no joined dataset, linked-reference expansion or atomic multi-table snapshot implied by the document chooser.

## Discover actual native fields

In Capture source, choose the declared connection and original document ID or URL ID. Use the retained document chooser above, or enter an already known actual user table ID. Enter an optional native membership filter such as {"Status":["Published"]}. The exact column must exist in the selected document. Free-form SQL, saved UI view IDs and automatic display-value lookups are not supported.

Inspect actual metadata retains the document/table binding, native field IDs, full types, visible schema and original request UUID. Choose fields from that actual metadata. An existing retained discovery can be selected again without another provider read.

Source order uses actual field IDs and ends in id. The UI presents native row identity as the public alias record_id with source $recordId. An encoded reference points to a row in its original table; it is not automatically a display label. Changing document/table/filter inputs clears the old capture selection until the new metadata is inspected.

The host CLI uses the same model:

~~~sh
node "$GRIST_SOURCE/workspace/cli.mjs" discover \
  --directory "$GRIST_WORK" \
  --connections /absolute/private/grist-connections.json \
  --connection public_tasks --document hik1whAV5snj --table ACTUAL_TABLE_ID \
  --request 11111111-1111-4111-8111-111111111111
~~~

Use --filter-file PRIVATE_FILTER.json or --filter JSON for a native membership filter, never both. The above UUID is an example for a fresh request; retain the actual request ID and do not reuse it for another selection.

## Capture and inspect

Choose public aliases, exact native provider types and explicit encodings for selected fields. The source compiler requires valid unique aliases and a complete field/type union. A live capture is a deliberate action, not a consequence of opening the operator.

The provider retains complete typed records twice, native column metadata and document heads before/after, then validates every selected cell. It sends no result limit. A saved capture has a manifest hash, original source selection, row count and exact head {n,h}. countVerified:false and atomicSourceSnapshot:false remain visible: the observed count is the native response length, not an independent transaction count.

A capture selection file for the CLI contains the actual discovery UUID and actual fields:

~~~json
{
  "discoveryId":"11111111-1111-4111-8111-111111111111",
  "connectionAlias":"public_tasks",
  "sourceOrder":[{"field":"id","direction":"asc"}],
  "queries":{
    "catalog":{
      "columns":{
        "record_id":{"source":"$recordId","type":"string","encoding":"identity-text","nullable":false,"empty":"preserve"},
        "title":{"source":"ACTUAL_TEXT_COLUMN_ID","providerType":"Text","type":"string","encoding":"native","nullable":false,"empty":"preserve"}
      }
    }
  }
}
~~~

~~~sh
node "$GRIST_SOURCE/workspace/cli.mjs" capture \
  --directory "$GRIST_WORK" \
  --connections /absolute/private/grist-connections.json \
  --selection /absolute/private/grist-selection.json \
  --title "Original task observation" --expected-revision 0 \
  --request 22222222-2222-4222-8222-222222222222
~~~

Read the current draft revision first for an existing workspace. If another window saved a draft while capture was running, draftSaved:false retains the complete observation without overwriting that newer draft.

Review an observation to see original fields, types, null/missing/empty/structured counts and up to five original samples. Native number tokens remain exact. Grist's typed API has already normalized list representation; the operator does not claim to reconstruct raw database null list cells.

| Public encoding | Explicit meaning |
| --- | --- |
| native | Exact supported string/boolean or losslessly validated native integer/number. |
| number-text | Original JSON numeric token as text. Alternate strings are rejected. |
| identity-text | Exact native row ID as text. |
| epoch-seconds-text | Original Date/DateTime seconds token, with native tuple/type/timezone validation. |
| reference-id-text | Native Ref row ID, including 0. No name lookup. |
| typed-json | Complete supported typed value as JSON text, with recursive special-code validation. |

Unknown, censored, error, pending, skipped, conflicting and unserializable cells fail when selected, including when nested. Raw API responses remain private. Attachment/ref-list encodings retain native IDs; they do not fetch linked rows or attached files.

Nullable accepts an actual retained null. Missing selected fields always fail. Empty-to-null is a separate explicit policy. To preserve empty strings in the original CSV format, use a non-nullable string; nullable string with empty:"preserve" fails the original empty/null ambiguity check.

## Import a retained source or packet

A frozen source has connection.kind capture and an exact manifest path/hash. Importing it performs no provider read:

~~~sh
node "$GRIST_SOURCE/workspace/cli.mjs" import-source \
  --directory "$GRIST_WORK" --source /absolute/private/original/source.json \
  --title "Retained task source" --expected-revision 0 \
  --request 33333333-3333-4333-8333-333333333333
~~~

For portable input:

~~~sh
node "$GRIST_SOURCE/workspace/cli.mjs" packet \
  --source /absolute/private/original/source.json \
  --out /absolute/private/original-grist-source.json

node "$GRIST_SOURCE/workspace/cli.mjs" import \
  --directory "$GRIST_WORK" --packet /absolute/private/original-grist-source.json \
  --title "Retained task source" --expected-revision 0 \
  --request 44444444-4444-4444-8444-444444444444
~~~

The browser accepts this complete private source packet. It cannot name arbitrary host files. MCP imports only predeclared source/packet aliases after exact file hash review.

The provider packet reader validates every raw member, original metadata, repeated response, document head and selection. The authoring facade adds the query/projection and safe origin/version identities. All captured original fields remain private in the packet, even if the published column subset omits them. Treat it as operator recovery material.

## Save, validate and freeze

The draft is {captureId,title,queries}. The original capture field/type union, document, table, filter and source order remain immutable. You can change public aliases, valid encodings and null/empty policy, or distribute that same field union across queries. The original publisher later chooses the narrower public column subset.

1. Select the retained observation or a saved version's draft.
2. Edit the controls and Save draft using the editor's original expected revision.
3. Validate every row. The model checks the entire capture for every query; the browser shows up to 25 preview rows.
4. Read the exact capture time/hash, native head and source/emitted row count, plus every alias/type/encoding/null rule.
5. Enter a reviewer and change note and Freeze and select source version.

Authoring adds no further row filter. Preview order is the first configured public column ascending and is recorded explicitly. The final extraction order is selected and pinned in the publisher plan.

CLI equivalents:

~~~sh
node "$GRIST_SOURCE/workspace/cli.mjs" draft \
  --directory "$GRIST_WORK" --draft PRIVATE_DRAFT.json \
  --expected-revision CURRENT_REVISION --request DRAFT_UUID

node "$GRIST_SOURCE/workspace/cli.mjs" preview \
  --directory "$GRIST_WORK" --draft-revision CURRENT_REVISION \
  --request PREVIEW_UUID

node "$GRIST_SOURCE/workspace/cli.mjs" save \
  --directory "$GRIST_WORK" --draft-revision CURRENT_REVISION \
  --preview PREVIEW_UUID --reviewer "Operator name" \
  --note "Reviewed exact source and public column rules" \
  --expected-selected-version null --request VERSION_UUID
~~~

Replace uppercase placeholders with actual retained values. expected-selected-version is null only before the first selection; use the current numeric version afterward.

Saved versions have a numeric ID, original request UUID, immutable source file/hash, capture hash, reviewer, note, exact draft and preview. Selecting another version never rewrites an old publisher plan. Compare two saved versions through the browser or compare --left N --right N.

Use export --version N --out NEW_PRIVATE_PACKET to deliver the complete operator packet for a saved source version. export-capture --capture UUID exports the original observation's packet. Existing output paths are create-only; choose a new destination or retain the original packet.

## Original publisher and customer delivery

Open original publisher in the browser, or:

~~~sh
node "$GRIST_SOURCE/workspace/cli.mjs" publisher \
  --directory "$GRIST_WORK" --version CURRENT_VERSION --request PUBLISHER_UUID
~~~

The workspace opens the same publisherDirectory, sourceFile and targetDirectory retained in immutable settings. Browser and MCP borrow that original publisher. Opening it may resume its already enabled original scheduler policies; status reads alone do not start a scheduler.

Use the original publisher to save an actual numeric plan, choose the final public columns and extraction order, run extraction, inspect the complete candidate, record review, and publish. Plan storage folders have separate UUIDs. Original plans retain their own exact source declaration and capture.

Grist's source extractor emits all selected native rows, sorts according to the original publication extraction options, places nulls last in either direction, and uses retained ordinal tie-breaking. It reuses the original CSV encoder and dataset validator. Public output includes only the configured columns; private raw fields are not placed into the public dataset.

The publisher's original buyer handoff binds a published version. A later publication or source edit does not mutate that pinned handoff.

## Original SF82 release operation

The deployment panel reads original published runs and maps them to saved source versions. Its complete actions are:

- Review one exact published run and source version with public seller terms.
- Prepare the reviewed five-file package.
- Inspect/download that package as private merchant staging.
- Stage an original release ID against the prepared source hash.
- Open the original console, compare releases, activate, start/restart/stop, pin or roll back.
- Export customer client/configuration files through the original release exporter.

The staging files are dataset.csv, dataset.json, seller.json, source.json and binding.json. binding.json retains the original absolute dataset path. The package is private merchant staging; it is not a redacted public customer bundle. Use the original client/release exporter for customer delivery.

Deployment calls retain the original authoring request UUID plus the package/review/source/release identity. Commands additionally bind the current console instance, generation, release digest and owned seller instance where required. A lost command response is reconciled by observing original state; it is not blindly dispatched again.

deployment-status uses the original read-only release/store path. Opening the console initializes only a positively absent release root through the original initializer. Partial or invalid existing stores remain for original recovery, rather than being replaced.

CLI actions include deployment-status, deployment-review, deployment-prepare, deployment-stage, deployment-package, deployment-file, deployment-console and deployment-compare. Input JSON uses the same model interfaces as the panel. grist-deployment --help exposes the direct original publisher→release path for a closed authoring workspace.

Closing the console drains the seller it owns. A historical console URL or open receipt is not evidence that the corresponding process is still running.

## Request and browser recovery

Every mutation uses one retained UUID and exact input. Save it before dispatch. The browser retains its pending request in session storage and keeps recovery visible until it has read the original receipt and refreshed current state.

~~~sh
node "$GRIST_SOURCE/workspace/cli.mjs" operation \
  --directory "$GRIST_WORK" --request ORIGINAL_UUID

node "$GRIST_SOURCE/workspace/cli.mjs" resume \
  --directory "$GRIST_WORK" --request ORIGINAL_UUID
~~~

Receipt replay does not create another source version, candidate or publication. A lost import input or discovery response that was positively never retained closes with a specific original error; the operator may then choose a fresh explicit request. Transient unresolved I/O remains pending and is not treated as success.

Capture Resume advances its original provider step journal with the same selection and credential binding. Opening or refreshing the workspace does not do so. Source/head/schema/record changes preserve the old failed observation and require a new deliberate capture. Honor actual provider rate limits.

Version/edit navigation has a view generation guard. A late response from an older selection cannot replace a newer draft. Refreshing saved status does not silently update a dirty editor's original revision; its save still uses the original CAS and cannot overwrite another window's newer draft.

Stop blocks new work, closes HTTP admission, aborts/drains the current source request, waits for borrowed publisher and deployment actions, closes retained file scopes and original services, then releases the workspace. Completed open receipts retain their historical URL; use current ownership/status for a live URL after reopen.

## Merchant MCP

The source-owned contribution registers grist-workspaces and the gristWorkspaceConnection configuration field. The private merchant file refers to a separate host workspace configuration file:

~~~json
{"gristWorkspaceConnection":"/absolute/private/grist-workspaces.json"}
~~~

The referenced private file has the following exact shape:

~~~json
{
  "schema":"stellar-forge.grist-authoring-connection.v1",
  "workspaces":{
    "tasks":{
      "label":"Original task catalog",
      "directory":"/absolute/private/grist/catalog",
      "connections":"/absolute/private/grist-connections.json",
      "inputs":{
        "original":{"kind":"source","file":"/absolute/private/original-grist/source.json","label":"Original frozen capture"},
        "portable":{"kind":"packet","file":"/absolute/private/original-grist-source.json","label":"Complete private operator packet"}
      }
    }
  }
}
~~~

connections and inputs are optional for a retained workspace. Each input kind is source or packet. Relative host paths resolve from this private configuration file; runtime tools accept only the declared aliases. Optional seller and resource must be supplied together as original public URLs. Each workspace must be initialized and have one canonical private source database. No client-supplied arbitrary host path or credential is accepted.

Use the installed original merchant MCP server. merchant_grist_workspaces lists the declared aliases; merchant_grist_open opens one original model and returns its same browser URL. The merchant_grist_* tools provide actual metadata/capture/import, columns, draft/preview/version, comparison/selection, original request recovery, publisher delegation, deployment, and chunked private packet/staging receiving.

The original generic MerchantPublishers dependency supplies callBorrowed. Grist does not register a separate publisher store in its generic factory. merchant_grist_publisher_* tools invoke the same authoring-owned native publisher and scheduler as the browser. Closing MCP drains pending borrowed operations before the owner closes.

Private packet read tools bind the current host workspace, capture/version/package identity, whole file size/hash and chunk offsets. A read can be resumed from retained whole-file identity and offset after process restart using a new original read ID. Validate the final whole bytes; do not treat a partial download as a complete packet.

A second separately launched CLI or Application must wait for the first original owner to close. MCP and its returned browser are one lifetime.

## Managed Applications

Select grist-authoring from the installed original Applications catalog. Point it to the initialized original workspace and optional connections file. Review, save and Start through the maintained Applications workflow.

Preparation verifies the workspace directory and SQLite inode, immutable settings, exact 14 workspace source files and connection-file hash. Startup rechecks the selected and executed source, original workspace identity and retained settings before announcing GRIST_AUTHORING_READY. Its loopback URL comes from the original native startup record.

Open uses that verified current URL. Stop closes admission, drains original operations/services and waits for the exact child. The saved connection, workspace and source remain available for a subsequent reviewed Start and console reopen. Applications does not copy or reset the Grist store.

## Direct model interfaces

~~~js
const workspace = await openGristAuthoring({
  directory, create: false, connections, environment
});
await workspace.status();
await workspace.importSource({
  sourceFile, title, expectedDraftRevision, requestId
});
await workspace.inspectCapture(captureId);
await workspace.saveDraft({ draft, expectedRevision, requestId });
await workspace.preview({ draftRevision, requestId });
await workspace.saveVersion({
  draftRevision, previewId, reviewer, note,
  expectedSelectedVersion, requestId
});
await workspace.openPublisher({ expectedSelectedVersion, requestId });
await workspace.close();
~~~

The original model also exposes listDocument/documentCatalog/exportDocument, discovery/readLive/captureAttempt, full packet export/import, withOpenPublisher, deployment review/prepare/stage/status/commands and request recovery. serveGristAuthoring({workspace,port:0}) returns origin, token, url, workspace and close. The HTTP header is x-grist-workspace-token. service.close owns workspace.close; close is idempotent and waits for the same original closing promise.

This guide documents implemented source. Report a particular provider capture, installed source selection, application start or buyer delivery only from the corresponding actual native receipt. Keep the same original operation through interruption and reopen.

## Complete installed receiving

The [receiving guide](RECEIVING.md) supplies the full **grist-receive --prepare/--input** workflow. It consumes one real capture-backed table declaration and the actual installed manifest; reviews and reopens the original browser source; publishes two exact row orders; operates the same SF82 seller and customer exporter; then reopens Applications and source-owned MCP before retaining the complete closed private archive. The selected **grist-merchant** recipe includes all four receiving programs through this source contribution.

The native operation compares every projected value and preserves original request, plan, source-version and release identities. It makes zero provider reads and zero payments. Original provider acquisition remains a preceding, separately observed stage of that same assigned work. For two named customer tables, configure two independent workspaces/outputs and receive each sequentially; no joins or cross-table snapshot claim is added.
