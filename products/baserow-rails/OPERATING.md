# Operate Baserow source, customer and Rails editions

This guide follows one selected Baserow source into a customer's Rails
application. Use the [receiving guide](RECEIVING.md) first when preparing the
selected installation or continuing a completed original source operation.

The examples use declared absolute host paths and identifiers returned by the
original source or publisher. Keep one request UUID and output directory for
each selected operation. The existing commands reopen those records on retry.

## 1. Open the source workspace

The source application needs Linux, Node 24, util-linux flock and a private
filesystem supporting file locks, atomic rename and fsync. Keep its project
outside the source checkout.

~~~sh
starforge baserow-rails workspace init \
  --directory "$BASEROW_PROJECT"

starforge baserow-rails workspace serve \
  --directory "$BASEROW_PROJECT" \
  --connections "$BASEROW_CONNECTIONS" --port 0
~~~

The server prints its private loopback URL. A READY installed runtime can open
the same initialized project through **Applications → Baserow source
authoring**. Its application settings select the project and optional connection
file; the original launcher retains the reviewed runtime/source and workspace
identity.

A connection file is a map of aliases. These are the native connection keys:

~~~json
{
  "sharedGrid": {
    "label": "Selected public grid",
    "server": "https://api.baserow.io",
    "kind": "public-grid",
    "pageSize": 50,
    "requestIntervalMs": 250
  },
  "teamTable": {
    "label": "Selected team table",
    "server": "https://api.baserow.io",
    "kind": "table",
    "tokenEnv": "BASEROW_READ_TOKEN",
    "pageSize": 100
  }
}
~~~

Set the actual server, including an existing reverse-proxy path. A protected
public grid uses its existing publicTokenEnv reference; a table uses tokenEnv.
Values remain in the host environment. The connection file is private and its
aliases are the browser's choices. The [original source workspace
guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/baserow/workspace/README.md)
documents native limits and local/self-hosted endpoints.

For an already retained source, omit the connections option and use **Capture
source → Import an existing complete observation**. The original packet keeps
opening/closing metadata, all row pages and retained file bytes.

## 2. Select the complete source and field mapping

In **Capture source**, choose the alias and actual public slug or table ID.
A table may select its original view ID. Enter the actual search/filter
definition and inspect metadata before choosing fields and sort order.

The saved projection uses provider field identities such as field_123 and
explicit customer aliases. Include the original record identity:

~~~json
{
  "record_id": {
    "source": "$recordId",
    "type": "string",
    "encoding": "identity-text",
    "nullable": false
  }
}
~~~

Use the actual native field IDs and types for the remaining columns. The
projection choices preserve different source meanings:

| Source value | Suitable explicit projection | Application treatment |
| --- | --- | --- |
| Native row ID | Identity text, non-nullable | Stable source key |
| Original decimal or integer token | Number text | Exact text or a reviewed exact decimal/integer conversion |
| Text including empty strings | Non-nullable text when empty must remain text | Keep the chosen empty/null policy |
| Original absent/null value | Nullable value with the declared policy | Explicit target null handling |
| Related rows, multi-selects, structured values | JSON text | Complete original structure retained in source data |
| A native File field | String with Attachments encoding | Original file metadata plus complete selected file receiving |
| Source ordering | Original $order as identity text when required | Retained ordering independent of a display name |

The source editor and publisher use the original CSV/null contract. If an empty
source string should become null, choose **Use null**. To retain an empty string
as text, use a non-nullable Text column. Every original row page remains part of
the captured source.

For file receiving, choose **Retain original file bytes** and enter the actual
observed storage origins. The source uses each file object's returned URL and
retains all original row/field/index references. A file projected under two
customer aliases keeps both links while its byte payload is stored once.

Select **Capture every selected page**. Inspect every retained row and the
retained-file pages, save the projection, then **Validate every row**. Retain the
reviewer, note and selected source version through **Freeze and select source
version**. The version's source/capture hashes and projection stay attached to
its publisher plans.

## 3. Publish the selected edition

Use **Publish & operate → Open original publisher**. Configure its actual dataset
query, projected columns, filters and limits. Extract the complete candidate,
review it and publish that candidate.

The original publisher retains:

- Source version and source hash.
- Plan ID and plan digest.
- Extraction run and complete source/candidate files.
- Candidate digest, dataset snapshot and native query definition.
- Reviewer and published revision.
- Optional original merchant terms, release and buyer handoff.

Its complete interface is the [maintained publisher
guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/postgres/publisher/README.md).
The Baserow driver supplies the original source to that engine.

