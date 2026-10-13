# Receive an OData subscription from a merchant

The subscription customer connects to the merchant's existing MCP service, selects an exact published edition, retains every original delivery file, and opens that edition in a local customer. Later deliveries continue the same customer from its exact saved edition. Complete local backups and Analysis exports use the original subscription receiver and retain its history.

Use Node 24 and the complete selected Starforge source/runtime. The installed command is **starforge odata-subscription-customer**. From a complete source checkout, the same entry is:

~~~sh
node stellar-forge/mcp-merchant-operator/odata-subscription-cli.mjs --help
~~~

The distribution contribution is **odata-subscription-customer**. It is included in the maintained **odata-subscriptions** build selection. The JavaScript export is **./operator/odata-subscription-client**, with its accompanying declarations. Existing installed packages need a newly selected build containing this contribution before that command is available. A completed older customer edition remains usable with its retained native source.

## What the customer receives

A merchant first prepares its original subscription connection and enables the original **odata-subscriptions** MCP provider. Follow [the publisher/operator guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/SUBSCRIPTIONS.md) and [merchant host guide](README.md) for setup and host transport. This client uses that configured service and its normal authentication.

| Selection | Meaning |
| --- | --- |
| Publisher alias | The original configured publisher, as returned by status. |
| Revision | An immutable published subscription edition. |
| Edition SHA | The SHA256 of that edition's native manifest, returned as manifestSha256. |
| Artifact alias | A stable merchant output name bound to one complete export request. |
| Artifact SHA | The SHA256 of the original transfer.json, backup.json or source.json selected by that output. |
| Download record SHA | The SHA256 of subscription-artifact.json, which retains the original public artifact record. |
| Analysis source revision | The revision assigned when the exported source document is registered in Analysis. |

An artifact SHA and an edition SHA identify different files. Use the result field named by each command. The download record retains the native manifest identity, complete member inventory and original selection. It does not change the native protocol or replace any source file.

The customer controls its local private directories. The remote service continues to control publisher configuration and retained artifacts. No source collection is recaptured by these commands, and receiving does not create or append publisher editions.

## Connect and review the publisher

Set the bearer in the environment variable already used for the selected merchant. The examples use MCP_ACCESS_TOKEN. The client accepts HTTPS service URLs and loopback HTTP; use the actual complete MCP endpoint printed by the merchant host. URLs cannot contain credentials, query strings or fragments.

~~~sh
starforge odata-subscription-customer status \
  --url https://merchant.example/mcp

starforge odata-subscription-customer publisher \
  --url https://merchant.example/mcp --publisher orders

starforge odata-subscription-customer editions \
  --url https://merchant.example/mcp --publisher orders --offset 0 --limit 50
~~~

The hostname and publisher above are examples. Replace them with the actual configured values. For another bearer variable, add **--token-env YOUR_VARIABLE_NAME** to each remote command. The bearer remains in that variable and is not written into the download checkpoint.

Publisher inspection returns its complete fixed definition, current head, source and pending request. Editions returns ordered native editions and each **manifestSha256**. Review the key fields, mapping, original service and entity set, query scope, acquisition evidence, counts and scope-change note before selecting delivery.

Remote list commands return **offset**, **total**, **items** and **nextOffset**. Continue with the returned nextOffset until it is null. The maximum remote page is 100 records; a single page is not a complete publisher census.

Read full rows or changes from a selected edition:

~~~sh
starforge odata-subscription-customer publisher-rows \
  --url https://merchant.example/mcp --publisher orders \
  --revision 2 --edition-sha256 ACTUAL_EDITION_2_SHA \
  --kind changes --offset 0 --limit 100
~~~

Repeat with **--kind rows** for full selected rows. Continue all pages when reviewing the complete set. The optional edition SHA check binds each page to the reviewed edition; **fetch** and **delivery** always require the ending edition SHA.

## Receive the first complete baseline

