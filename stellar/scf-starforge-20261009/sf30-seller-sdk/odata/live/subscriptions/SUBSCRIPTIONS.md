# OData collection subscriptions

Collection subscriptions turn complete retained OData collections into an ordered customer delivery. A merchant selects the entity keys and fields once, publishes full source editions, and delivers a complete baseline followed by keyed changes. The customer applies those changes against its exact saved edition, verifies every prior row hash and the full resulting row set, and retains the complete receiving history.

Publisher, customer, local interface, command line and MCP provider use the original modules in this directory. Supplier discovery, query compilation, paid-page acquisition and complete collection receiving remain in the [original OData application](../../PROVIDER.md) and [collection implementation](../collection.mjs). Every published edition retains its actual collection, query, acquisition window and original source bindings.

## Meaning of an edition

A subscription definition fixes the original service root, entity set, ordered entity keys and selected field mapping, including type declarations and nullability. Each accepted source collection must retain those fields with the same declaration. Every key is included even when the caller supplies a smaller field list.

A row contains a canonical declared key and the selected original scalar values. Exact Decimal and Int64 values remain strings. Source nulls remain null. Keys use the original collection key canonicalizer. Rows and changes are ordered by the UTF-8 bytes of the canonical key.

| Change | Before | After | Meaning |
| --- | --- | --- | --- |
| Upsert with no previous hash | null | New full row hash | This key entered the selected collection. |
| Upsert with a previous hash | Exact saved row hash | New full row hash | The selected original row changed. |
| Remove | Exact saved row hash | null | This key left the selected collection. |

Removal describes membership in the selected collection. Supplier data, query scope or entity availability may have changed. The edition retains the source/query evidence for the operator to interpret.

A publisher may accept a changed query scope only with an explicit edition note and **allowScopeChange: true**. That edition and customer receipt identify the scope change. Projection, page size and requested count do not themselves change membership scope; all subscribed fields still have to be present and unchanged in declaration. A new service, entity key or field declaration needs a separately reviewed subscription.

The delivered protocol is the source-owned collection subscription format. Supplier acquisition uses the existing OData collection engine. The native modules make no request for a supplier change-tracking token.

## Configure the original operator

Use Node 24 with the original source package. Its node:sqlite engine keeps keyed comparison and receiving memory bounded. Existing source installations and their accepted dependency closure can be reused.

Copy [connection.example.json](connection.example.json) into a private working directory. Replace each collection SHA with the actual SHA256 of its original collection.json. Choose existing complete collection directories and separate publisher, customer and export destinations. Directories must be owned, canonical and private (0700); files are private regular files (0600). New destinations may be absent when their private parent already exists.

| Connection field | Purpose |
| --- | --- |
| publishers | Named publisher directories and labels. |
| customers | Named customer receiving directories and labels. |
| collections | Complete original collection directories, labels and selected manifest SHA256. |
| inputs | Transfer, publisher backup, customer backup or Analysis directories with exact manifest SHA256. |
| exportsDirectory | Separate private directory for selected output artifacts. |

Names are lowercase aliases of at most 64 characters. Browser and MCP requests select aliases and original edition identities. Host paths stay in the private connection.

A source alias may be added for a later collection. Existing artifacts remain bound to their original export directory and native publisher/customer destination identity. Their original connection SHA remains provenance. Reusing an artifact ID with another destination or selected request fails.

~~~sh
starforge odata-subscriptions --connection /absolute/private/subscriptions.json serve --port 0
~~~

The command prints the actual loopback URL and process identity. Publisher controls create and append editions, inspect source/query/counts, page changes, retain deliveries, export supplier originals and back up the publisher. Customer controls apply deliveries, inspect full rows, export Analysis sources, generate the actual registered-source mapping and back up or restore receiving work. Deliveries exposes each selected manifest and every output member.

Attach these controls to an existing OData console:

~~~sh
starforge odata --workspace /absolute/private/odata-workspace serve --port 0 --subscriptions /absolute/private/subscriptions.json
~~~

The console gains a Subscriptions link at /subscriptions/. The connection retains ownership of its configured publisher/customer destinations. Use the subscription backup controls for those destinations; the source console's workspace download exports its original source/capture/live workspace.

### Save the connection in Applications

The original **OData source and live merchant** card accepts an optional
`subscriptionConnection` path. Select the same private connection used by this
operator, Review and Save the application, then Start and choose **Open
subscriptions**. The connection's exact bytes and configured directories join
the original managed input review. Its digest is bound to the loaded operator,
private launch record and live listener before Applications accepts the URL.

Managed Stop drains this operator with the original OData server. Reopening the
saved entry preserves its original publisher/customer directories, editions,
requests and receiving histories. Review any edited connection before a new
Start. Subscription backups retain their own complete native stores; the source
workspace backup retains the source/capture/live workspace. See
[OData in Applications](../APPLICATIONS.md) for the settings and receiving path.

## Complete publisher and customer workflow

Each command reads one JSON request. Preserve that file for retries. The local UI and MCP provider accept the same native object.

