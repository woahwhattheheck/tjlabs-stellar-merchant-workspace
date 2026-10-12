# Operate a gRPC merchant

This product uses one original private gRPC workspace. The native browser,
merchant agent, persistent operator Console, release console and clients keep the same contract revisions,
preparations, operation UUIDs, attempts, upgrade reviews and health observations.

## 1. Select the installed source and private state

Install the `grpc-merchant` selection with its original native, grpc, schema,
openapi, mcp and operator features. Follow the [installed guide](../../stellar/scf-starforge-20261009/distribution/selections/GRPC_MERCHANT.md).

Initialize a product in an existing private parent:

~~~sh
starforge grpc-product init --dir /srv/private/payments-grpc \
  --workspace /srv/private/existing-grpc-state --alias payments \
  --name "Payments gRPC merchant"
~~~

Omitting `--workspace` creates a native workspace beneath the product directory.
Repeating an interrupted setup keeps the same product UUID and original
workspace. The profile and merchant configuration are private files. The
workspace remains outside the installed source tree.

For agent-controlled local captures, reflected endpoints and incoming files,
add `--handles /srv/private/grpc-handles.json` during initialization:

~~~json
{
  "schema": "stellar-forge.grpc-product-handles.v1",
  "captures": {
    "production": {
      "label": "Current service contract",
      "directory": "/srv/private/service-proto",
      "entrypoints": ["service.proto"],
      "sourceFile": "/srv/private/service-source.json",
      "planFile": "/srv/private/service-plan.json"
    }
  },
  "reflections": {
    "production": {
      "label": "Current endpoint reflection",
      "sourceFile": "/srv/private/service-source.json",
      "protocol": "auto"
    }
  },
  "files": {
    "original-request": {
      "label": "Reviewed native request",
      "path": "/srv/private/original-request.json",
      "kind": "request"
    },
    "incoming-revision": {
      "label": "Received original revision",
      "path": "/srv/private/received-source/grpc-revision.json",
      "kind": "revision"
    }
  }
}
~~~

These are the existing native handle formats. Paths in this setup are resolved
against the handle file's directory. The initializer writes the original
`grpc-connections.json` with this product's private console URL file. An
operator may maintain those native capture/reflection/file handles in that
original connection file while retaining its workspace alias and console URL
path. Review and reopen the product after editing configuration.

The source file follows the native
[connection schema](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grpc/README.md).
It selects the real target, transport, metadata environment references and exact
request/response limits. TLS CA, certificate, private key and authorization values
stay in the original host environment.

## 2. Open the browser and agent

~~~sh
starforge grpc-product review --dir /srv/private/payments-grpc
starforge grpc-product open --dir /srv/private/payments-grpc \
  --workspace-port 0 --port 0 --token-env MCP_ACCESS_TOKEN
~~~

Supply the existing token value through the private process environment. For a
reviewed OAuth resource, set the original `MCP_OAUTH_CONFIG` file instead.
Use `--browser-only` when the operator needs the native browser alone.

The returned private browser URL opens the original source and plan editor.
The merchant MCP endpoint connects to that same native instance. The returned
`operatorUrl` opens **Merchant operator** on that merchant listener. Its private
state stays at `operator-console/` beneath the initialized product directory.
`connection.json` records the product, native instance, operator workspace ID,
reviewed Console source and current endpoints.
Client calls reread it after reopen and remain bound to the same product/workspace.

In **Applications → gRPC merchant product**, choose the initialized product and
READY runtime. Review shows the actual workspace, selected revision and generation,
host handle names, private configuration identities, native managed source,
and the complete maintained Console source. Review reads an existing Console's
workspace ID; first Open creates that store in the selected private product.
Save and Start use that reviewed selection. The product's Open action verifies
the retained session against the original authenticated live launch.

Select an HTTPS facilitator with `--facilitator` when the merchant will run
its native paid seller. Local development can explicitly select a loopback
facilitator with `--allow-local-facilitator`. The source-owned native
seller retains its original mode and payment behavior.

## 3. Capture the service's actual contract

The browser has two original source paths:

- **Protobuf capture:** select the merchant-host directory and entry files.
  The native compiler retains the full import closure with exact source bytes.
- **Server reflection:** select the saved TLS/metadata profile, read its actual
  inventory, choose the intended services and capture their descriptor closure.
  Review the saved capture before saving it as a native source revision.

Reflection uses the selected v1 protocol, with native v1alpha compatibility when
the endpoint reports v1 unimplemented. Captured descriptor bytes remain
FileDescriptorProto bytes; service selection does not discard dependency types.

The agent exposes the same operations:

~~~sh
starforge grpc-product tools --name merchant_grpc_reflection_inventory
starforge grpc-product call --dir /srv/private/payments-grpc \
  --tool merchant_grpc_reflection_inventory --input /srv/private/reflection-selection.json
~~~

