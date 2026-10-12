# Operate the live CIIM receiving desk

The connected client gives a running CIIM desk a scriptable operator interface. It uses the server's original private connection file and the same model transaction that serves the browser. Review decisions, accepted editions, comparisons, handbacks and history therefore appear in the same workspace.

The existing local CLI can initialize a desk or run it directly. Once its server is running, select the connected commands for terminal and application automation. The connection file is written by that original server; the client verifies its complete marker and live startup before each operation.

## Start the original server and select its connection

Start the maintained server, either through Applications or the direct command:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/cli.mjs \
  serve --workspace /absolute/receiving-desk --python /absolute/python3
~~~

Use the actual private connectionFile from its startup result. Direct startup writes /absolute/receiving-desk/desk-connection.json. Applications supplies the same field for its selected managed desk.

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/cli.mjs \
  connected connection --connection /absolute/receiving-desk/desk-connection.json

node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/cli.mjs \
  connected status --connection /absolute/receiving-desk/desk-connection.json
~~~

The connection response contains the original workspace ID, marker SHA256, listener origin, process ID and request-journal path. Its private session token stays in the connection file and HTTP header. A restarted server is resolved through that same file. The client verifies the current server against the actual original marker before using its current session.

Optional --expected-workspace-id and --expected-marker-sha256 pin a selected desk. Every relative location in these examples should be replaced with the actual absolute input, output or executable path on the receiving host.

## Read the complete population

Use list for the original paginated views: imports, editions, records, profiles, comparison, history and handbacks. The response retains total, offset, limit, revision and, where applicable, the original populationDigest. Continue from offset + returned item count until the complete selection has been read. Pages support up to 250 items.

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/cli.mjs \
  connected list --connection /absolute/receiving-desk/desk-connection.json \
  --view records --edition ORIGINAL_EDITION_ID --offset 0 --limit 250

node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/cli.mjs \
  connected record --connection /absolute/receiving-desk/desk-connection.json \
  --edition ORIGINAL_EDITION_ID --record ORIGINAL_RECORD_ID
~~~

record returns the entire original mapped object, repeated values, original issues, profile hashes and original request/page pointers. Original withdrawal, restoration, absent values and null values keep their native meanings. The original source attachment remains available for detailed review.

Use the complete machine-readable catalogue to form a request or integrate another local operator:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/cli.mjs \
  connected operations
~~~

The catalogue preserves the original action schemas. Its streamed export and attachment operations add the required out destination.

## Receive an original native case or saved desk

Import streams the complete original ZIP to the live server, including its filename, byte count and SHA256. The client hashes the original file before transferring it, reads through the same file handle, and checks that the file did not change. The server returns its retained immutable candidate ID and exact available editions.

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/cli.mjs \
  connected import --connection /absolute/receiving-desk/desk-connection.json \
  --file /absolute/CIIM-Proteus-native-receiving-case.zip \
  --sha256 26f5cc490aef1e2b292a55e04ba2372d3ca4e2703f8b32bc2d5b52a89c81a91c \
  --bytes 15587672
~~~

That exact original case contains the three accepted native editions: DataCite 231 active records, OpenAlex 168 active plus one withdrawal, and OpenAlex 169 active after restoration. The connected receiving operation uses their existing original results. The original CLI, browser and Applications worked receiving programs are under examples/.

A repeated import of identical bytes returns the original retained candidate, including the filename first recorded for it. Select the candidate's actual native editions with intake.import. A complete workspace or handback package is received with workspace.restore into a fresh revision-zero desk.

## Record named receiving decisions

Write requests contain the original operationId, expectedRevision, actor, type and data. Use status to read the exact current revision and operations to read the chosen action's complete schema.

The following is a request-format example; supply the actual operation ID, reviewer, current revision and receiving context before using it:

~~~json
{
  "operationId": "ORIGINAL_RECORDED_REQUEST_ID",
  "expectedRevision": 0,
  "actor": "Named receiving reviewer",
  "type": "context.save",
  "data": {
    "label": "Institutional metadata receiving",
    "note": "Recorded reason for the receiving context"
  }
}
~~~

Keep that complete request in its original JSON file and send it:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/cli.mjs \
  connected act --connection /absolute/receiving-desk/desk-connection.json \
  --request /absolute/original-review-request.json
~~~

All original writes are available:

| Original action | Receiving purpose |
| --- | --- |
| context.save | Record the institution, receiving environment, selected processing profile and named authorities. |
| intake.import | Receive selected exact native editions from a retained candidate. |
| workspace.restore | Receive the complete original logical workspace, IDs and history into a fresh desk. |
| edition.review | Record the named whole-edition receiving decision. |
| profile.review | Accept, request changes to, or reopen an exact native profile hash. |
| records.review | Review selected original record IDs or the complete original population digest. |
| comparison.create | Retain a comparison of two explicitly selected original editions. |
| comparison.review | Record the named decision on that retained comparison. |
| handback.create | Freeze a named complete receiving handback at its original context and review revision. |

Each decision uses the original model's named authority and reason requirements. A changed workspace revision is returned as an explicit conflict. Read its current state and assess the actual changed work before preparing a new decision; the client does not silently change the requested revision.

