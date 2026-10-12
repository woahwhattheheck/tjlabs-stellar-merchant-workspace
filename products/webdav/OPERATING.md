# Operate and deliver a WebDAV data product

Use the original WebDAV or Nextcloud workspace to select a file version,
retain its complete bytes, review the public columns, publish a dataset
merchant, prepare the customer, and receive every original handover file.
The browser, command line and merchant agent operate the same saved source,
capture, mapping, edition, merchant, publisher and customer records.

This standalone product includes the native WebDAV browser and Applications
entry, all 18 merchant tools, the complete typed client, reviewed-operation
journal, full resumable download writer, native source-packet receiving, and the
original publisher, seller, buyer and runtime installer. The installed
merchant-webdav-edition command composes an existing reviewed mapping and
merchant into the next complete edition and handover through those same APIs.

## Install the complete selected source

Use Linux, Node.js 22.16 or later, Python 3.11 or later linked to Expat 2.6 or
later, npm, Git and util-linux flock. The original native operator uses filesystem
locks, atomic replacement and fsync. Keep source, runtime, private operating
state and receiving directories separate. Private input files use mode 0600;
their parent directories use mode 0700.

Build the selected product from the exact source revision you want to install:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --ref ORIGINAL_COMMIT \
  --selection webdav-operator \
  --out /absolute/private/webdav-release
~~~

Retain the returned archive, SHA-256 and manifest. The original builder records
the selected Git revision, webdav-operator recipe, contribution declarations and
every packaged source file. Continue an interrupted build in that same output
with --resume. Its selected input remains the same; a different source or recipe
uses a new output directory.

The maintained runtime installer prepares the actual native payment and operator
dependencies:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/private/webdav-runtime \
  --archive /absolute/private/webdav-release/ORIGINAL.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/private/webdav-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/private/webdav-runtime --load --source
~~~

Use the actual archive path and hash returned by the builder. The installer
retains its chosen source, dependency declarations, lock, installation progress
and recovery state. Its maintained --adopt-existing path can receive an existing
dependency tree that satisfies the selected profile. The
[runtime installation guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md)
covers its complete profile, installation and reopening behavior.

Commands below use the installed starforge dispatcher. From a prepared runtime,
the equivalent invocation is:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/private/webdav-runtime -- merchant-webdav --help
~~~

For a source-only installation, install the returned archive with
npm install --ignore-scripts --offline --omit=optional ORIGINAL.tgz and use
npx --no-install starforge. Source-only capture, parsing and normal bearer HTTP
client operations use the original built-in Node/Python paths. Native merchant
payment and optional MCP transports use their declared runtime dependencies.

Inspect the actual installed registrations:

~~~sh
starforge source
starforge registrations --source webdav
starforge registrations --source webdav-product
starforge merchant-webdav tools
~~~

The original webdav contribution owns its native command, Applications entry,
operator command and five typed public interfaces. The webdav-product
contribution exposes the existing complete reviewed-edition composition and this
guide. The selection retains the native WebDAV, source-format, dataset publisher,
release and customer components, including their dynamically loaded browser and
Python files.

## Choose the original operating entry

| Entry | Use it for | Saved authority |
| --- | --- | --- |
| starforge webdav serve | Original local seven-view browser and native HTTP API | The selected private WebDAV workspace |
| Applications → WebDAV source and merchant workspace | Managed review, start, open, stop and reopen | The original runtime application and selected WebDAV workspace |
| starforge merchant-webdav | Remote operator, reviewed operations, all original tools and complete receiving | The same workspace through its authenticated merchant host |
| starforge merchant-webdav-edition | One retained mapping/merchant through next edition, native publisher preparation and full source/export receiving | The same original native IDs and one private continuation directory |

A WebDAV directory has one original writer lease. When the merchant host owns
it, the returned browser URL and all merchant tools share that instance. When
Applications owns it, use the browser returned by that managed launch. Close
the current owner before transferring the same directory to the other entry.

For a new browser workspace:

~~~sh
starforge webdav serve --directory /absolute/private/webdav-workspace --port 0
~~~

Open its returned local URL. Save the real source connection and review the
provider's collection. Stop that instance before selecting it in Applications
or a merchant connection. The original
[managed Applications guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/webdav/APPLICATIONS.md)
describes the complete review/start/open/stop sequence. It binds the original
workspace UUID and creation identity, complete native source, actual runtime,
Python and private environment input. Normal saved revisions remain in that
same workspace.

## Configure one merchant host

