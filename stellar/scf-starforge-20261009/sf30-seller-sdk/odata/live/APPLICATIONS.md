# OData in Applications

The OData card opens the original source workspace. Operators can connect a
service, inspect its declared schema, save and review a typed query, retain source
editions, prepare a live merchant, create the original buyer handoff, and receive
saved responses in that same workspace. An optional saved live service starts
with the workspace; managed Stop closes its merchant and operations listeners.
Reopening uses the original package and private runtime directory, including its
continuation key, operations history and delivery outbox. A private subscription
connection can reopen its configured publishers, customer receiving work and
retained deliveries from the same saved application.

## Original controller registration

`applications.mjs` in this directory exports:

| Hook | Native contract |
| --- | --- |
| `odataApplication(common)` | One `odata` catalog entry, original `dataset` command, shared port and private environment fields. |
| `prepareODataApplication(settings, context)` | Context supplies the existing `inputPath`, `runtimeDirectory`, and may include `selectedExecutable`, `root`, `runtimeId`. Returns `args`, `inputs`, `createDirectories`, and `identity`. |
| `odataStartup(request, operationDirectory, text, context)` | Async startup reader; the existing managed child context supplies `pid`. Returns `{url, original, links}` for the original Applications output record. |

The maintained source-owned registration is
`distribution/runtime-workspace/providers/odata.mjs`. It delegates catalog,
preparation and the four-argument startup reader to these original hooks through
`application-provider.mjs`. Its contribution remains the existing OData provider.
The shared controller supplies input review, the selected runtime, common port
and environment handling, the managed child and saved operation records.

The provider accepts the original structured startup line beginning with
`{"schema":"stellar-forge.odata-workspace-startup.v1",`, queues its async reader,
and saves `url`, `original` and `links` in the existing
`stellar-forge.application-url.v1` record. The original managed command passes
`{pid: child.pid}`. Adding the subscription setting requires the following
native helper/CLI/server source in the selected runtime; it needs no second
provider or controller.

## Original OData CLI and server joins

The original `odata/cli.mjs` serve branch uses these helpers from
`./live/startup.mjs`:

```js
const launch = await prepareODataLaunch({
  workspace,
  expectedIdentity: o['expected-workspace-identity'],
  liveId: o['live-service'],
  expectedLive: o['expected-live-identity'],
  subscriptionConnection: o.subscriptions ? resolve(o.subscriptions) : undefined,
  expectedSubscriptionsSha256: o['expected-subscriptions-sha256'],
});
const server = await startODataServer({
  workspace,
  port: o.port === undefined ? 8797 : Number(o.port),
  liveServiceId: o['live-service'],
  subscriptionConnection: launch.subscriptions?.path,
  expectedSubscriptionsSha256: launch.subscriptions?.sha256,
});
console.log(JSON.stringify(await announceODataWorkspace({
  workspace, server, launch, liveRuntime: server.liveRuntime ?? null,
})));
```

After its own loopback listener is ready, `startODataServer` starts the optional
live service through the same `getLive()` manager used by `/api/live/start` and
returns its `liveRuntime`. A subscription connection is read once by the original
configuration reader; the server opens its operator from that exact configuration
and exposes its small `subscriptionIdentity`. The CLI passes the digest from
preparation so a changed configuration cannot silently replace the selected one.

If the listener fails before a service is returned, the server closes its selected
subscription operator. Borrowed live operations and the caller's workspace remain
with their caller. On a later startup error, the CLI closes the opened service.
The server's existing
`close()` stops accepting HTTP operations, drains the owned live manager and
subscription operator, then closes the owned workspace. The same managed Stop
therefore covers authoring, optional merchant listeners and subscription work.

Under the existing Host/Origin checks, GET `/api/application` returns
`await odataWorkspaceProbe(workspace, {subscriptions: subscriptionIdentity})`,
imported from `./live/startup.mjs`. This small response contains the original
workspace creation identity, running process identity and exact loaded
subscription connection identity (or null). The Applications reader calls this actual listener
once; it does not download the complete catalog or retained row state.

## Operator selection and receiving

Applications settings are `workspaceDirectory`, optional `liveServiceId`, optional
`subscriptionConnection`, and the original common `port`/`environmentFile`. A new private workspace may be
created in an existing private parent. To start a saved service automatically,
use its existing service ID; its source package must already be prepared in
that workspace. The source operator retains all other authoring, start/stop,
buyer and response receiving controls in its original browser UI.

The emitted command is:

```sh
starforge dataset odata --workspace /private/odata serve \
  --expected-workspace-identity WORKSPACE_IDENTITY_SHA256 \
  --live-service orders --expected-live-identity LIVE_IDENTITY_SHA256 \
  --subscriptions /private/subscriptions.json \
  --expected-subscriptions-sha256 CONNECTION_FILE_SHA256 --port 0
```

An application with no selected live service opens authoring immediately. A
selected service adds original merchant documentation and operations links to
the Applications view. New live services started from the workspace remain
available through the original OData UI.

### Reopen configured subscriptions