The call command also accepts an original typed operation envelope, for example {"name":"desk.state","arguments":{}}. For writes, arguments is the complete original action request and name equals its type.

## Recover a lost response

Before sending a write, the connected client stores its original wire body, identity, exact operation ID and original workspace binding in a private journal. It records each actual attempt and the original response. By default the journal is the desk's connected-client/ directory; --requests selects another original private journal.

A write with an uncertain response remains pending. The pending command reads the original local journal even while the listener is stopped. Once the same original server is running, recover resends that request:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/cli.mjs \
  connected pending --connection /absolute/receiving-desk/desk-connection.json

node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/cli.mjs \
  connected recover --connection /absolute/receiving-desk/desk-connection.json
~~~

Recovery resends the exact stored body and original ID. The original model checks its saved operation before current revision, so an already committed operation returns its original result with replayed:true. The journal prevents a different request from replacing an unresolved one. Authentication or managed-listener rejection cannot settle an earlier lost response, so the original request remains available.

Successful workspace.restore changes the fresh destination's logical workspace ID to the received original identity. The connected journal retains the fresh physical destination and original restore request through this transition, reconciles the server's new marker, and then binds subsequent work to the received desk. A managed server whose marker was already selected in Applications rejects a restore that would change that selection. Receive the original saved workspace before making a new managed selection.

The journal is local request custody, kept separately from the portable review history in the model. Preserve it with the original host during an unresolved operation. After a complete response, the original model operation and its receiving history are included in the next workspace export.

## Stream complete files

Choose an absolute destination for every export or attachment:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/cli.mjs \
  connected export --connection /absolute/receiving-desk/desk-connection.json \
  --kind workspace --out /absolute/complete-receiving-workspace.zip

node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/cli.mjs \
  connected export --connection /absolute/receiving-desk/desk-connection.json \
  --kind handback --handback ORIGINAL_HANDBACK_ID --out /absolute/reviewed-handback.zip

node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/cli.mjs \
  connected attachment --connection /absolute/receiving-desk/desk-connection.json \
  --edition ORIGINAL_EDITION_ID --kind xml --id ORIGINAL_REQUEST_ID \
  --out /absolute/original-page.xml
~~~

The client verifies the original Content-Length and X-Content-SHA256 while streaming to an exclusive private file, then publishes the completed destination. An existing destination is reused only if all its bytes match. A different existing output is preserved and the command requests a new filename.

Attachments support xml, native, mapped, profile, manifest, operation and source. Page attachments use the original request ID; a profile uses its exact SHA256. Workspace exports retain complete original source archives and review history. A historical handback retains its original frozen review decisions even when later reviews change. Its selected review scope and the full coverage of retained input archives are both inventoried.

Use connected guide --out ABS to save the exact original operator guide served by the live desk. An optional --sha256 pins its expected source bytes.

The current native import limit is 512 MiB. Individual native attachments support 256 MiB, write JSON 16 MiB, complete JSON responses 64 MiB and streamed downloads 2 GiB. Transfers retain complete bytes within those declared limits.

## Use the JavaScript client

~~~js
import {openConnectedCiimDesk} from './connected-client.mjs';

const client = await openConnectedCiimDesk({
  connectionFile: '/absolute/receiving-desk/desk-connection.json'
});
try {
  const state = await client.state();
  const editions = await client.view({view: 'editions', offset: 0, limit: 250});
  // Form a named request from the current state and original selected identities.
  // await client.act(originalRequest);
  // await client.exportWorkspace({out: '/absolute/complete-workspace.zip'});
} finally {
  await client.close();
}
~~~

Client close stops new client work and waits for its accepted operations and streams to finish. The original receiving server continues running. The browser, connected operator and managed application all use that same retained desk and its original revision checks.

## Continue the completed original receiving case

The complete [connected receiving programme](examples/connected_20261012.mjs) joins the original worked case after its native receiving checkpoint has been saved. It opens that same desk, reads all 569 retained records through the connected API, streams the original case and XML, records one receiving note, and demonstrates recovery of the unchanged original request after a deliberately interrupted accepted response. It inspects that request through the terminal while the listener is stopped, then reopens the original listener and recovers the same operation ID.

The programme also replays the two original revision-zero restore requests in the already received historical and later workspaces. Those receiving decisions remain at their original revisions. It downloads the original immutable handback and a complete current workspace, preserving the named processing profile, authorities, receiving environment and original populations.

Run it on the same retained root used by the native receiving programme, with the direct browser/Applications server closed:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/examples/connected_20261012.mjs \
  --root ABS_ORIGINAL_RECEIVING_ROOT \
  --python ABS_EXISTING_PYTHON
~~~

The result and original requests are retained under connected-receiving/. Its files/ directory contains the complete current workspace, immutable first handback, original XML and served guide. A later invocation continues saved phases and exact original request bodies. The native-result.json reference is advanced to this complete current workspace so the following browser and Applications continuation opens the same edited desk.

Keep the entire connected-receiving/ directory with the worked case. If an equipped receiving carrier relocates the complete case, the continuation retains the earlier physical request journal and opens a new journal bound to the actual restored directory. Its original request body and operation ID still replay against the same retained logical workspace.
