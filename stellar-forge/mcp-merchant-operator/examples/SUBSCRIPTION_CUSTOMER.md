# Complete OData subscription customer

This programme operates a publisher and customer from two complete retained OData collections, carries their edition history through independent backup and restore, and imports the delivered customer source into the original Analysis application. It includes a ready connection for the subscription browser, CLI and MCP operations.

The reference Orders workspace contains two original collections of 830 rows. One collection selects fewer fields. The programme derives the intersection of their complete field definitions and retains every original declared key. Over those shared fields, the second collection contains 830 unchanged rows and zero additions, removals or changed values. The earlier comparison's 4,150 selection-changed cells describe omitted fields. They are not supplier updates.

## Source and runtime

Keep the whole received source checkout, including the native subscription product and original Analysis Python package. The operating files in this directory are:

- subscription-customer.mjs: complete publisher, customer, independent restore, continued delivery and analytical-source workflow.
- subscription-customer-analysis.py: actual Analysis registration, mapping, import, query, export, complete workspace backup and independent receiving.
- SUBSCRIPTION_CUSTOMER.md: this guide.

Use Node 24 and the original supported Python runtime, with the installed dependency closure identified in the complete source inventory. The native product is under stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/. SUBSCRIPTIONS.md there documents the complete product interface and source semantics.

The input must be a complete OData workspace transfer. The already retained comparison customer archive includes OData_Comparison_Workspace.json and all original runtime source. Reuse that complete archive and its member manifest when preparing the runtime.

## Select the customer operation

Create one private input JSON using the actual absolute source, transfer and output paths:

~~~json
{
  "schema": "stellar-forge.odata-subscription-customer-input.v1",
  "operationId": "orders-subscription-customer-20261012",
  "title": "Orders subscription customer",
  "checkout": "/ABSOLUTE_SOURCE",
  "outputDirectory": "/ABSOLUTE_CUSTOMER_OPERATION",
  "workspaceTransfer": "/ABSOLUTE_INPUT/OData_Comparison_Workspace.json",
  "workspaceTransferSha256": "ACTUAL_COMPLETE_WORKSPACE_TRANSFER_SHA256",
  "archiveSha256": "ACTUAL_COMPLETE_SOURCE_ARCHIVE_SHA256",
  "beforeCollection": "live/products/orders/collections/orders-complete",
  "afterCollection": "live/products/orders/collections/orders-country-selection",
  "expectedRows": 830,
  "expectedChanges": {
    "after": 830,
    "matched": 830,
    "added": 0,
    "removed": 0,
    "changed": 0,
    "unchanged": 830,
    "events": 0
  }
}
~~~

The collection paths resolve inside the restored source workspace. Their full manifest identities are obtained from the original collection receiver after the complete transfer hash is checked. Source and customer directories must be separate. Keep private directories 0700 and configuration/output files 0600.

The selected operation ID is the source of the three publisher request IDs. Preserve the same input file when continuing an interrupted operation. Choose a new output directory and operation ID for a different source selection.

## Run the whole customer programme

~~~sh
node /ABSOLUTE_SOURCE/stellar-forge/mcp-merchant-operator/examples/subscription-customer.mjs \
  /ABSOLUTE_INPUT/subscription-customer-input.json

python3 -B /ABSOLUTE_SOURCE/stellar-forge/mcp-merchant-operator/examples/subscription-customer-analysis.py \
  --checkout /ABSOLUTE_SOURCE \
  --operation /ABSOLUTE_CUSTOMER_OPERATION \
  --node /ABSOLUTE_NODE
~~~

The native programme holds the original release lease over the operation directory. Each completed return is published atomically and retained with its exact file identity. Resuming adopts completed returns and continues native requests with their original IDs. The Analysis programme holds a separate process lease and uses the original Analysis job IDs, source registrations, mappings and workspace archive receiver.

A complete native result is written to subscription-customer-result.json. The analytical result is written to subscription-analysis-result.json. Their state fields describe the actual operation; read these returns before presenting the reference as an operated result.

### Native edition sequence