Select an actual published revision and its manifestSha256. A baseline uses **--from 0** and includes every selected row at the ending edition. It can start a customer at revision 1 or a later published edition.

Choose a stable artifact alias and two separate private directories. Keep the same alias, selection and paths for any retry.

~~~sh
starforge odata-subscription-customer fetch \
  --url https://merchant.example/mcp --publisher orders \
  --artifact orders-baseline-1 --from 0 --to 1 \
  --edition-sha256 ACTUAL_EDITION_1_SHA \
  --download /absolute/private/downloads/orders-baseline-1 \
  --out /absolute/private/customers/orders \
  --progress true
~~~

This single command:

1. Reads the selected immutable publisher edition and checks its exact SHA.
2. Requests or reopens the original publisher delivery under the selected artifact alias.
3. Checks that the returned transfer has the selected starting and ending editions.
4. Downloads the full artifact through the original retained-file reader and checkpoint.
5. Verifies the complete member inventory and invokes the original local customer receiver.

The native receiver verifies the definition, source scope, edition and full row set before committing the customer. A completed result includes the artifact identity, complete download result and original receiving receipt.

Inspect the received customer and its rows:

~~~sh
starforge odata-subscription-customer inspect \
  --directory /absolute/private/customers/orders

starforge odata-subscription-customer rows \
  --directory /absolute/private/customers/orders --offset 0 --limit 100
~~~

Local row pages accept at most 500 rows. Continue nextOffset until null. The inspection gives the current **revision**, **editionSha256**, **definition**, **snapshot**, original transfers and pending receiving state.

## Continue that customer with ordered editions

Inspect the local customer first. Select its actual revision and editionSha256 as the starting endpoint, then review the merchant's selected ending edition.

~~~sh
starforge odata-subscription-customer fetch \
  --url https://merchant.example/mcp --publisher orders \
  --artifact orders-changes-1-2 --from 1 --to 2 \
  --from-edition-sha256 ACTUAL_RECEIVED_EDITION_1_SHA \
  --edition-sha256 ACTUAL_PUBLISHED_EDITION_2_SHA \
  --download /absolute/private/downloads/orders-changes-1-2 \
  --out /absolute/private/customers/orders \
  --progress true
~~~

A positive starting edition requires its exact SHA. Every intervening edition is included, up to 100 editions per delivery. The native receiver checks each previous edition, every changed prior row hash and the complete resulting row set at each step.

An unchanged source can produce a valid next edition with zero change events. The edition still retains its actual original collection and query. An entity leaving a selected collection is a membership change; the original source and scope explain whether supplier data or query selection changed. The client does not label every removal as a supplier deletion.

A different definition, starting edition, row value or resulting row hash fails receiving. Preserve the selected input and result when this occurs. Do not edit the download, discard the pending customer intent or create a different artifact ID to conceal an unknown prior outcome.

## Separate selection, download and offline receiving

Use **delivery** to prepare and inspect the original artifact without receiving it:

~~~sh
starforge odata-subscription-customer delivery \
  --url https://merchant.example/mcp --publisher orders \
  --artifact orders-changes-1-2 --from 1 --to 2 \
  --from-edition-sha256 ACTUAL_RECEIVED_EDITION_1_SHA \
  --edition-sha256 ACTUAL_PUBLISHED_EDITION_2_SHA

starforge odata-subscription-customer artifact \
  --url https://merchant.example/mcp --artifact orders-changes-1-2
~~~

The result's **artifactSha256** selects the native manifest. Use that value, rather than the edition SHA, for these commands:

~~~sh
starforge odata-subscription-customer download \
  --url https://merchant.example/mcp --artifact orders-changes-1-2 \
  --sha256 ACTUAL_TRANSFER_MANIFEST_SHA \
  --out /absolute/private/downloads/orders-changes-1-2

starforge odata-subscription-customer verify-download \
  --directory /absolute/private/downloads/orders-changes-1-2 \
  --sha256 ACTUAL_TRANSFER_MANIFEST_SHA

