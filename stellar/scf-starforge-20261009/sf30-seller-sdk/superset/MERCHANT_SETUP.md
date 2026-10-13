# Register the existing Superset workspace for customer-agent tools

The installed Superset product declares the source-owned
`superset-workspaces` provider. It connects the existing Merchant host to the
same private operator and saved Superset project used by the customer
application. Original source, publisher, payment approval and buyer-session
engines retain their existing contracts.

## Select the original operator and project

Create an operator-owned private JSON connection with schema
`stellar-forge.superset-agent-connection.v1`. Each workspace alias selects an
existing canonical private operator directory. If its project lives elsewhere,
select that existing project with `workspaceDirectory`; otherwise the project
is the same directory. The selected project must already contain its original
`superset.sqlite3`. Setup does not create a Superset project.

```json
{
  "schema": "stellar-forge.superset-agent-connection.v1",
  "workspaces": {
    "customer": {
      "label": "Original Superset customer project",
      "directory": "/private/superset/operator",
      "workspaceDirectory": "/private/superset/customer-project",
      "mode": "managed",
      "files": {
        "original-project": "/private/superset/inputs/original-project.sqlite3"
      },
      "destinations": {
        "received-project": "/private/superset/receiving/customer-project"
      }
    }
  }
}
```

These paths illustrate the commissioning fields. Select the actual original
operator, existing project, retained input and independent receiving
destination. File aliases preserve the original selected input identities.
Receiving uses its configured destination and the existing receiving engine;
it does not authorize replacement of another customer's project.

Managed mode is the default. Start the original installed operator normally,
then attach through its authenticated `operator-launch.json`. The client binds
its actual live instance and source. A restarted operator requires a newly
opened attachment. Managed close detaches and leaves that original listener
under its existing owner.

Owned mode starts `startSupersetWorkspaceServer` in the same Node host on a
local ephemeral port. It owns only the returned service object and closes that
service through its original drain. There is no Node or Python executable
option and no substitute project or child application. Original private source
and approval environment references remain with the selected host.

An owned alias may select `runtimeFile`, an absolute path to the original
private SF82 merchant-runtime JSON used by the Superset operator's `--runtime`
option. The customer client retains and rechecks that complete file's identity
before opening, then passes its `port`, `facilitator` and
`allowLocalFacilitator` settings unchanged into the original merchant runtime.
The port in this file configures the dataset merchant; the Superset operator
itself still opens on local ephemeral port 0. Native paid publication and
receiving use the original configured facilitator and buyer approval and
budget flow. Select `allowLocalFacilitator` only with the original deliberately
configured local facilitator. Managed aliases reject `runtimeFile` and retain
the already-running listener's original configuration. Runtime and credential
values remain private host configuration.

## Initialize or reopen the same Merchant host

Keep the connection file private and place the merchant directory beneath an
existing canonical private directory. Use the maintained source-owned
initializer:

```javascript
import {initializeMerchantProvider}
  from './stellar-forge/mcp-merchant-operator/providers.mjs';

const result = await initializeMerchantProvider('superset-workspaces', {
  directory: '/private/superset-merchant',
  connection: '/private/superset-workspaces.json',
  name: 'Original Superset customer service'
});
```

Use the returned `merchant-mcp.json` with the existing Merchant launcher.
Initialization validates the complete installed contribution and its connection
reader. It creates only its own release store and private customer-export
directory; it does not launch Superset, create a project, acquire source data,
publish a merchant resource or approve a purchase.

Pass an existing `releaseStore` explicitly to retain that complete store. The
initializer validates it without recreating its release history. Repeating the
same original setup completes an interrupted attempt or reopens its completed
configuration. A saved whole host configuration remains byte-identical,
including its other provider families and export directory.

The original setup intent binds the complete connection-file bytes, selected
store and name under the maintained state lease. Changed original inputs
require a deliberately selected new setup directory. After interruption, only
this initializer's unchanged empty release-store stage can be promoted. A
supplied or already saved store must exist. Original files and setup stages are
retained when their identity does not match.

## Continue the original customer journey

Open the configured alias and keep the returned current instance. Read the
actual sources, captures, editions, reviews, comparisons and original saved
operations. Continue each paginated inventory to its real end. Use the original
request and exact retained identifiers when acquiring or reviewing sources,
continuing publication or operating the buyer course. Inspect the same saved
operation after an uncertain response before retrying it.

The provider serializes ordinary workspace calls. Its concurrent controls are
`merchant_superset_cancel` and `merchant_superset_close`. Cancel requires the
original operation ID and invokes that workspace's existing cancel operation
in either attachment mode. It cancels queued work or aborts the active original
acquisition/session while retaining its saved operation. It does not erase the
operation's source or financial outcome. Managed close detaches; owned close
drains the exact service created by this runtime.

Mutations retain the original 1 MiB request-body bound. Complete retained files
use the original 2 GiB limit and bounded chunks up to 196,608 bytes. Use each
returned file identity, complete byte count, SHA-256 and next offset to receive
all bytes. Verify the full file rather than treating an initial chunk as a
complete delivery. Keep the private host export directory outside the source
project.

Customer delivery includes the actual customer output, complete source and
review history, and the whole editable project. Receive that project at the
configured independent destination and reopen it through its actual new
operator connection. The original A238 customer course keeps its selected
source, acquisition and chart-to-merchant-to-buyer operation; this agent
interface continues that same project and does not establish an unobserved
publication, purchase or accepted customer result.