Copy the included
[connection example](../../stellar-forge/mcp-merchant-operator/webdav-workspace-connection.example.json)
into a private host directory. Give it the actual collection URL, canonical
private workspace paths and credential reference names. Its reports workspace
and files profile are local aliases; replace or extend them for the intended
operator. Populate the optional merchantProfiles, buyerWorkspaces and
sourcePackets maps when those original inputs are ready.

The source declaration retains credential environment-variable names. Supply
their values through the host's existing environment. Merchant terms retain the
actual network, asset, recipient, price and facilitator choices. Source packets
select the original file, byte count and SHA-256. The complete
[merchant configuration guide](../../stellar-forge/mcp-merchant-operator/WEBDAV.md)
gives their exact native shapes.

~~~sh
starforge merchant-webdav check-connection \
  --connection /absolute/private/webdav-connection.json

starforge merchant-webdav setup \
  --connection /absolute/private/webdav-connection.json \
  --directory /absolute/private/webdav-host \
  --output /absolute/private/webdav-agent-registration.json

starforge merchant-mcp serve \
  --config /absolute/private/webdav-host/merchant-mcp.json \
  --port 8788 --token-env MCP_ACCESS_TOKEN
~~~

Setup returns the original host configuration and standard stdio registration.
To merge it into an existing agent registration, supply --merge with that
private JSON and select --host-name when needed. Setup preserves existing
entries and rejects a conflicting name.

The following HTTP examples use the owned loopback host at
http://127.0.0.1:8788. A deployed client uses its existing HTTPS endpoint. Supply
the host token through MCP_ACCESS_TOKEN or select its actual reference with
--token-env. Open the configured workspace:

~~~sh
starforge merchant-webdav status --url http://127.0.0.1:8788
starforge merchant-webdav open --url http://127.0.0.1:8788 --workspace reports
~~~

Retain the returned native workspace UUID, revision, instanceId and browser URL.
Unscoped status also returns configured source/merchant profiles, runtime
selection, buyer aliases and source-packet aliases.

## Capture and review the actual source

Use the original browser's Source, Files and Captures views to save a source,
read its complete collection, select the actual file version and capture it.
The saved listing retains the original WebDAV XML, href, content length,
ETag and last-modified value. An interrupted file capture continues its original
capture UUID and verified prefix using the provider's native validators.

The remote operator retains the same decision before it is sent. For example,
a private source-input.json contains:

~~~json
{ "workspace": "reports", "profile": "files" }
~~~

~~~sh
starforge merchant-webdav prepare --url http://127.0.0.1:8788 \
  --tool merchant_webdav_source \
  --input /absolute/private/source-input.json \
  --directory /absolute/private/operations/source-selection

starforge merchant-webdav inspect-operation \
  --directory /absolute/private/operations/source-selection

starforge merchant-webdav run --url http://127.0.0.1:8788 \
  --directory /absolute/private/operations/source-selection
~~~

Prepare freezes the native operation UUID, complete input, endpoint, workspace
UUID, selected profile and reviewed revision. Run and reconcile retain that
same directory and original intent. The host checks the selected profile before
dispatch. An edited collection, merchant profile, runtime or buyer directory
therefore does not retarget the retained request.

Continue the following decisions in their own private operation directories.
Input JSON always includes workspace and the fields shown below. The
[complete client guide](../../stellar-forge/mcp-merchant-operator/WEBDAV_CLIENT.md)
and [native API contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/webdav/API_CONTRACT.md)
provide every input property, limit and original action.

| Decision | Native tool and reviewed input | Retained result |
| --- | --- | --- |
| Read the collection | merchant_webdav_catalogue; selected href/depth | Complete original listing and XML |
| Capture a selected version | merchant_webdav_capture; action=start and original selection | Capture ID, validator, complete bytes and receipt |
| Continue that capture | merchant_webdav_capture; action=resume and captureId | Same capture and verified prefix |
| Inspect source fields | merchant_webdav_capture; action=sample, format, captureId, recordsPointer when needed | Source count, original sample ordinals and fields |
| Save public projection | merchant_webdav_mapping; captureId, expectedCaptureSha256, projection | Saved mapping and projection hash |
| Build a reviewed edition | merchant_webdav_edition; action=build, mappingId, dataset, review | Complete dataset, snapshot and row count |
| Save merchant terms | merchant_webdav_merchant; editionId, profile, reviewer | Original merchant and exact configured terms |
| Export the edition | merchant_webdav_edition; action=export, editionId, merchantId, reviewer | Complete merchant/source export |

