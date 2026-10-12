# Multiple native services in one buyer workspace

The native registry connects existing SF88 buyer workspaces to one authenticated
MCP endpoint, one catalog, and one HTTP request desk. Each configured service keeps
its original route, payment binding, approval channel, signer, spending ledger,
durable inbox and complete saved responses.

Customers can browse the full Bazaar, choose a compatible service, save and review
the actual request, execute it, reopen its history, cancel or recover its original
attempt, and download the complete response. The installed client uses the same
service and intent identities as the console.

## Configure the existing services

First initialize each service with the original
[NATIVE_WORKSPACE.md](NATIVE_WORKSPACE.md) workflow. A service has one exact
merchant origin, pathname, HTTP method and payment binding. All services in one
registry must use the same original Bazaar URL.

Create an operator-owned JSON description:

~~~json
{
  "schema": "stellar-forge.mcp-native-registry-input.v1",
  "defaultWorkspaceId": "reports",
  "workspaces": [
    {
      "id": "reports",
      "label": "Research reports",
      "directory": "/srv/starforge/native-reports"
    },
    {
      "id": "weather",
      "label": "Weather observations",
      "directory": "/srv/starforge/native-weather"
    }
  ]
}
~~~

Use actual existing native directories. IDs contain 1–64 lowercase letters,
digits or hyphens and start with a letter or digit; labels contain 1–80 characters.
The host supports 1–16 distinct services. Every directory must be canonical,
absolute, private and owned by the current operator.

Initialize a new private registry directory beneath an existing private parent:

~~~sh
starforge mcp-native-registry init \
  --dir /srv/starforge/native-marketplace \
  --description /srv/starforge/native-services.json
~~~

The source entrypoint is:

~~~sh
node stellar-forge/mcp-paid-agent/native-registry-cli.mjs init \
  --dir /srv/starforge/native-marketplace \
  --description /srv/starforge/native-services.json
~~~

Initialization verifies each original native workspace and records the complete
native manifest digest. The resulting registry contains its own description,
trusted adapter and intent ownership records. Service wallets, ledgers and inboxes
continue in their original directories.

## Serve and open the request desk

Use the existing MCP access token or OAuth host configuration and original SF81
approval channel, then start:

~~~sh
starforge mcp-native-registry serve \
  --dir /srv/starforge/native-marketplace \
  --port 3210
~~~

The startup JSON provides the MCP URL and browser console URL. Open that console
and connect with the configured access token. Browse or search the catalog and
inspect the selected offer. Its native request form lists services whose original
route and payment alternative match the offer.

The HTTP requests view includes a service selector, each service's request limits,
and history for one service or all services. Opening a saved request selects its
original service. Switching the browsing selector leaves existing operations
associated with their saved service. Execution, cancellation, recovery and every
result range continue with that same service and intent.

The default service also supplies the existing object, dataset, analysis,
collection and DuckDB panels. Those panels continue through their original owners.
The registry's explicit service selector applies to the native HTTP request
actions.

## Use the installed client

The client export is
**@tokenjunkielabs/starforge-merchant/buyer/mcp/native-requests**.

~~~js
import { randomUUID } from 'node:crypto';
import { openNativeRequestClient } from
  '@tokenjunkielabs/starforge-merchant/buyer/mcp/native-requests';

const buyer = await openNativeRequestClient({
  url: 'http://127.0.0.1:3210/mcp'
});
try {
  const configured = await buyer.workspaces();
  console.log(configured.workspaces.map(service => ({
    id: service.workspaceId,
    label: service.workspaceLabel,
    route: service.route,
    payment: service.payment
  })));

  const reports = buyer.forWorkspace('reports');
  const first = await buyer.discovery.search({query:'research reports',limit:25});
  // Continue first.continuation with the existing discovery client as needed.
  // Inspect an actual eligible handle returned by this same endpoint.
  const described = await buyer.discovery.describe(first.resources[0].handle);

  const intentId = 'reports-' + randomUUID();
  const prepared = await reports.prepare({
    intentId,
    handle: described.handle,
    acceptIndex: 0,
    maxAtomic: described.accepts[0].amount,
    input: {query:{}}
  });
  console.log(await reports.review(prepared.intentId));
  const outcome = await reports.execute(prepared.intentId);
  console.log(outcome);

  // Once the original request has a saved response:
  await reports.downloadResult({
    intentId: prepared.intentId,
    destination: '/srv/starforge/received-report.bin'
  });
} finally {
  await buyer.close();
}
~~~

Choose an actual service-compatible offer, eligible payment index and all required
query/body values before preparation. The example reads the first returned offer
only to show the API. Use the full [discovery workflow](DISCOVERY.md) when choosing
the real request; the registry retains the exact original selected page.

