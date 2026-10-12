# Receive a complete Open311 operating workspace

A complete handoff has two independent pieces: the selected merchant source package that runs the application, and the original Open311 workspace bundle that carries the municipal observations and internal work. Keep each original file, its byte length and its SHA-256 with the handoff.

The [operating guide](OPERATING.md) covers source installation and everyday work. The complete [merchant file contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/open311/MCP.md) covers resumable reads and host-selected input aliases.

## Choose the deliverable

| File | Contents | How the receiver uses it |
| --- | --- | --- |
| source | Exact response bytes from one stored civic capture | Opens the original provider JSON or retains it as a source edition |
| json | Selected capture, normalized requests and their internal reviews | Uses a complete selected case edition |
| csv | Tabular request fields and internal review information | Imports the selected case report |
| report | Printable HTML with source and review context | Opens in a browser and prints |
| workspace | All source connections, captures, response bytes, reviews, operation intents and results | Receives into an empty Open311 desk and continues the complete operating history |

A source file belongs to one immutable capture ID. A complete workspace file belongs to the retained state at export. JSON, CSV and report files include the current internal reviews at export. Save each deliverable under a new private filename.

## Export from the browser or command line

In the browser, select the saved capture and choose the required source, JSON, CSV or report download. Use the complete workspace export for a continuing handoff.

The equivalent CLI commands are:

~~~sh
npx --no-install starforge open311 export \
  --workspace /absolute/private/open311-desk \
  --kind source \
  --capture CAPTURE_ID \
  --out /absolute/private/handoff/requests.original.json

npx --no-install starforge open311 export \
  --workspace /absolute/private/open311-desk \
  --kind report \
  --capture CAPTURE_ID \
  --out /absolute/private/handoff/requests.report.html

npx --no-install starforge open311 export \
  --workspace /absolute/private/open311-desk \
  --kind workspace \
  --out /absolute/private/handoff/municipal-workspace.json

sha256sum /absolute/private/handoff/requests.original.json
sha256sum /absolute/private/handoff/requests.report.html
sha256sum /absolute/private/handoff/municipal-workspace.json
~~~

Create the private handoff directory before writing. The CLI returns complete original bytes for source and the whole JSON bundle for workspace. It creates output files exclusively with mode 0600. Workspace exports stay byte-identical while their retained contents remain unchanged.

Keep the package archive, its original manifest, the workspace bundle and the source/report files selected for the recipient. The source edition's publisher and license remain attached to its connection and report.

## Download through the merchant

Use the existing connected MCP transport with the typed client. This reads the entire source file, verifies its final length and SHA-256, and then saves it:

~~~js
import { writeFile } from 'node:fs/promises';
import { Open311MerchantClient } from
  '@tokenjunkielabs/starforge-merchant/merchant/open311/client';

const desk = new Open311MerchantClient(
  (name, args) => transport.callTool({ name, arguments: args }),
  'desk',
);
const original = await desk.downloadFile(
  { kind: 'source', capture: 'CAPTURE_ID' },
  { limit: 65536 },
);
await writeFile('/absolute/private/handoff/requests.original.json',
  original.bytes, { flag: 'wx', mode: 0o600 });
console.log(original.file);

const current = await desk.status();
const bundle = await desk.downloadFile({
  kind: 'workspace',
  expectedRevision: current.revision,
});
await writeFile('/absolute/private/handoff/municipal-workspace.json',
  bundle.bytes, { flag: 'wx', mode: 0o600 });
console.log(bundle.file);
~~~

The first argument selects the complete file. The second controls chunks and optional streaming. downloadFile returns file metadata, bytesRead and the complete Buffer as bytes. For a larger file, an onChunk callback can write each original chunk to the caller's selected destination.

For an interrupted manual read, keep the complete file selection, expectedSha256, last completed offset and readId. Continue from that offset with the same selection. After the retained reader expires or the merchant process restarts, omit readId and reopen the same selected file with expectedSha256 and offset. The existing reader checks the current bytes before continuing. A changed selection requires obtaining and delivering the intended new edition as a separate file.

## Receive on a second operating host

Install the selected merchant source package as described in OPERATING.md. Copy the complete workspace bundle through the recipient's established file transfer route and compare its delivered SHA-256 with the original handoff.

Create an empty private destination and inspect its revision:

~~~sh
npx --no-install starforge open311 state \
  --workspace /absolute/private/open311-received
~~~

The new desk is at revision 0. Receive the full bundle:

~~~sh
npx --no-install starforge open311 receive \
  --workspace /absolute/private/open311-received \
  --file /absolute/private/handoff/municipal-workspace.json \
  --request-id municipal-receive-01 \
  --expected-revision 0
~~~

Receiving verifies the complete workspace payload and original capture digests, restores the original workspace identity, then records the receiving operation. Its resulting revision advances from the source bundle's revision. All original captures, connections, review history and saved operation outcomes remain available.

Open the received desk:

~~~sh
npx --no-install starforge open311 serve \
  --workspace /absolute/private/open311-received \
  --port 0
~~~

The startup JSON identifies the received workspace and actual loopback URL. In the browser, open a received capture, inspect a source case and its review, download the original source, then close and reopen the application. Existing Applications installations can select this initialized receiving directory and use the normal Review/Save and Start/Open controls.

For a new source refresh after receiving, select the actual current date interval and keep the source's documented limits and extensions. The old fixed captures remain available for original reports and comparison.

## Receive through a merchant alias

Create the receiving desk with the CLI state command. In its private host connection file, select that directory and bind the actual bundle path and delivered SHA-256 under an input alias:

~~~json
{
  "label": "Received municipal workspace",
  "directory": "/absolute/private/open311-received",
  "connectionProfiles": {},
  "inputs": {
    "municipal-handoff": {
      "label": "Complete municipal source and review history",
      "path": "/absolute/private/handoff/municipal-workspace.json",
      "sha256": "DELIVERED_SHA256"
    }
  }
}
~~~

This object is the receiving alias under workspaces in the original host file. Reload the merchant host configuration after saving the file with mode 0600. The tool selects the alias; the complete private file path remains host configuration.

Use the typed receiver:

~~~js
const receiver = new Open311MerchantClient(
  (name, args) => transport.callTool({ name, arguments: args }),
  'received',
);
const source = await receiver.input('municipal-handoff');
const empty = await receiver.status();
const result = await receiver.receive({
  input: 'municipal-handoff',
  expectedSha256: source.sha256,
  requestId: 'municipal-receive-01',
  expectedRevision: empty.revision,
});
console.log(result);
~~~

Open the same receiving directory through its browser or Applications entry. A concurrent browser observes the received identity through the live startup endpoint.

## Recover a response lost during receiving

Keep the receiving operation's original request ID, revision and bundle. Read the operation by its request ID first. A saved success returns its original result. When repeating the same receiving action, use the exact original inputs and revision; an unrelated operation uses a new request ID and the current workspace revision.

The complete source, reviews and original response bytes are checked before the new receiving state commits. Choose a fresh empty destination for a separate handoff.

## Commission the delivered installation

Run the original open311/commission.mjs from the installed package with a real provider connection and fixed source interval, or its retained-source manifest containing exact original provider bytes. The operating guide gives the complete invocation.

The single journey captures the catalog and cases, assigns internal review, compares observations, downloads original and reviewed files through the browser/API and merchant retained reader, receives the complete bundle, closes both workspaces and reopens the recipient. Its output includes the actual journey result and original source/export files for that delivery.