1. Restore the complete original OData workspace, reopen both original collections and select the shared original field definitions and declared keys.
2. Create publisher edition 1 and reopen its exact original creation request.
3. Deliver the complete baseline and receive it in the customer workspace.
4. Append the second original collection as edition 2, export the incremental transfer, and receive it in the same customer.
5. Reuse the completed old baseline and keep the customer's current edition 2. Read every publisher and customer row through their paged native interfaces and compare the full sequences.
6. Export complete publisher and customer backups and independently restore both. Compare every restored customer row.
7. Continue the restored publisher as edition 3 with the same retained second source. This deliberately unchanged-source edition exercises continued delivery after restoration; its note makes that meaning explicit.
8. Deliver edition 3 incrementally to the restored customer, compare all continued rows and export complete publisher and customer backups of that edition.
9. Export the complete customer as an Analysis source document, including its original proof packets. Restore another native customer from that source and compare every resulting row.
10. Write the ready subscription connection, exact definition, source identities, delivery results and final file inventory.

### Analysis operation

The Python programme registers the actual exported source document and passes the returned source name/revision to the existing subscription CLI's analysis-mapping command. Every field has its original value column and explicit state companion.

It runs the original response preview and import jobs, activates the imported dataset, queries all delivered rows in original row order, and compares every cell with the complete CSV held by the source document. Both JSON and CSV query exports are retained.

It then exports the complete Analysis workspace, receives that archive independently, reopens the same workspace identity and queries all rows again. The complete workspace ZIP, original dataset version, source registration, mapping, query exports and restore receipt accompany the customer.

## Open the continuing application

After the native programme completes, use its generated connection:

~~~sh
node /ABSOLUTE_SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/cli.mjs \
  --connection /ABSOLUTE_CUSTOMER_OPERATION/Subscription_Connection.json \
  serve --port 0
~~~

The server returns its actual local URL. Open that URL to inspect editions, source collections, transfers, customer rows, exports and backups through the maintained application. The installed command is starforge odata-subscriptions.

The connection selects these continuing workspaces:

| Alias | Selection |
|---|---|
| Publisher publisher | Restored publisher continued to edition 3 |
| Publisher original | Original publisher at edition 2 |
| Customer analyst | Restored customer continued to edition 3 |
| Customer original | Original customer at edition 2 |
| Customer analytical | Customer independently restored from the Analysis source |

The input aliases baseline, second and continuation select the three complete transfers. publisher-backup and customer-backup select the final complete backups. analysis selects the exported source document. All selected paths and hashes come from the actual native returns.

For a CLI read, save a private request JSON and pass it to the existing command:

~~~json
{"publisher":"publisher"}
~~~

~~~sh
node /ABSOLUTE_SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/cli.mjs \
  --connection /ABSOLUTE_CUSTOMER_OPERATION/Subscription_Connection.json \
  publisher-inspect --request /ABSOLUTE_REQUEST/publisher.json
~~~

Other useful requests are:

| Command | Request |
|---|---|
| publisher-rows | {"publisher":"publisher","revision":3,"kind":"rows","offset":0,"limit":100} |
| customer-inspect | {"customer":"analyst"} |
| customer-rows | {"customer":"analyst","offset":0,"limit":100} |
| publisher-backup | {"publisher":"publisher","artifact":"publisher-edition-3","expectedRevision":3} |
| customer-backup | {"customer":"analyst","artifact":"customer-edition-3","expectedRevision":3,"expectedEditionSha256":"ACTUAL_FINAL_EDITION_SHA"} |

The original responses provide the next offset and selected edition identity. Preserve those values while paging. New publisher editions use a newly selected complete collection, a new request ID and the current inspected revision.

## Complete handover

A usable delivery includes the full SOURCE inventory, original selected input identities, complete native publisher and customer directories, all three transfers, the complete publisher/customer backups, Analysis source and original proof files, analytical workspace archive, queries, operating inputs, step returns and journals.

The complete source and customer archive should be written with the maintained streaming packager. Save the native-complete checkpoint before starting the Analysis phase, then save the finished whole customer package and exact result through the existing file helper while the owning process still has access to its private directory.

To move the application to another machine, keep the full source closure and complete archives. Use the native publisher/customer backup receivers and original Analysis archive receiver to reopen them in new private directories. Build a connection with those actual received paths. The restored publisher can accept another complete source edition, and the restored customer can receive the resulting incremental transfer.