The source-backed customer packet below uses an existing published candidate.
For a paid merchant, use the same workspace's original package review,
preparation, SF82 release stage/activation and buyer handoff. Merchant settings
and payment choices stay in that original flow.

## 4. Prepare the customer packet

Retain the actual published run, candidate SHA-256 and snapshot from step 3.
Close the publisher's current browser/CLI owner before this separate CLI opens
the same publisher directory. An embedding application already holding the
publisher can call prepareBaserowCustomer with that original object.

~~~sh
starforge baserow-rails customer prepare \
  --publisher "$ORIGINAL_PUBLISHER" \
  --run "$PUBLISHED_RUN_ID" \
  --candidate-sha256 "$PUBLISHED_CANDIDATE_SHA256" \
  --snapshot "$PUBLISHED_SNAPSHOT" \
  --customer-key "$CUSTOMER_KEY" \
  --request-id "$CUSTOMER_REQUEST_UUID" \
  --out "$CUSTOMER_PACKET" \
  --result "$CUSTOMER_RESULT_JSON"
~~~

The optional **--query** is the native published query string. Include the
record identity column. The exporter retains the selected query and snapshot
and follows all original cursors to the complete terminal result.

Keep **customer-manifest.json** and the result's manifestSha256. The packet
contains the source selection, original field definitions and edition IDs,
complete dataset pages and row files, and every selected original attachment.

~~~sh
starforge baserow-rails customer inspect \
  --directory "$CUSTOMER_PACKET" \
  --manifest-sha256 "$CUSTOMER_MANIFEST_SHA256"

starforge baserow-rails customer resume --directory "$CUSTOMER_PACKET"
~~~

Resume uses the existing operation record and files. A different source or
query belongs to a new customer operation.

## 5. Export the complete customer client

The original exporter packages all current Ruby/Rails source and operator
templates, the Baserow adapter, its CLI and full application continuation.

~~~sh
starforge baserow-rails client export --out "$CUSTOMER_SOURCE"
starforge baserow-rails client inspect --directory "$CUSTOMER_SOURCE"
~~~

Use **client export --help** for the current source/export arguments, and
**client copy** or **client resume** for its original receiving operations.
The original source selection is retained before the package files. The
completed outer manifest is **baserow-ruby-client.json**; it binds the complete
native Ruby package and the Baserow files.

## 6. Receive rows and files in Ruby

Select the original receiving host's absolute Ruby, Python and Node executable
paths. Preserve a Python environment's selected path, including its venv
directory. The original receiver retains those paths with its source and
request. The complete customer continuation in [RECEIVING.md](RECEIVING.md)
runs this flow through the managed private Ruby bundle. The direct commands
below use the current application's configured compatible Ruby environment.

The product command forwards to the original Ruby customer CLI:

~~~sh
starforge baserow-rails receive --ruby "$RUBY" -- receive \
  --package "$CUSTOMER_PACKET" \
  --manifest-sha256 "$CUSTOMER_MANIFEST_SHA256" \
  --directory "$RECEIVING_JOB" \
  --dataset-id "$CUSTOMER_DATASET_ID" \
  --checkout "$INSTALLED_SOURCE" \
  --python "$ORIGINAL_PYTHON" --node "$ORIGINAL_NODE"

starforge baserow-rails receive --ruby "$RUBY" -- status \
  --directory "$RECEIVING_JOB"

starforge baserow-rails receive --ruby "$RUBY" -- resume \
  --directory "$RECEIVING_JOB"
~~~

INSTALLED_SOURCE is the complete installed source root containing stellar/ and
stellar-forge/. For a source checkout it is the checkout root. The receiving
job keeps the copied source, original native receiving record and compound
completed delivery. Its **received/baserow-delivery.json** binds both the
Baserow packet and Ruby dataset.

~~~sh
starforge baserow-rails receive --ruby "$RUBY" -- copy \
  --directory "$RECEIVING_JOB" --out "$DELIVERED_CUSTOMER"

starforge baserow-rails receive --ruby "$RUBY" -- inspect \
  --delivery "$DELIVERED_CUSTOMER" \
  --manifest-sha256 "$RUBY_CUSTOMER_MANIFEST_SHA256"
~~~

The completed delivery reopens without another source capture or native scan.
The [customer API
guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/baserow/customer/README.md)
also gives complete row, original-file and attachment commands.

## 7. Configure the Rails application