A selection such as `{"profile":"production"}` is bound to this product's
workspace alias by the client. Save the returned inventory identity, then use
the complete schema from `merchant_grpc_reflection_capture` to pass the
selected services, original UUID, expected inventory and current base revision.
Reopening that capture uses `merchant_grpc_reflection_open`; saving it uses
the original capture identity and complete merchant plan. Its immutable source
is available through revision export.

## 4. Author methods, typed requests and merchant terms

Open the captured revision in **Methods & terms**. The native schema preserves
field numbers, maps, enums, repeated messages, oneofs, optional presence, base64
bytes and exact decimal strings for 64-bit integers. Inclusion controls preserve
the difference between absent values and explicit false, zero or empty fields.

For unary and server-streaming methods, input is the native request message.
For client-streaming and bidirectional methods, input is the complete ordered
operation object:

~~~json
{
  "messages": [
    {"account_id": "18446744073709551615", "include_voided": false},
    {"account_id": "7", "include_voided": true}
  ]
}
~~~

Replace these illustrative fields with the selected method's actual schema.
Set the original request-series and response-stream limits in Source before
preparing a streaming route. The editor retains order, message count, per-message
and aggregate byte limits, native write/backpressure, half-close, returned stream
prefix and final status. The [streaming guides](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grpc/REQUEST_STREAMS.md)
describe the exact source-native contracts.

Each merchant route keeps its public POST path, original gRPC method, example,
service text and complete ordered payment options. Amounts are atomic-unit
strings. Save the actual scheme, network, asset, recipient, timeout and extra
data selected for that merchant. The included example can initialize an editor;
use the merchant's approved terms for its deployed service.

**Review channel and terms** uses the original compiler/channel review.
**Run upstream request** is the explicit native business operation. Persist
its UUID before invoking it:

~~~js
import { GrpcProductClient } from '@tokenjunkielabs/starforge-merchant/products/grpc-merchant/client';

const client = new GrpcProductClient({ directory: '/srv/private/payments-grpc' });
const result = await client.callMethod({
  revision: savedRevision,
  operationId: originalOperationId,
  method: '/example.Payments/Lookup',
  input: reviewedNativeInput
});
~~~

For an interrupted response, use `client.attempt(originalOperationId)` or:

~~~sh
starforge grpc-product attempt --dir /srv/private/payments-grpc --id ORIGINAL_UUID
~~~

The native first result, exact request and durable stream prefix remain under
that original attempt. Cancel uses the same operation UUID. Creating another
UUID expresses another intentional business operation.

## 5. Prepare, deliver and operate the merchant

Use the saved current revision and a persisted preparation UUID. **Prepare**
runs the original seller and client generator. Download the complete customer
export described in [RECEIVING.md](RECEIVING.md).

A direct **Run merchant** opens the original seller preview and Operations.
Stop it before staging that preparation in its workspace-owned SF82 release store.
The release console provides:

1. Stage the original preparation with a release ID.
2. Compare the actual staged releases.
3. Activate at the observed selection generation.
4. Run the selected release.
5. Stop or restart the exact original instance.
6. Roll back using the original previous selection or an explicitly selected
   staged release and current generation.

Browser and agent actions share these original records. A retry after a lost
reply starts with status/current generation and the retained native instance,
then continues the intended original operation.

## 6. Review a contract upgrade

Capture the new service contract or open an existing candidate revision.
The native upgrade review compares field numbers, types, presence, oneofs,
maps, enums, and request/response reachability. Its route section shows the
affected merchant paths, schemas and original versus proposed examples.

Edit the complete candidate plan, retain an explicit review UUID and save the
review. Adoption uses its immutable review SHA and the observed native selection.
A later conflicting edit is composed in the original revision workflow.

~~~sh
starforge grpc-product upgrade list --dir /srv/private/payments-grpc
starforge grpc-product upgrade open --dir /srv/private/payments-grpc \
  --id ORIGINAL_REVIEW_UUID --section summary
starforge grpc-product upgrade adopt --dir /srv/private/payments-grpc \
  --id ORIGINAL_REVIEW_UUID --review-sha ORIGINAL_REVIEW_SHA256
~~~

The same original upgrade CLI supplies method comparison and all four review
files. Following adoption, use the original review, preparation, customer export
and release lifecycle. Receiving preserves the first retained observation for
that immutable review even as current-selection/adoption observations evolve.

## 7. Retain standard service health

Health uses the selected saved revision's endpoint, TLS and metadata references.
Check and List retain their original native result. Watch retains native updates,
connection terminals and reconnects until its chosen deadline/event budget or
explicit stop.

~~~sh
starforge grpc-product health check --dir /srv/private/payments-grpc \
  --revision SAVED_REVISION_SHA --id ORIGINAL_UUID --service example.Payments

starforge grpc-product health watch --dir /srv/private/payments-grpc \
  --revision SAVED_REVISION_SHA --id ORIGINAL_WATCH_UUID --service example.Payments \
  --timeout-ms 30000 --duration-ms 60000 --max-events 1000 --detach true