A scoped client shares the parent's transport and lifetime. Close the parent after
all selected services are finished. A scoped client keeps its service ID fixed
for every request. The root client also accepts a default **workspaceId** when
opened, or an explicit **workspaceId** in call options.

The saved response client keeps the selected service fixed across all byte ranges,
checks original intent identity, range offsets, byte counts, canonical base64 and
the complete SHA-256 digest, then publishes a new destination exclusively.

## Read complete history

For one service:

~~~js
const weather = buyer.forWorkspace('weather');
for await (const page of weather.historyPages({limit:50})) {
  for (const record of page.records) {
    console.log(record.workspaceId, record.intentId, record.state);
  }
}
~~~

For all registered HTTP service inboxes:

~~~js
for await (const page of buyer.allHistoryPages({limit:50})) {
  for (const record of page.records) {
    console.log(record.workspaceLabel, record.intentId, record.createdAt);
  }
}
~~~

Combined history preserves the original inbox ordering by creation time and
stable request key, then merges the next page across services. Each continuation
contains the original per-service cursors for records actually returned. An
unconsumed row stays available on the next page. Coverage reports the total
original records and number of workspaces. A changed or unreadable source produces
an explicit error, allowing the caller to resolve that source and resume.

The combined cursor is opaque and remains tied to the installed registry manifest.
Use it unchanged. Individual history continues with the original 64-character
native inbox cursor.

## Tool contract

All actions use **sf43_discover_review_and_pay**.

| Action | Arguments | Result |
| --- | --- | --- |
| request-workspaces | action | Complete configured services, default service and current execution admission |
| request-workspace | action, workspaceId | One service's original route, payment binding and limits |
| request-prepare | action, workspaceId, intentId, handle, maxAtomic, input; optional acceptIndex | The original prepared SF88 intent and selected complete provider page |
| request-review | action, workspaceId, intentId | Retained request, original source and available actions |
| execute, status, recover, cancel | action, workspaceId, intentId | Original request state and operation result |
| history | action, workspaceId; optional limit and original cursor | Original service inbox page |
| request-history | action; optional limit and combined cursor | Merged page from every configured service |
| read | action, workspaceId, intentId; optional byteOffset and maxBytes | Original saved response range |

Service-specific results include **workspaceId** and **workspaceLabel** alongside
the original result. Omitting workspaceId selects the configured default. The
single-service native host exposes the same service-list and combined-history
actions with workspace ID **default**.

## Intent ownership and execution

Use a globally unique intent ID for each new request, then retain it. The original
approval broker identifies requests by intent ID. The registry atomically records
which service owns that ID before preparation or execution, and checks other
pre-existing native inboxes before first ownership. An ID already assigned to
another service returns the original service identity so the caller can reopen
the correct request or create a distinct new request.

The original SF88 request remains the source of its attempt, outcome and recovery.
Admission occurs before the original queue starts an attempt. A busy execution
returns the same original request with **execution: "OPERATOR_BUSY"**; its saved
request remains available for a later explicit execution.

The host derives approval selection from the original **SF81_APPROVAL_SOCKET**
and **SF81_APPROVAL_TOKEN** pair. With a validated browser channel and known
original payer addresses, different payers can execute concurrently while one
payer's operations are serialized. The original controlling-terminal channel
uses one owned operation at a time. The host checks the actual selected approval
channel before entering an original operation.

Each service retains its own configured spend ledger and per-request ceiling.
Plan those original budgets together when several services use the same wallet.
The registry preserves the original signer, merchant recipient, network and asset
binding for every request.

The host holds the existing OS-owned private-directory locks for its registry and
registered native directories. Closing drains original active/preparing work and
pending calls before releasing the locks. Run lifecycle calls through the live
authenticated endpoint.

## Inspect and update host configuration

Read the installed description while the server is running:

~~~sh
starforge mcp-native-registry inspect \
  --dir /srv/starforge/native-marketplace
~~~

This returns the complete private host manifest and its digest. MCP service
descriptions expose the selected routes and operational limits; private directory
paths remain in the operator's local configuration.

A registry's membership and original native manifest digests remain fixed.
To install a changed set of services, stop the host, initialize a new registry
directory from the desired existing native workspaces, and start that registry.
Their original inboxes and results reopen through the new host. Reusing an intent
from any other registered service is detected from those original inboxes.

Programmatic hosts use
**@tokenjunkielabs/starforge-merchant/buyer/mcp/native-registry** and its typed
**initializeNativeRegistry**, **inspectNativeRegistry** and **openNativeRegistry**
exports. Supply only trusted operator configuration to these host APIs.

See [NATIVE_REQUESTS.md](NATIVE_REQUESTS.md) for request/body semantics,
original approval and complete response handling.