starforge odata-subscription-customer receive \
  --download /absolute/private/downloads/orders-changes-1-2 \
  --sha256 ACTUAL_TRANSFER_MANIFEST_SHA \
  --out /absolute/private/customers/orders
~~~

Verification and receiving work without the merchant connection once the complete download is retained. Move the **whole download directory**, including its original checkpoint and subscription-artifact.json, when continuing on another receiving host. Preserve private regular files, directory permissions and relative member paths.

**download** retains all five native artifact kinds: transfer, original collection source, publisher backup, customer backup and Analysis source. **receive** accepts transfer, customer-backup and analysis. Publisher backups remain inputs to the original publisher-restore operation. Original collection source remains input to its original collection/source receiver. Downloading one of those kinds does not silently turn it into a customer transfer.

List existing artifacts with:

~~~sh
starforge odata-subscription-customer artifacts \
  --url https://merchant.example/mcp --offset 0 --limit 50
~~~

An incomplete selected artifact is visible in that list but cannot be downloaded as complete. Reopen its original native export request before downloading.

## Interrupted commands and exact retries

Repeat the same command, artifact alias, SHA, merchant endpoint and directories. The original downloader retains verified prefix hashes, byte offsets, completed members and its pending read identity. It accepts only the original scoped checkpoint and exact file identities. A discarded or changed source file is an error.

If the merchant restarts and an old read ID no longer exists, the downloader reopens the same immutable file at the saved offset and expected SHA. It does not request a newer edition. Each successful range is checked for selected name, size, SHA, offset, returned length and continuation before its bytes are accepted.

The original native customer owns its receiving intent and cross-process lease. Retrying a completed delivery returns its original receipt. Replaying an older accepted delivery preserves a newer pending receiving operation. A failed or interrupted new delivery remains bound to that same transfer.

Remote export response uncertainty is resolved by reopening the same immutable artifact alias and original request. The client forwards native error codes and outcome flags. CLI errors include **applied**, **outcomeUnknown**, **reopenRequired** or **commitUncertainty** when supplied by the original service. Retain the result and reconcile that original operation; a missing response does not establish that the export failed.

**download** and **fetch** accept **--chunk-size** from 1 through 196608. **--progress true** emits JSON progress to stderr while the final structured result goes to stdout. SIGINT/SIGTERM abort the remote transfer at its original checkpoint boundaries. Local native receiving remains governed by its original lease and interruption recovery; an abort signal is checked before it starts.

## Back up and independently reopen the customer

Select the current customer revision and edition SHA from **inspect**:

~~~sh
starforge odata-subscription-customer backup \
  --directory /absolute/private/customers/orders \
  --revision 2 --edition-sha256 ACTUAL_CUSTOMER_EDITION_2_SHA \
  --out /absolute/private/backups/orders-2
~~~

The native backup retains the definition, received baseline, every applied transfer, intermediate snapshots and current state. Its returned **sha256** identifies backup.json.

Restore into a separate empty private destination:

~~~sh
starforge odata-subscription-customer restore \
  --source-directory /absolute/private/backups/orders-2 \
  --kind customer-backup --sha256 ACTUAL_BACKUP_MANIFEST_SHA \
  --out /absolute/private/reopened/orders-2
~~~

The original receiver checks the full selected closure before committing, replays the original transfer history and compares the reconstructed state. Repeating the same completed restore returns its original result; another backup cannot overwrite that destination.

To inspect an older published edition without changing the active customer, request a **new baseline artifact** with from 0 and the explicit older ending revision/SHA, then fetch it into a **separate empty customer directory**. Alternatively, restore an already retained backup into a separate destination. Local **rows** reads the current edition of that selected customer; it does not imply a hidden historical-row API.

## Export a complete Analysis source