Use fields from the actual source sample. Preserve identifiers and monetary
text as strings unless the intended public dataset explicitly requires another
supported type. Review binds the captured bytes and exact projection. Dataset
filters, ranges, sorts, row and byte budgets use the original
[dataset API](../../stellar/scf-starforge-20261009/sf30-seller-sdk/DATASET_API.md).

The Preview view and merchant_webdav_preview query the retained edition.
Listing pagination reopens its original listing by source ID and listing ID;
it does not fetch the collection again.

## Compose the next reviewed edition and complete handover

For an existing mapping and merchant, the installed composition continues the
entire source-review-to-receiving path in one operation directory. Copy the
[reviewed input example](../../stellar-forge/mcp-merchant-operator/examples/webdav-reviewed-edition.example.json)
to a private file. Replace mappingId and merchantId with actual saved UUIDs,
select the intended workspace, reviewer and complete dataset contract, and
include projection only when changing the reviewed public field selection.

~~~sh
starforge merchant-webdav-edition \
  --url http://127.0.0.1:8788 \
  --input /absolute/private/reviewed-edition.json \
  --directory /absolute/private/reviewed-edition-work
~~~

The original composition reads the saved mapping, samples its original capture,
saves the selected mapping, builds and previews the next edition, exports it
with the selected original merchant terms, prepares its native publisher, and
receives every export member and a complete source packet. The result names the
native IDs and the complete receiving directories.

The private reviewed-input.json binds the endpoint, workspace UUID and full
authored input. Each step retains its original tool and business arguments.
After interruption, run the same command with the same private input and
directory. A pending native operation returns its actual saved operation;
continue that original operation before advancing the composition. Changing the
mapping, merchant, dataset, endpoint or field decisions creates a separate
reviewed workflow.

## Publish and prepare the customer

The Dataset/Merchant and Publisher/Customer browser views operate the original
publisher prepared from that complete export. Through MCP, select
merchant_webdav_publisher with action=publisher.prepare and
payload={exportId,title} when preparing it directly. Retain the returned
productId. Read its current native publisher and use the actual IDs/revisions
returned by its subsequent actions.

| Work | Original native actions |
| --- | --- |
| Review the editable dataset | publisher.status, publisher.preview, publisher.reviewDraft |
| Publish the reviewed dataset | publisher.publish, publisher.activateSnapshot, publisher.collect |
| Stage and select a native release | publisher.release.stage, inspect, activate, rollback |
| Run the selected release | publisher.release.start, publisher.release.stop |
| Inspect and prepare customer access | publisher.buyer.review, publisher.buyer.prepare |
| Continue a customer's original attempt | publisher.buyer.session, run, recover, account, export |

The [native publisher guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/socrata/PUBLISHING.md)
defines the complete payloads and generation checks. The WebDAV host supplies
its declared publisher runtime and resolves the selected buyer alias to that
existing private buyer workspace. Review the actual offer and budgets in the
original buyer flow before its paid request. Preparation, release readiness,
customer execution and settlement retain their separate native records.

## Receive every original file

Select a completed native merchant export:

~~~sh
starforge merchant-webdav plan-export --url http://127.0.0.1:8788 \
  --workspace reports --export-id ORIGINAL_EXPORT_UUID \
  --output /absolute/private/plans/merchant-export.json

starforge merchant-webdav download --url http://127.0.0.1:8788 \
  --plan /absolute/private/plans/merchant-export.json \
  --directory /absolute/private/received-merchant \
  --expected-sha256 ORIGINAL_PLAN_SHA256

starforge merchant-webdav inspect-download \
  --directory /absolute/private/received-merchant \
  --expected-sha256 ORIGINAL_PLAN_SHA256
~~~

Use the plan's returned digest for ORIGINAL_PLAN_SHA256. Its manifest binds
the original workspace, edition, merchant, snapshot, native manifest and every
declared file. The receiving directory contains complete dataset.csv,
dataset.json, source.json, seller.json, manifest.json and the native webdav
source closure. Completed bytes are hashed again on reopen. A transfer
interruption resumes the same plan and directory with verified partial prefixes.

For a source packet and selected customer files, write a private array of exact
native selectors, then use plan-files. For example:

~~~json
[
  {
    "name": "source-packet.zip",
    "selector": { "kind": "packet", "id": "ORIGINAL_PACKET_OPERATION_UUID" }
  },
  {
    "name": "customer/session.csv",
    "selector": {
      "kind": "publisher",
      "productId": "ORIGINAL_PRODUCT_UUID",
      "publisherKind": "session-csv",
      "id": "ORIGINAL_SESSION_ID"
    }
  }
]
~~~