The [Rails importer setup](../../stellar/scf-starforge-20261009/sf30-seller-sdk/developer/ruby-client/examples/rails_dataset/README.md)
includes the complete migration, models, mapping, job and commissioning CLI.
Use the application's existing authenticated account and target relation.
The application declares the target model, tenant scope, stream, key columns,
column conversions and removal policy.

The [operator integration
guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/developer/ruby-client/examples/rails_dataset/operator/README.md)
contains the complete controller, routes, workspace resolver, job and view setup.
The application registers received sources and their manifest hashes. Browser
requests select those configured entries.

A customer delivery supplies the original dataset directly:

~~~ruby
customer = Starforge::BaserowCustomerDelivery.open(
  directory: configured_delivery_directory,
  expected_manifest_sha256: configured_manifest_sha256
)

importer = Starforge::RailsDataset.new(
  delivery: customer.dataset,
  scope: current_account.catalog_items,
  stream: retained_stream_for_current_account,
  models: {
    edition: DatasetEdition,
    row: DatasetEditionRow,
    entry: DatasetEntry
  },
  mapping: reviewed_mapping
)
~~~

In the operator:

1. Select the declared source. Its complete received copy belongs to that review.
2. Prepare and read every change category. Pages preserve exact before/after
   values, source row and key.
3. Download the complete JSON/CSV preview when needed.
4. Approve the exact saved preview and run the original import job.
5. Read the committed receipt, every edition and original attachment.
6. Refresh the source to prepare a new review against the current target state.

The importer applies the target rows, current source keys, immutable edition and
original receipt in one database transaction. A repeated business operation
reopens its existing receipt. Source/query membership and target scope remain
bound across editions; complete-snapshot removal decisions use that same
membership. Default removal handling retains target records with their original
removal state. An explicit archive-column policy is available.

## 8. Open and hand over the complete application

The original whole-source continuation in [RECEIVING.md](RECEIVING.md) creates
the complete commissioning application and verifies its copied recipient.
Register that complete delivered directory through **Ruby environments →
Applications**, or use the installed command:

~~~sh
starforge ruby-runtime register --directory "$RUBY_RUNTIME" \
  --id customer-app --title "Customer data" --environment-id customer \
  --application-directory "$DELIVERED_APPLICATION" \
  --request-id "$APPLICATION_REQUEST_UUID" --wait

starforge ruby-runtime launch --directory "$RUBY_RUNTIME" \
  --id customer-app --operation-id "$APPLICATION_LAUNCH_UUID" --port 9292
~~~

Open the current returned address. The managed runtime copies and operates the
complete original application in its own working directory, keeps the exact
private bundle and original Rails authentication, and retains startup, stop and
output. Existing production applications keep their own authentication, routing
and durable ActiveJob configuration.

**Verify stopped application** checks every mapped current target value and
edition receipt. **Export environment and stopped application** includes the
complete source, lock, dependency cache, database and files. The receiving desk
or command installs that archive offline on a compatible Ruby host and opens
its independently received working copy. The [receiving guide](RECEIVING.md)
provides the complete commands and original-customer continuation.

An existing configured Ruby application can also use the original direct
starforge baserow-rails operator command and its retained access-key file.

Deliver the complete source client and the full customer/application folders.
Keep the manifests, original source/version/query identities and complete result
with the handover. The application receiver verifies the actual saved database
receipt and every current target value after a directory move.

## 9. Receive the next data edition into the working application

Open the existing **Ruby customer commissioning** desk and choose **Data
editions**. Select the original application and stop its running Rails listener.
Choose the completed native packet containing **dataset-customer.json** or the
complete Baserow packet containing **baserow-delivery.json**. Those are the
actual outputs of the customer receiving workflow above.

**Read selected source** shows its original manifest, dataset/query identity,
row count and projected fields. Retain the returned complete manifest SHA.
Choose an edition ID, title and actual operator identity, then **Receive packet
and prepare complete preview**. The native worker copies every original file
and builds the original Rails preview against the application's current stream.

Read all changes and the complete preview files before choosing **Commit this
exact preview**. The original importer verifies the selected preview and applies
its target changes, key state, immutable edition and receipt in one transaction.
The app keeps its original mapping, tenant scope, logical source/query, exact
numeric/null rules and removal policy.

If the working data changed after the preview, use **Prepare another review**
with a new retained review UUID. The previous review stays available with its
original source and digest. If the connection or worker was interrupted, read
and resume the same original operation.

The installed CLI exposes the same complete workflow:

