# Register the existing Directus operator for customer-agent tools

The installed Directus product declares the source-owned
`directus-workspaces` provider. It connects the existing Merchant host to the
same private operator and saved content-data project used by the customer
application. Original Directus permissions, source capture, content-version
mutation, merchant publication and buyer-session contracts remain in force.

## Select the original operator and project

Create an operator-owned private JSON connection with schema
`stellar-forge.directus-agent-connection.v1`. Each workspace alias selects an
existing canonical private operator directory. Its original `operator.json`
registry remains authoritative. An optional `projectKey` selects that existing
registry entry after authenticated launch verification. When omitted, attach
to the operator's current selected project and verify its returned scope.
`workspaceDirectory` is an owned-startup setting for the original project
directory; it does not derive a registry key. The existing project must contain
its original `directus-datasets.sqlite3`. No project or database is created.

```json
{
  "schema": "stellar-forge.directus-agent-connection.v1",
  "workspaces": {
    "customer": {
      "label": "Original Directus customer project",
      "directory": "/private/directus/operator",
      "projectKey": "ACTUAL_ORIGINAL_REGISTRY_PROJECT_KEY",
      "mode": "managed",
      "files": {
        "original-source": "/private/directus/inputs/original-source.json",
        "original-project": "/private/directus/inputs/Directus_Complete_Project.sqlite3"
      },
      "connections": {
        "original-directus": {
          "baseUrl": "https://directus.example.invalid",
          "tokenEnv": "ORIGINAL_DIRECTUS_TOKEN"
        }
      },
      "runtimes": {
        "original-merchant": "/private/directus/original-merchant-runtime.json"
      }
    }
  }
}
```

These are illustrative paths and identifiers. Select the actual original
operator, project, registry key, retained files and approved Directus service.
Do not place a token in this connection document: the explicit connection tool
resolves the configured `tokenEnv` from the host's original environment.
Preserve the operator's original source permissions. A configured connection
does not widen the Directus principal's access.

The selected application must already exist. Initialization creates no
Directus operator or project and does not acquire customer data. File aliases
retain the complete selected source or project inputs; agent tools accept
those aliases instead of arbitrary host paths.

Directus is a multiproject operator. Keep the complete returned
`operatorId`, `instanceId`, `projectKey` and `workspaceId` when continuing a
customer operation. A received independent project can retain its source
workspace identity while obtaining a different project key. Matching the
workspace ID alone does not establish the active project.

Managed mode is the default. Start the original installed operator normally
and attach through its authenticated `operator-launch.json`. A restarted
listener requires a newly opened attachment. Managed close detaches and leaves
the original listener with its existing owner.

Owned mode starts the same maintained Node operator service and owns only the
service object it created. If the original saved project lives outside the
operator directory, configure its actual existing `workspaceDirectory` for
that startup. There is no Node or Python executable option and no
automatic project creation. Owned close drains that service through the
original lifecycle; it must not close an unrelated managed listener.

The `runtimes` map contains aliases for original private merchant-runtime JSON
files. An explicit runtime selection passes the configured `port`,
`facilitator` and `allowLocalFacilitator` settings through the existing native
merchant contract. The merchant port is distinct from the operator listener.
Use a local facilitator only for its deliberately configured original course.
Paid publication and receiving retain the original buyer approval and budget
requirements. Merely adding a runtime alias does not publish or buy a dataset.
Runtime values and credentials remain on the private host.

## Initialize or reopen the same Merchant host

Keep the connection private and place the Merchant directory beneath an
existing canonical private directory. Use the maintained source-owned
initializer:

```javascript
import {initializeMerchantProvider}
  from './stellar-forge/mcp-merchant-operator/providers.mjs';

const result = await initializeMerchantProvider('directus-workspaces', {
  directory: '/private/directus-merchant',
  connection: '/private/directus-workspaces.json',
  name: 'Original Directus customer service'
});
```

Use the returned `merchant-mcp.json` with the existing Merchant launcher.
Initialization validates the installed contribution and its original
connection reader. It creates only its own release store and private customer
export directory. It does not open the application, change a Directus
connection, mutate content, publish a resource or approve a purchase.

An explicit `releaseStore` must select an existing original store. The
initializer validates that store without replacing its complete release
history. Repeating the same original setup finishes an interrupted attempt or
reopens the completed configuration. A saved whole host configuration stays
byte-identical, including its other provider families and export directory.

Setup binds the connection-file bytes, original store and name under the
maintained state lease. Changed inputs require a deliberately selected new
setup directory. Only this initializer's unchanged empty release-store stage
can be promoted after interruption. Supplied or already saved stores must
exist. Mismatched source files and stages remain retained.

## Operate and deliver the original customer project

Open the configured alias and verify its actual project scope before reading
or changing work. Continue complete inventories to their terminal page.
Preserve original schema and item captures, records, content versions,
comparison identities and native mutation events. A content-version or buyer
operation with an uncertain response must resume from its original request
and saved reconciliation state.

The provider serializes ordinary calls for each workspace. Concurrent controls
are `merchant_directus_cancel` and `merchant_directus_close`. Cancel selects
the exact original native or buyer operation and retains its uncertain and
recovery history. Close uses the actual bound operator identity. Managed close
detaches; owned close drains the service created by this runtime. Neither
control establishes that an unobserved remote mutation or payment did not
occur.

Control requests retain a 2 MiB limit. Original source captures retain their
256 MiB bound. Complete project delivery streams the original file, supporting
up to 32 GiB, with retained read chunks of at most 196,608 bytes. Receive every
chunk using the returned next offset, then verify the complete byte length and
SHA-256. A first chunk or JSON summary is not the whole delivery.

Customer delivery includes its selected data files, source and content-version
history, original saved operations, publisher/buyer records and complete
editable project. Import that complete project through the configured file
alias. The original operator registry creates its independent received-project
directory and returns the new project scope. Agent tools take no arbitrary
destination directory and do not replace the source project. Reopen the actual
received project and verify its selected generation and original history.

Keep the existing A238 Directus customer course and its actual source/runtime
operation. The agent interface continues that product; it does not turn an
unobserved native run into a completed capture, paid purchase or customer
acceptance. Retain the actual customer result and whole project together with
the original operation.
