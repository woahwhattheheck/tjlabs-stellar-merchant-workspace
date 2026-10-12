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
request. Ruby/Bundler inherits the current application's normal environment.

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
Open that application with the installed product:

~~~sh
starforge baserow-rails operator --ruby "$RUBY" -- \
  --directory "$DELIVERED_APPLICATION" --port 9292
~~~

The original Rails installer binds loopback and reads the application's retained
private access-key file. It serves the original operator and its received
database/source. Existing production applications keep their own authentication,
routing and durable ActiveJob configuration.

Deliver the complete source client and the full customer/application folders.
Keep the manifests, original source/version/query identities and complete result
with the handover. The application receiver verifies the actual saved database
receipt and every current target value after a directory move.

## Recovery choices

| Original work | Continue |
| --- | --- |
| Source capture or reviewed edit | Read its saved request; use workspace operation/resume for that UUID |
| Customer packet | customer resume with the original output |
| Ruby client package | client resume with the original source output |
| Ruby receiving job | receive … resume with the original job |
| Rails preview/import | Reopen the saved review/business operation and original receipt |
| Full application continuation | commission … resume with the original phase |
| Complete copied application | commission … reopen, or the original operator Commission.reopen API |

The [full source contracts](../../stellar/scf-starforge-20261009/sf30-seller-sdk/baserow/customer/README.md#api-reference)
identify exact manifests, file limits, logical membership and error codes.