~~~sh
starforge ruby-application-editions source \
  --format baserow --source-directory "$NEXT_RECEIVED_CUSTOMER"

starforge ruby-application-editions stage \
  --directory "$RUBY_RUNTIME" --input "$STAGE_EDITION_REQUEST" --wait

starforge ruby-application-editions show \
  --directory "$RUBY_RUNTIME" --id "$APPLICATION_ID" \
  --edition-id "$EDITION_ID"

starforge ruby-application-editions commit \
  --directory "$RUBY_RUNTIME" --input "$COMMIT_EDITION_REQUEST" --wait
~~~

The [complete stage and commit request shapes](../../stellar/scf-starforge-20261009/distribution/ruby-runtime/editions/README.md#complete-cli-lifecycle)
retain the application and edition IDs, original review/operation UUIDs,
operator identity and exact source/preview hashes. Their complete source,
JSON/CSV preview, original change records and committed receipt are available
through the desk, the file command and the connected client.

Verify and launch the updated application with the existing runtime controls.
The application's original operator resolves its current source from the
committed SQL edition and retained review. Its current dataset, complete history
and applicable attachment links therefore follow the accepted revision.

To hand over that updated application, stop and export it through the existing
runtime. The full archive contains every received data packet, original review,
receipt and mapping together with the current database, client, lock and cached
dependencies. The receiving runtime verifies the current mapped target values
and original receipt history at the new location.

An environment created before data-edition support retains its original
immutable support selection. Use its existing stopped export, then receive that
archive with the current installed runtime before staging a new edition. The
original application and data history travel through that normal receiving path.

## 10. Automate the original customer and edition workflow

The [connected client and MCP front door](../../stellar/scf-starforge-20261009/distribution/ruby-runtime/connected/README.md)
opens the same private managed directory. Its local JavaScript client and MCP
clients use the original runtime methods, customer selections, application
streams, reviews and operation records.

| Work | Existing connected methods |
| --- | --- |
| Inspect and install the selected Ruby environment | inspect, probe, create, start, operation, log |
| Commission or adopt an original customer | previewSource, previewExisting, selectCustomer, adoptCustomer, advanceCustomer |
| Receive and review the next complete source edition | previewApplicationEditionSource, stageApplicationEdition, applicationEdition |
| Review again after working data changes | prepareApplicationEdition |
| Commit the exact approved preview | commitApplicationEdition |
| Read all retained data editions | applicationEditions, applicationEdition |
| Launch, stop, verify and export the current application | application, launchApplication, stopApplication, start |
| Receive the complete archive on another host | receive or the client's streamed uploadFile |
| Receive original source, review, receipt and log bytes | openTransfer, readTransfer, closeTransfer or the client's complete downloadFile |

Retain the complete selected request and its operation UUID before calling a
mutation. Poll that original operation for its native result. A reconnect reuses
the same ID and arguments; a new actual source selection gets its own retained
edition and review. The original actor and exact approved preview SHA travel
through commit.

To download an edition's complete file, select **kind: edition**, the
application ID, edition ID and original filename. Include the review ID for
preview or receipt files. The returned original byte count and SHA bind the
whole transfer. The client continues a partial download from its saved byte
cursor and verifies the complete selected file before completion.

The 37 tool definitions include the six original data-edition operations.
Local application callers use openRubyConnectedClient with their declared
private runtime directory. An agent attaches through the installed stdio or
authenticated HTTP MCP entry described in the connected guide. Both use the
selected installation's existing MCP dependency profile.

Run the same installed client directly, or create the agent's original stdio
configuration from the selected source:

~~~sh
starforge ruby-runtime-agent tools

starforge ruby-runtime-agent config \
  --directory "$RUBY_RUNTIME" --output "$RUBY_MCP_CONFIGURATION"

starforge ruby-runtime-agent call stageApplicationEdition \
  --directory "$RUBY_RUNTIME" --input "$STAGE_EDITION_REQUEST" \
  --output "$STAGE_EDITION_RESULT"

starforge ruby-runtime-agent wait \
  --directory "$RUBY_RUNTIME" --operation-id "$STAGE_OPERATION_UUID" \
  --output "$STAGE_OPERATION_RESULT"

starforge ruby-runtime-agent call commitApplicationEdition \
  --directory "$RUBY_RUNTIME" --input "$COMMIT_EDITION_REQUEST" \
  --output "$COMMIT_EDITION_RESULT"
~~~

The stage and commit input files are the same complete requests from section 9.
STAGE_OPERATION_UUID is the literal operationId already saved in that stage
request. Poll the commit's own original operation UUID in the same way. The
generated configuration contains the agent's **mcpServers** entry, with the
absolute selected Node/server paths and original private directory.

An application can also attach to the original authenticated loopback server:

~~~sh
starforge ruby-runtime-mcp serve \
  --directory "$RUBY_RUNTIME" --port 8476 \
  --token-file "$RUBY_MCP_TOKEN_FILE" --startup-json
~~~

Its startup record contains the exact MCP URL and retained token-file path.
The [connected guide](../../stellar/scf-starforge-20261009/distribution/ruby-runtime/connected/README.md)
gives the typed local client, stdio/HTTP connection shapes and the separate
**--connection** file format accepted by operating CLI commands.

For a complete retained edition file, save the selected original file descriptor
as EDITION_FILE_SELECTOR: **kind** is **edition**, **id** is the original
application ID, **editionId** is the selected data edition, and **name** is its
actual filename. Include the original **reviewId** for preview or receipt files.
Use the exact hash returned for that file:

~~~sh
starforge ruby-runtime-agent download \
  --directory "$RUBY_RUNTIME" --transfer-id "$EDITION_FILE_TRANSFER_UUID" \
  --source "$EDITION_FILE_SELECTOR" --sha256 "$EDITION_FILE_SHA256" \
  --out "$EDITION_FILE_RECEIVING_DIRECTORY" \
  --output "$EDITION_FILE_RECEIVING_RESULT"
~~~

The private output retains the original transfer selection, durable byte cursor,
complete file and receiving result. Repeat this command with the same UUID,
selector and output after a lost connection; the completed file is checked
against its original byte count and SHA.

## Recovery choices

| Original work | Continue |
| --- | --- |
| Source capture or reviewed edit | Read its saved request; use workspace operation/resume for that UUID |
| Customer packet | customer resume with the original output |
| Ruby client package | client resume with the original source output |
| Ruby receiving job | receive … resume with the original job |
| Rails preview/import | Reopen the saved review/business operation and original receipt |
| Later managed data edition | Reopen its original edition, review and runtime operation; resume that UUID |
| Connected file download or runtime upload | Reopen the retained transfer or receiving operation and continue at its durable byte offset |
| Full application continuation | commission … resume with the original phase |
| Complete copied application | Original operator Commission.reopen API, or the managed fixed customer entry with the original reopen arguments |
| Managed private Ruby installation or application export | ruby-runtime operation/resume with its original UUID |
| Runtime archive upload and receiving | Reopen the same saved transfer and native receiving UUID |
| Running managed application | Its saved current operation, Stop, then original application state |

The [full source contracts](../../stellar/scf-starforge-20261009/sf30-seller-sdk/baserow/customer/README.md#api-reference)
identify exact manifests, file limits, logical membership and error codes.

## Commission the original source through one customer desk

Open the installed **Ruby customer commissioning** Applications card, or use the
same private runtime directly:

~~~sh
starforge ruby-customer-workspace serve \
  --directory /absolute/private/ruby-runtime --create --port 8475 --startup-json
~~~

The Customers view reviews an original finalized native room or completed
Baserow publication. Inspect the original manifest and semantics, choose its
actual native key or Baserow customer selection, and retain the exact source
hash, original source/runtime paths and output directory. The selected Ruby
environment and complete bundle remain in the Environments view.

If the customer program already ran, choose **Open existing customer** and its
original output directory. The desk reads the saved lifecycle input and pins its
exact file hash. It reuses the original matching customer operation and
application registration, including their literal arguments and UUIDs.

**Commission and receive application** continues the original native program and
receives its complete application. The final receipt is retained before the
customer becomes Ready. The original result, selected metadata and source files
are available as complete downloads. Applications, Operations and Receive expose
the same native launch, stop, full log, export and archive receiving controls.

The native receiving source includes CKAN, OData, Superset and Directus semantics.
Provider protocol/base/query identity stays in the original logical stream;
capture and snapshot identities stay with their original edition. The installed
client uses C271's maintained native reader and common source-meaning receiver.

The [complete customer workspace guide](../../stellar/scf-starforge-20261009/distribution/ruby-runtime/customer/README.md)
contains both source forms, exact JavaScript/HTTP/CLI interfaces, all restart
phases and full-file receiving. Its executable customer-workspace continuation
adopts the existing completed managed journey, reads the real authenticated desk
and original result files, and reopens the same customer. Use that continuation
with the original managed receiving directory and existing owner.