~~~sh
starforge odata-subscriptions --connection subscriptions.json status
starforge odata-subscriptions --connection subscriptions.json publisher-create --request create-orders.json --out created.json
~~~

A creation request over the Northwind Orders example can select two actual retained fields:

~~~json
{
  "publisher": "orders",
  "collection": "baseline",
  "requestId": "orders-create-20261012",
  "title": "Orders selected customer collection",
  "fields": ["OrderID", "ShipCountry"]
}
~~~

The result identifies revision 1, its complete original source, row count, change counts and manifest SHA. Retain the first full delivery:

~~~json
{
  "publisher": "orders",
  "artifact": "orders-baseline-1",
  "fromRevision": 0,
  "toRevision": 1
}
~~~

~~~sh
starforge odata-subscriptions --connection subscriptions.json publisher-delivery --request baseline.json --out baseline-result.json
~~~

A baseline contains all selected rows at its chosen ending edition. It can begin at any published revision; **fromRevision: 0** explicitly selects a new baseline for an empty customer.

Receive that artifact with this request:

~~~json
{"customer":"analyst","artifact":"orders-baseline-1"}
~~~

~~~sh
starforge odata-subscriptions --connection subscriptions.json customer-receive --request receive-baseline.json --out baseline-received.json
~~~

Append the next complete original collection:

~~~json
{
  "publisher": "orders",
  "collection": "next",
  "requestId": "orders-next-20261012",
  "expectedRevision": 1,
  "note": "Reviewed the next complete original Orders collection and its selected query."
}
~~~

~~~sh
starforge odata-subscriptions --connection subscriptions.json publisher-append --request append-orders.json --out appended.json
~~~

The request ID and complete body select this operation. Repeat the same request after an interrupted return. A later retry of a committed request returns its original receipt. A different body under that ID is rejected. Concurrent appends require the reviewed current revision.

If the two original collections contain identical values for the fixed subscribed fields, the next edition correctly has zero change events. It still carries the new original source identity and a complete verifiable edition. Field-selection differences in a separate comparison do not become invented source-value changes.

Prepare an incremental delivery:

~~~json
{"publisher":"orders","artifact":"orders-changes-1-2","fromRevision":1,"toRevision":2}
~~~

Receive it with a customer-receive request selecting customer analyst and artifact orders-changes-1-2. That customer must currently hold exactly revision 1 and its original edition SHA. A positive starting revision selects every intervening edition and change file, up to 100 editions per delivery. The customer verifies each chain link, applies every change against the exact prior hash, and reproduces the published full-row SHA at every edition before committing its new state.

Repeating an earlier completed delivery returns that original receipt while preserving a newer pending delivery. A failed new delivery retains its selected identity and bytes for the same receiving operation.

## External receiving

Download all files declared by the artifact record, preserving their relative paths. Its manifest is part of the inventory. The Deliveries screen exposes the files; MCP exposes bounded retained-file reads.

On the receiving host, put the complete directory in an owned private location and declare it as an input:

~~~json
{
  "orders-next-delivery": {
    "label": "Orders edition 1 to 2",
    "kind": "transfer",
    "directory": "./received/orders-changes-1-2",
    "sha256": "ACTUAL_SHA256_OF_TRANSFER_JSON"
  }
}
~~~

Call customer-receive with customer analyst and input orders-next-delivery. The manifest SHA selects the entire file closure. Missing files, repeated paths, a different starting edition, changed prior row values, incorrect counts or a different resulting full-row hash are rejected.

| Input kind | Selected manifest | Operation |
| --- | --- | --- |
| transfer | transfer.json | customer-receive |
| publisher-backup | backup.json | publisher-restore |
| customer-backup | backup.json | customer-restore |
| analysis | source.json | customer-restore |

Restore selects an empty configured destination and preserves the original history. Repeating the same completed restore reopens that receiving result. A different backup cannot silently replace an existing destination.

## Full backups and interrupted publisher work

A publisher backup includes its immutable definition, complete published edition chain, full original collections and terminal request records. Restore reopens every original collection, rederives row/change files, and checks the exact complete closure before publishing the received state.

A customer backup includes its starting baseline, every applied transfer, intermediate full snapshots and current state. Restore replays the original transfers and compares the complete reconstructed state and file inventory.

Select the current publisher edition explicitly:

~~~json
{"publisher":"orders","artifact":"orders-publisher-backup-2","expectedRevision":2}
~~~

For customer-backup or customer-export, pass the actual current revision and edition SHA:

~~~json
{
  "customer": "analyst",
  "artifact": "orders-customer-backup-2",
  "expectedRevision": 2,
  "expectedEditionSha256": "ACTUAL_CUSTOMER_EDITION_SHA256"
}
~~~

These checks run under the native lease. They prevent an export from silently selecting a newer edition while the operator reviews an earlier one.

Cancel an unpublished request with publisher-cancel and its original requestId. Cancellation retains the terminal record, isolates its unpublished edition directory under the request's cancelled working area, and then releases the pending selection. Interrupted cancellation resumes that move. The next request receives a clean unpublished revision path. Cancelled IDs remain terminal after full backup/restore. Published editions remain immutable.