~~~sh
starforge merchant-webdav plan-files --url http://127.0.0.1:8788 \
  --workspace reports --input /absolute/private/selected-files.json \
  --output /absolute/private/plans/source-customer.json

starforge merchant-webdav download --url http://127.0.0.1:8788 \
  --plan /absolute/private/plans/source-customer.json \
  --directory /absolute/private/received-source-customer \
  --expected-sha256 ORIGINAL_PLAN_SHA256
~~~

Use actual returned UUIDs. The selectors also support complete source
declarations, listing XML/JSON, captures, edition files, publisher drafts,
reviews, buyer files and retained operation results. The complete client guide
lists their original kinds. File transfer streams bytes to disk through the
maintained writer, retains its lease and checkpoints, and publishes a completed
receiving manifest after all selected files have arrived.

## Reopen the received source on another host

Restore a completed source-packet member through the original importer:

~~~sh
starforge merchant-webdav restore-source \
  --directory /absolute/private/received-source-customer \
  --file source-packet.zip \
  --destination /absolute/private/received-webdav-workspace \
  --python python3 --expected-sha256 ORIGINAL_PLAN_SHA256
~~~

The importer preserves original source, capture, mapping, edition, merchant and
export identities and creates the receiving workspace UUID. Repeating the same
restore reads the completed import receipt and current workspace revision.
Its source hash, byte count, workspace UUID and source-packet binding must
match. An incomplete import remains on its original receiving path.

Select that received directory in the new host's connection or managed
Applications entry. Open its retained edition and query it. The new host uses
its own declared runtime, credentials, publisher/release ownership and buyer
configuration. Keep original seller/buyer workspace backups with their normal
native receiving paths when those operating histories also belong in the
handover.

The host-side merchant_webdav_receive action can inspect or import an exact
declared sourcePackets alias into a closed receiving workspace. It returns the
same completed receipt when that packet was already received. Choose this
entry when the packet is already available to the destination host.

## Continue and close the original operation

Use reconcile against the same private operation directory when a response
was interrupted:

~~~sh
starforge merchant-webdav reconcile --url http://127.0.0.1:8788 \
  --directory /absolute/private/operations/source-selection
~~~

A completed native operation is read back with its original action, input and
canonical intent digest. Pending work retains that UUID. Source capture
resumption uses the original inactive operation with --resume. A reviewed
revision conflict can continue through --reviewed-revision after inspecting the
actual current state. Publisher/customer uncertainty uses the corresponding
original publisher, release or buyer recovery action.

Cancel an original source operation and close the actual owned workspace:

~~~sh
starforge merchant-webdav cancel --url http://127.0.0.1:8788 \
  --workspace reports --operation-id ORIGINAL_OPERATION_UUID

starforge merchant-webdav close --url http://127.0.0.1:8788 \
  --workspace reports --instance-id ORIGINAL_INSTANCE_UUID
~~~

Close drains accepted operations, cancels owned source requests, closes the
publisher instances owned by that workspace and releases its original writer.
A new open retains the same source and history and returns its new listener
instance. Existing received files remain available offline.

## Public client interfaces and source lineage

Installed consumers use these package exports:

| Export under @tokenjunkielabs/starforge-merchant | Interface |
| --- | --- |
| merchant/mcp/webdav/client | Complete original tool client and pagination |
| merchant/mcp/webdav/operations | Prepare, run, reconcile and inspect retained operations |
| merchant/mcp/webdav/download | Plan, download, inspect and restore complete receiving |
| merchant/mcp/webdav/setup | Prepare the original merchant and agent registration |
| merchant/mcp/webdav/cli | Complete command-line entry |
| merchant/mcp/webdav/reviewed-edition | Original complete reviewed-edition composition |

The native provider and Applications implementation are the original 543F
WebDAV product. This standalone adoption carries the complete 7E4E client from
[public source PR2050](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2050),
merged at 7ba091229f268777abf265fcb7dccd8c581ee4d7, including its original native
intent and profile binding, retained file transport and same-destination restore.
The standalone package manifest identifies the selected product revision and
its exact installed files.

The full [native workspace guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/webdav/README.md),
[managed Applications guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/webdav/APPLICATIONS.md),
[merchant host guide](../../stellar-forge/mcp-merchant-operator/WEBDAV.md) and
[complete client guide](../../stellar-forge/mcp-merchant-operator/WEBDAV_CLIENT.md)
remain the source references for detailed configuration, limits and receiving.