Prepare the original private connection described in
[SUBSCRIPTIONS.md](subscriptions/SUBSCRIPTIONS.md). In Applications, choose the
OData card and set **Private subscription connection** to that file's absolute
path. The existing Review shows the selected connection file, its raw-byte digest
and the configured original directories. Save and Start the application, then use
**Open subscriptions**. The source console also retains its Subscriptions link.

The connection names publishers, customers, complete collection sources,
receiving inputs and the separate export directory. Collection and input
manifests retain their declared SHA256 values. New publisher, customer and export
directories may be absent when their private parent exists; the original native
operation creates a selected destination when it is first used. Review does not
create those destinations or replace existing state.

A launch binds the same absolute connection path, schema, byte count and SHA256
in its argv, private `application-launch.json`, running server and actual listener
probe. Its configured private paths are also captured by the original Applications
input review. Launch checks the expected digest again when loading the operator
and announcing the service. A changed connection requires a new Review before
Start. Routine publisher editions, customer receipts and retained exports can
advance within the selected connection.

Stop the saved application, then review and start that same saved entry to reopen
its selected directories. Native request IDs, edition identities and receiving
history remain in the original publisher/customer stores. Use their **Publisher
backup** and **Customer backup** controls for complete subscription transfer;
the OData workspace download retains its own source/capture/live workspace.
A receiving operator restores those separate native backups, writes the
connection with its actual receiving paths and reviews that connection in its
own Applications entry. Editing a path in the connection changes its digest.

Saved-query authoring calls `templateFromWorkspace(workspace, {planId, ...})`
before applying the operator's price, path and port settings. Its declared
output columns, filter/order allowlists, exact saved filters, source metadata
and original `authEnv` reference survive `prepareFromWorkspace` and package
readback. The original `prepareBuyerHandoff` writes the same body hash and
response path used by SF88; `receivePage` imports the saved response and retains
the original next request.

For an atomic buyer-directory publication, call
`prepareBuyerHandoff(prepared, {directory: stage, requestDirectory: final, ...})`,
sync the stage, and rename it to the final directory. The original buyer draft
pins `final/request.json` and `final/response.json` while its exact files are
written to the stage. The returned handoff also retains `final` as its request
directory. Omitting `requestDirectory` keeps the ordinary direct-directory API.

## Retained identity

Ordinary workspace edits and received pages update `workspace.json`. The
Applications binding uses its original schema, creation time and private
directory, allowing those edits to continue. A selected live product additionally
pins its immutable profile, complete package, source binding and original
private runtime path. Launch emits one structured line and writes the same
record privately as `application-launch.json`. The startup reader joins that
record with the actual managed child or its direct CLI child, Linux process
start identity, selected local port, and original listener response.

Use the existing `dataset` distribution command and whole SF30 component. The
following installed edition must include this helper, `live/subscriptions/managed.mjs`,
the original CLI/server joins and the existing source-owned OData provider together.


## Run the installed receiving workflow

`managed-receiving.mjs` operates the existing installed Applications model and
the original OData operator API. It selects a prepared source workspace and
complete original response sequence, attaches an existing READY runtime, opens
its managed live service, receives the saved pages and prepares original buyer
continuations, stops all three listeners, and reopens the same workspace and
private continuation identity. It leaves the retained application, original
responses and result in the chosen output directory.

The input is a private JSON file:

```json
{
  "schema": "stellar-forge.odata-managed-receiving-input.v1",
  "runtimeDirectory": "/private/original-installed-runtime",
  "workspaceDirectory": "/private/original-odata-workspace",
  "liveServiceId": "orders",
  "responseFiles": [
    "/private/original-responses/page-1.json",
    "/private/original-responses/page-2.json"
  ],
  "outputDirectory": "/private/new-odata-receiving-run"
}
```

Optional `environmentFile` selects the original private Applications environment
file. `responseFiles` contains the complete ordered native live response
envelopes for the selected product and saved query, including its terminal page.
The input points to existing source and response files; the runner retains exact
copies before opening the application.

```sh
node managed-receiving.mjs --input /private/odata-managed-receiving.json
```

Use the existing Node 24 executable and the following installed edition that
contains the original BD9D controller, E9B2 registrations and these helpers.
The runner uses the original runtime attachment and managed adoption APIs.
The completed output includes both application operation IDs, retained source
and cursor-key hashes, native receiving records, original buyer handoffs, and
the reopened response inventory. The actual private workspace and source
package remain available for subsequent operator use.

## Receive a completed subscription connection through Applications

The maintained [managed subscription receiving programme](subscriptions/MANAGED_RECEIVING.md)
consumes an actual completed connection and READY runtime. It prepares a
reviewable input from native edition identities, saves the original OData card,
opens every configured publisher/customer, downloads complete native backups,
restores independent copies, stops the managed service and reopens the same entry.
Both managed operations and their exact native exports remain resumable.

Use the original **odata-subscriptions managed-review** and **managed-receive**
commands. The programme preserves the existing response-page receiving workflow
above and has its own private output and selected input.