Original cross-process leases protect each publisher/customer. Same-process operations queue by canonical directory. An unfinished restore retains its selected original backup identity. Source and edition publication use private temporary files, fsync and exclusive immutable installation.

## Analysis and complete customer delivery

Customer-export creates dataset.csv, source.json, customer.json and every content-addressed document/proof member declared by the source. The original Analysis document contains each selected field plus its explicit state column.

Values remain text for Analysis. A source null uses an empty CSV value plus null in its state column; an original empty string uses the same empty CSV value plus value. Decimal/Int64 lexical precision stays intact. Original native type declarations remain in the retained subscription definition.

The proof includes the initial received baseline, every applied transfer and every intermediate snapshot. Export complete supplier request/response originals separately with publisher-source for any edition. The customer proof describes the actual source/query/edition chain used by that customer.

Register source.json through the original Analysis source-document receiver. Generate the import mapping using the actual returned source alias and revision:

~~~json
{"customer":"analyst","source":"orders_subscription","sourceRevision":1}
~~~

~~~sh
starforge odata-subscriptions --connection subscriptions.json analysis-mapping --request registered-source.json --out Analysis_Import_Mapping.json
~~~

The original Analysis receiver, saved query, result export, report and workbook operations then consume the complete document through their established source interface. A different receiving alias or source revision needs a mapping generated with that actual selection.

Analytical restore verifies every packet/chunk, replays the complete customer proof in private receiving work, and compares the entire CSV with reconstructed native rows before committing the destination. Uploaded transform source remains provenance; receiving uses the selected installed implementation.

## MCP provider

The source-owned odata-subscriptions provider is registered through distribution/contributions/odata-subscriptions.json. It uses the same SubscriptionOperator as the CLI and local browser, loaded through the original lazy merchant registry.

Create a private setup file:

~~~json
{
  "directory": "/absolute/private/subscription-merchant",
  "connection": "/absolute/private/subscriptions.json",
  "name": "Orders subscriptions"
}
~~~

~~~sh
starforge merchant-providers init odata-subscriptions --options subscription-merchant-setup.json
~~~

The original initializer creates or reopens its private release store and writes the exact merchant-mcp.json. An existing merchant configuration can declare odataSubscriptionConnection with the selected file. The original host's transport and authentication are documented in its [operator guide](../../../../../../stellar-forge/mcp-merchant-operator/README.md).

All tools begin with **merchant_odata_subscription_**. The suffix maps to a CLI command with underscores replacing hyphens.

| Tool group | Operation |
| --- | --- |
| status | Configured publishers, customers, inputs and source aliases. |
| publisher_create, publisher_append, publisher_cancel | Original request identity, revision and terminal history. |
| publisher_inspect, publisher_editions, publisher_rows | Definition, source evidence, edition chain and paged rows or changes. |
| publisher_delivery, publisher_source, publisher_backup, publisher_restore | Complete selected publisher outputs and receiving. |
| customer_receive, customer_inspect, customer_rows | Exact-baseline and incremental receiving. |
| customer_export, customer_backup, customer_restore | Complete analytical output and independently replayed customer receiving. |
| analysis_mapping | Actual registered source alias/revision mapping. |
| artifacts, artifact | Paged output records and complete member inventories. |
| file, file_release | Original immutable-descriptor ranged file reads and explicit release. |

File reads select artifact, relative path and expectedSha256. Continue with the original readId, offset and same SHA. Each range is limited to 196,608 bytes. Completed reads close automatically. After a host restart, open the same immutable file using its expected SHA and saved offset. MCP requests select declared aliases and relative inventory members.

## Limits and source lineage

Native publisher and receiver support at most 32 fields, 1,000,000 complete rows, 16 MiB per keyed row, 256 MiB per file and 512 MiB per complete inventory. A subscription retains up to 10,000 editions and 10,000 cancelled requests. An incremental delivery contains up to 100 consecutive editions; a baseline selects one complete ending edition.

Analysis exports preserve the original receiver's limits: 64 value/state columns, 2 MiB per projected row, 128 MiB complete projected rows, 128 MiB native proof, 32 original members, 32 MiB per compressed member, 256 MiB total source and 1 MiB source manifest. A larger running subscription can retain full native backups and prepare a reviewed complete baseline in a separate customer for a smaller analytical history.

Keep the complete selected source package with a delivered customer edition. The native engine, original collection canonicalizer, source receiver and customer proof implementation form its replay lineage. A changed native format or key/type rule should retain the compatible original implementation for published editions.

The worked native programme belongs alongside these source files and its exact original inputs. Source review and successful native/customer operation are separate records. Report an edition as operated after its original native result and complete receiving artifacts have returned.

## Complete managed receiving from a finished connection

[MANAGED_RECEIVING.md](MANAGED_RECEIVING.md) provides the complete maintained
Applications continuation. **managed-review** captures the actual READY runtime,
connection and every completed publisher/customer identity. **managed-receive**
uses the original saved card through Start, full native backup/download and
independent restore, Stop and same-entry reopen. It retains original requests
and resumes the same output; a completed result has both managed operations
closed and the complete downloaded source/history inventories verified.