~~~sh
starforge odata-subscription-customer export \
  --directory /absolute/private/customers/orders \
  --revision 2 --edition-sha256 ACTUAL_CUSTOMER_EDITION_2_SHA \
  --out /absolute/private/analysis/orders-2 \
  --title "Orders subscription, received edition 2"
~~~

This calls the original customer export. Keep the whole output: source.json, dataset.csv, customer.json, the content-addressed document and every declared original/proof member. The result identifies **source.sha256**, full row count, revision and edition SHA.

Register that exact **source.json** through the original [Analysis document receiver](../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/SUBSCRIPTIONS.md#analysis-and-complete-customer-delivery). Use the actual returned alias and source revision to generate the mapping:

~~~sh
starforge odata-subscription-customer analysis-mapping \
  --directory /absolute/private/customers/orders \
  --source orders_subscription --source-revision 1
~~~

The value 1 above is an example registration revision. It is independent of subscription edition 2. The mapping covers each fixed field and its explicit state column. Source nulls and original empty strings remain distinguishable; exact Decimal/Int64 values remain text, with original type declarations retained in the subscription definition.

Restore the complete analytical customer independently:

~~~sh
starforge odata-subscription-customer restore \
  --source-directory /absolute/private/analysis/orders-2 \
  --kind analysis --sha256 ACTUAL_SOURCE_JSON_SHA \
  --out /absolute/private/reopened/orders-analysis-2
~~~

The native analytical receiver checks all packets and chunks, replays the complete customer history and compares every projected CSV row before accepting the destination. It uses the installed reviewed native implementation; uploaded source is provenance.

## JavaScript API

~~~js
import {
 inspectMerchantODataSubscriptionPublisher,
 listMerchantODataSubscriptionEditions,
 fetchODataSubscription,
 backupReceivedODataSubscription
} from './odata-subscription-client.mjs';

const connection = {
 url: process.env.MERCHANT_MCP_URL,
 tokenEnv: 'MCP_ACCESS_TOKEN'
};
const publisher = await inspectMerchantODataSubscriptionPublisher({
 ...connection, publisher: 'orders'
});
const editions = await listMerchantODataSubscriptionEditions({
 ...connection, publisher: 'orders', offset: 0, limit: 50
});
// Select an actual reviewed edition/SHA from these original records.
const received = await fetchODataSubscription({
 ...connection, publisher: 'orders', artifact: 'orders-baseline-1',
 fromRevision: 0, toRevision: 1,
 expectedEditionSha256: reviewedEditionSha256,
 directory: '/absolute/private/downloads/orders-baseline-1',
 customerDirectory: '/absolute/private/customers/orders'
});
~~~

Supply either **url** or an existing client with **endpoint** and **call(name,args,options)**. That client must return the original MCP tool's structured object and preserve the endpoint for resumable scope binding. Every remote API accepts an AbortSignal. Credentials and host configuration stay with the caller.

The exported declarations use the original native subscription types. Local backup, export, restore and mapping call the same native functions as the established operator. The original publisher, customer, retained file reader, transport authentication and cross-process leases remain the authority.

## Limits, retained source and operating status

Remote pages contain at most 100 entries; local customer pages at most 500. Downloads preserve the native ceilings of 2048 files, 256 MiB per file and 512 MiB per complete inventory. The public artifact record and download checkpoint each have a 16 MiB ceiling. The original engine supports up to 32 fields, one million rows, ten thousand editions and at most one hundred incremental editions per delivery.

Analysis retains its narrower native source/proof limits described in the publisher guide. A native subscription fitting the full backup limit does not necessarily fit an Analysis export. The native export reports that case without truncating history.

Keep the selected complete runtime source and dependency graph with the customer delivery. The key canonicalizer, original collection projection and subscription receiver determine replay semantics. This remote interface packages the established native behavior rather than introducing a different change engine.

Publication and source review of this interface are separate from a recorded customer execution. Existing completed customer receipts remain their own evidence. Installing this new command does not establish that the managed Applications lifecycle has run; use that workflow's original Review/Start/Stop/reopen result.
