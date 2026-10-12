# Receive subscriptions through managed Applications

This programme consumes a completed private subscription connection and an
existing READY runtime. It saves one original OData application, opens its
configured publisher/customer interface, receives complete native backups, stops
the managed service and reopens the same saved entry. The resulting operation
retains both launch records, every selected HTTP response, complete downloaded
backups and independent receiving workspaces.

Use the connection returned by the completed subscription customer programme,
or an operator's existing equivalent connection. Its configured publishers and
customers must have completed their selected native operations. The preparation
command reads their actual current definition, edition and row identities.

## Select the original inputs

Create an owned private selection file from
[managed-receiving.example.json](managed-receiving.example.json):

~~~json
{
  "operationId": "my-subscription-applications-receiving",
  "runtimeDirectory": "/private/ready-runtime",
  "workspaceDirectory": "/private/completed-customer/odata-workspace",
  "subscriptionConnection": "/private/completed-customer/Subscription_Connection.json",
  "outputDirectory": "/private/managed-subscription-receiving"
}
~~~

The connection uses the actual receiving host's paths. Restore and reopen the
original publisher/customer backups before selecting a connection that points to
them. Keep the completed source operation and its original connection as retained
inputs. The original connection reader checks private directory ownership, the
declared source/input digests and the separate export directory.

The runtime must be an actual READY installation containing the managed OData
subscription connection and this receiving programme. The native installer,
profile, dependency lock and source manifest remain authoritative. This command
adopts that existing installation through the original runtime-workspace model.
It does not install another toolchain.

**workspaceDirectory** names an existing OData source workspace. Optional
**liveServiceId** opens its already prepared live merchant alongside subscriptions;
optional **environmentFile** uses the existing Applications environment reader.
The operation output must be separate from every source, runtime, publisher,
customer and export directory.

## Review the exact current connection

~~~sh
starforge odata-subscriptions managed-review \
  --request /private/managed-selection.json \
  --out /private/managed-reviewed-input.json
~~~

This reads the original runtime and completed stores, then writes a reviewable
input containing:

| Selection | Retained identity |
| --- | --- |
| Runtime | Original merchant source manifest SHA256 |
| Connection | Exact raw file SHA256 |
| Each publisher | Definition SHA256, current edition SHA256, head and row count |
| Each customer | Definition SHA256, accepted edition SHA256, revision and row count |

Every configured publisher and customer must appear in the expected selection.
The command requires completed stores, including a clear pending-operation state.
Review the generated input before running it. A changed configuration or advanced
native state requires a new receiving selection and output directory.

The API equivalent is:

~~~js
import {prepareManagedSubscriptionReceiving}
  from '@tokenjunkielabs/starforge-merchant/seller/odata/subscriptions';

const reviewed = await prepareManagedSubscriptionReceiving(selection);
~~~

The result schema is
**stellar-forge.odata-managed-subscription-receiving-input.v1**.
The preparation call only reads original product/runtime state; its CLI writes
the requested reviewed-input file with exact-byte reuse.

## Complete the managed lifecycle

~~~sh
starforge odata-subscriptions managed-receive \
  --request /private/managed-reviewed-input.json
~~~

The source entry can also be invoked directly with the selected Node24 executable:

~~~sh
node live/subscriptions/managed-receiving.mjs \
  --input /private/managed-reviewed-input.json
~~~

The API **runManagedSubscriptionReceiving(reviewed)** returns the complete result.

The programme uses the original **createRuntimeWorkspace**,
**openRuntimeWorkspace**, runtime attachment and Applications methods. Review
captures the connection in the existing OData card. Save and adoption retain the
original managed release. Start retains its actual review and request ID before
dispatch.

For the first managed opening it performs the following work:

1. Checks the original launch record, selected configuration and actual listener
   probe. Opens the original subscription HTML and checks the Applications
   **Open subscriptions** link.
2. Reads every configured publisher and customer. Receives every selected row
   page, every publisher change page and the complete publisher edition history.
3. Selects one native publisher or customer backup for each configured alias.
   Each backup has a retained export ID and its original complete request.
4. Downloads every declared file through the running HTTP operator. Checks the
   complete byte count and SHA256, then restores each downloaded backup into an
   independent private workspace using the native publisher/customer receiver.
5. Stops the exact managed operation through Applications. Confirms the
   operation is inactive and all announced workspace/merchant listeners close.

It then closes and reopens the Applications model, reviews Start for that same
saved entry and repeats the full source/row/history inspection. Each original
export is reopened by its retained artifact ID. Its complete file inventory and
independent restore must still match. The second managed operation is stopped
before completion.

The programme observes the native change counts. A next edition derived from
an unchanged retained source correctly has zero change events; receiving does
not invent provider updates.

## Retained output

| Path | Contents |
| --- | --- |
| input.json | Exact original reviewed input |
| operation.json | Current continuation state and retained requests |
| applications/ | Original controller, saved application and managed history |
| http/ | Original successful requests/responses, local probe and UI bytes, grouped by actual launch |
| requests/ | Exact original Applications Start requests |
| downloads/ | Complete native publisher/customer backups received over HTTP |
| restored/ | Independently restored publisher/customer workspaces |
| result.json | Completed identities, both closed managed phases and selected file inventory |

The result schema is **stellar-forge.odata-managed-subscription-receiving.v1**.
A successful result has **state: "COMPLETE"**, both **first** and **reopened**
phases, closed original operation records and verified retained exports.

HTTP row hashes describe a canonical JSONL representation of the actual returned
items. Each response is also retained in its original bytes. The native backup
manifests and file hashes continue to identify their original bytes and complete
source/history closure.

Keep the complete operation directory and the selected runtime/source with the
customer's delivery. Publisher and customer transfer uses the downloaded native
backups. The OData workspace has its separate original workspace backup; one
backup kind does not replace the other.

## Continue the same operation

Repeat the same **managed-receive** command and reviewed input. Use the same
programme source and output directory.

The receiving lease allows one writer. The journal retains the saved application,
Start review, application operation IDs, selected native export requests and
independent receiver identities. A pending or interrupted managed run goes through
the original Applications recovery methods. A new Start is selected only after the
previous managed run is terminal and its listeners have closed. The retained native
backup export ID and request stay the same across application launches.

An interrupted file download keeps its owned partial file. The next actual
download checks every retained prefix byte against the same immutable source and
appends the remaining bytes. Publication occurs only after the whole declared
length/SHA256 and file synchronization succeed. An already published file is
verified and reused.

A completed but unrecorded native export or restore is reconciled by its original
retained identity. A complete run reopens its saved result and verifies the
retained files; later source editions do not cause the finished command to start
another application.

A failed operation retains **NEEDS_ATTENTION** and the original error record. Normal
error handling asks the original controller to stop only its selected managed
operation. Stop is attempted even if this receiving journal cannot be written;
the first error remains the reported failure. A resumed retained run is bound for
cleanup before its original recovery call. If the runtime disappears, keep its controller and receiving journal
for the same continuation. Do not create a competing output or replace its
publisher/customer inputs.

The programme accepts the native backup limits and streams downloads. A single
JSON response is bounded at 64MiB and row/history pages request 100 records. A
limit or source mismatch ends the current phase with retained evidence.

See [APPLICATIONS.md](../APPLICATIONS.md) for the card's configuration and
[SUBSCRIPTIONS.md](SUBSCRIPTIONS.md) for native publication, receiving, Analysis
mapping and complete transfer operations.