starforge grpc-product health open --dir /srv/private/payments-grpc \
  --id ORIGINAL_WATCH_UUID --section summary
starforge grpc-product health stop --dir /srv/private/payments-grpc --id ORIGINAL_WATCH_UUID
~~~

An empty service name selects whole-server health. SERVICE_UNKNOWN remains an
observed native status while Watch continues. A quiet interval is retained as a
quiet interval. Native UNIMPLEMENTED is retained as the protocol outcome.
List records its original service-map snapshot and is not presented as an atomic
cross-call inventory.

Stop waits for the original channel to close. Health Stop stays available while
another changing merchant operation is busy. Reopen shows retained outcomes;
an explicit Watch resume uses its observed version and remaining original
deadline/event budget. A completed unary probe remains its first native result.

Freeze a health export once and retain its original export descriptor before
download. This preserves the selected prefix while a live Watch grows. The
[health guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grpc/HEALTH.md)
covers full native events, paging, cancellation and first-result recovery.

## 8. Complete customer work in the saved operator Console

Open **Merchant operator** from the product's Applications links or its returned
`operatorUrl`. Connect with the configured merchant access token. Create or
select a named profile, inspect **Host**, and bind that profile to the current
configured host. The product's original workspace alias remains the selection
for every gRPC tool.

In **Customer files → gRPC / Customer workspace**, load configured workspaces
and select the original one. Inventory pages expose prepared merchants, revisions,
retained calls, exports, contract reviews, health observations, descriptor
captures and preparation intents. Previous and Next retain the page's exact
snapshot. Refresh deliberately selects the current inventory.

Choose a preparation to inspect its source revision; choose a retained call to
read its original outcome; choose a contract review to open its saved comparison
and adoption history. Source and contract sections retain the original summary,
source, plan, methods and routes. Full native returns stay in **Saved original
requests**, including a downloadable complete JSON result. Large native returns
point to their retained complete files.

The panel prepares four whole procedures in **Workflow Recipes**:

| Procedure | Exact saved input | Complete procedure |
| --- | --- | --- |
| Customer and source delivery | Workspace and preparation UUID | Nine steps: inspect the original workspace, export all seven customer files, pause at their manifest, inspect the preparation's exact revision/source/plan, export its full source closure, pause at that manifest, and read current workspace state |
| Contract-upgrade delivery | Workspace, review UUID and reviewed SHA-256 | Nine steps: inspect the workspace, open original summary/plan/source/full review/adoption, export the four original upgrade files, pause at the manifest, and read the workspace |
| Frozen service-health delivery | Workspace, observation UUID, event throughSequence and event snapshot | Seven steps: inspect the workspace, read the observation, review the selected events, export their complete frozen prefix, pause at the manifest, and read the same observation and workspace |
| Retained-call delivery | Workspace and original call UUID | Five steps: inspect the workspace, recover the original saved call, export its complete attempt and stream when present, pause at the manifest, and read the workspace |

Review the generated recipe's native tool definitions, inputs and bindings,
install its saved edition, then start that edition. At a manifest pause, inspect
the exact export and select **Receive complete files**. Complete receiving and
download the customer archive before continuing that saved procedure. The
customer procedure takes its revision from the original customer export, so the
delivered source belongs to the preparation actually selected.

Health event history and List service filtering have different snapshot
identities. Use the event page's `throughSequence` and `snapshot` to freeze
health delivery, including sequence zero for an empty history. A filtered
services page remains a view of that List result. The frozen health export
contains the complete selected event prefix across all preview pages.

Every dispatched request is saved in the original private Console profile.
After a lost reply or restart, open that original request and inspect its native
operation or export. An explicit continuation retains the same saved arguments
and original operation identifiers. Transfer Pause keeps the downloader's byte
checkpoint; Resume keeps the same export and reviewed manifest.

Completed customers provide the full archive and original individual files.
The archive retains `grpc/` and its nested `client/` package. Profile export
carries its complete receiving records and saved workflows. On another Console,
receive the profile and original files through the same customer flow. Use the
[complete Console guide](../../stellar-forge/mcp-merchant-operator/console/CUSTOMER_GRPC.md)
and [native receiving instructions](RECEIVING.md) for exact member paths and
offline inspection.

## Close, reopen and upgrade the installed software

Ctrl-C or Applications Stop drains the persistent Console, its archive/file
responses and transfers, the original agent and native workspace.
All owned close paths are attempted even if one reports an error; the retained
session records the resulting state and same original instance. A live workspace
lease prevents a second native writer.

Open the same private product after a normal stop or process restart. Its
original source revision, attempts, health journal, prepared customer files,
Console profiles, requests, procedures and receiving checkpoints remain available. Reconcile the original operation before making another request.

For a new source release, prepare a new runtime with the original installer.
Select that runtime and review the same private product in Applications.
The source/selection manifest and native managed binding identify the edition
that is actually operating the retained customer workspace.
