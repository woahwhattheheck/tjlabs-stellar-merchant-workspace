# Receive and operate the complete Baserow to Rails product

This is the installed continuation of the original source and customer workflow.
The product archive contains the Baserow authoring workspace, original publisher,
SF100/Python receiver, Ruby client, transactional Rails importer and complete
operator views. Customer captures, source credentials, application database and
received files stay in their existing private directories.

Use the same selected source, run and customer IDs through the operation. The
original workspace and application commands retain incomplete work and resume
from their saved requests.

## Build the selected source

Use a checkout containing the exact reviewed standalone commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo "$CHECKOUT" --ref "$SOURCE_COMMIT" \
  --selection baserow-rails --out "$PRODUCT_RELEASE"
~~~

The original builder returns the archive path and SHA-256. Its original manifest
records the complete commit, source selection, contribution declarations and
every included file. The recipe is
[distribution/selections/baserow-rails.json](../../stellar/scf-starforge-20261009/distribution/selections/baserow-rails.json).
It includes the complete Ruby support inventory, all fourteen Rails operator
files, native Python receiver modules and original browser assets.

A retained build continues with its existing output:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo "$CHECKOUT" --out "$PRODUCT_RELEASE" --resume

node stellar/scf-starforge-20261009/distribution/build.mjs \
  --out "$PRODUCT_RELEASE" --status
~~~

Use a new output for another commit or product. An omitted selection on resume
inherits the original selection. The builder's normal completed-output recovery
reopens the same archive.

## Install the original runtime

The existing installer supports Linux, Node 22.16 or later, Python 3.11 or later,
npm and flock. Use the original archive and digest returned above:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir "$CUSTOMER_RUNTIME" --archive "$PRODUCT_ARCHIVE" \
  --sha256 "$PRODUCT_ARCHIVE_SHA256" --native \
  --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir "$CUSTOMER_RUNTIME"

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir "$CUSTOMER_RUNTIME" --load --source

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir "$CUSTOMER_RUNTIME" -- baserow-rails --help
~~~

The runtime retains its original dependency profile, lock, installation history,
source identity and READY state. Its inspection reports the installed source
root used as **INSTALLED_SOURCE** below. That root contains **stellar/** and
**stellar-forge/**. Run the product through the installer above, or use its
installed **starforge** executable in the same configured runtime environment.

For an interrupted installation use the original **resume --dir** command.
The maintained installer also supports an existing compatible dependency tree,
offline cache and full runtime transfer; see the
[runtime installation guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md).

## Select and install the private Ruby environment

The host supplies its actual Ruby 3.1-or-newer executable and the development
tools needed by native gems. The managed environment retains that executable's
identity, installs the selected Bundler privately, resolves and saves one exact
Gemfile.lock, and installs the original client and Rails dependencies. It caches
the full Bundler gem and dependency sources for later offline receiving.

~~~sh
starforge ruby-runtime probe --ruby "$RUBY"
starforge ruby-runtime init --directory "$RUBY_RUNTIME"

starforge ruby-runtime create --directory "$RUBY_RUNTIME" \
  --id customer --title "Baserow customer" --ruby "$RUBY" \
  --bundler-version "$BUNDLER_VERSION" --request-id "$ENVIRONMENT_REQUEST_UUID"

starforge ruby-runtime install --directory "$RUBY_RUNTIME" \
  --id customer --operation-id "$INSTALL_OPERATION_UUID" --wait

starforge ruby-runtime serve --directory "$RUBY_RUNTIME" --port 0
~~~

Choose a Bundler version supported by the actual selected Ruby. The default
project includes Rails/ActiveRecord/ActiveJob, SQLite, Nokogiri, BigDecimal,
Rackup and Puma. An existing application can supply its complete project and
Gemfile through create --project-directory and --gemfile. The original lock is
retained when present. Read the complete selected Gemfile, lock and installation
result in the environment desk.

RUBY_RUNTIME is this customer's private managed Ruby directory; it is distinct
from the source installation and the original source/customer directories.
Retain one UUID for each selected create, installation and customer operation.
The original runtime continues an interrupted operation through resume with
that same UUID and preserves its complete output.

The existing Runtime Applications catalog also opens this initialized
directory through **Ruby environments**. Its second card opens a registered
**Received Rails application**. Both use the original managed launcher and
its retained startup/stop history. The [complete runtime
guide](../../stellar/scf-starforge-20261009/distribution/ruby-runtime/README.md)
documents the current source, cache, lock and application APIs.

An existing application may continue using its configured compatible bundle
with the direct original baserow-rails commands below. Its selected versions and
executable paths remain part of that original host operation.

**RUBY**, **ORIGINAL_PYTHON** and **ORIGINAL_NODE** are absolute selected
executables. Preserve a language environment's selected path. The product
launcher inherits the host's environment and passes the original arguments to
that executable.

## Open the original source workspace

The original Runtime Applications catalog includes **Baserow source authoring**.
Use the runtime workspace to attach this READY runtime and configure the
existing private source project:

~~~sh
starforge runtime-workspace init \
  --workspace "$RUNTIME_WORKSPACE" --runtime-home "$RUNTIME_HOME"

starforge runtime-workspace attach \
  --workspace "$RUNTIME_WORKSPACE" --runtime "$CUSTOMER_RUNTIME" \
  --label "Baserow customer runtime"

starforge runtime-workspace serve --workspace "$RUNTIME_WORKSPACE"
~~~

An existing runtime workspace uses its original directory. In Applications,
select the Baserow card, choose the original source workspace, save the reviewed
configuration, and start/open that saved application. The original launcher
retains startup, output, stop and recovery history.

The direct installed workspace command remains available:

~~~sh
starforge baserow-rails workspace serve --directory "$BASEROW_WORKSPACE"
~~~

Use [OPERATING.md](OPERATING.md) for the complete source connection, field
projection, original file retention, publication and customer selection.
The source workspace's existing packet import also reuses a complete previously
captured source.

## Continue an existing complete native Baserow run

The maintained
[whole customer continuation](../../stellar/scf-starforge-20261009/sf30-seller-sdk/baserow/customer/lifecycle.rb)
consumes the original completed Baserow source/workspace journey. Its
**native-result.json** already selects the real captured source, workspace,
versions and publisher candidate. The command continues that exact original
public-catalog operation into a customer and complete Rails application:

~~~sh
starforge ruby-runtime run --directory "$RUBY_RUNTIME" \
  --id customer --entry baserow-customer-lifecycle \
  --operation-id "$CUSTOMER_EXECUTION_UUID" --wait -- \
  run --native-run "$ORIGINAL_COMPLETED_BASEROW_RUN" \
  --out "$CUSTOMER_PHASE" \
  --source-ref "$SOURCE_COMMIT" \
  --checkout "$INSTALLED_SOURCE" \
  --python "$ORIGINAL_PYTHON" --node "$ORIGINAL_NODE" \
  --customer-key "$ORIGINAL_CUSTOMER_KEY" \
  --dataset-id "$ORIGINAL_DATASET_ID"
~~~

Add **--query "$ORIGINAL_QUERY"** only when selecting that actual original
published query. Preserve the first retained selection on a repeated command.
The output must be a private application phase outside the installed source and
original source-run directory.

This one continuation performs the full application journey:

1. Read the original native result and retain its selected source, capture,
   published candidate and snapshot.
2. Prepare the complete customer packet from that original publication.
3. Export the full Ruby/Baserow/Rails client and receive every native row through
   the existing Python/Node finalized-room receiver.
4. Receive every original file and preserve all row/output-alias links.
5. Create the configured private Rails application, retain its full review,
   preview every change, and commit the original receipt with target rows.
6. Exercise the actual authenticated Rails pages, CSRF forms, background-job
   path, complete JSON/CSV downloads, receipt, history and attachment downloads.
7. Copy the complete source client, customer and application. Reopen the
   application in a fresh process while original producer directories are
   temporarily unavailable. Compare its actual current target values with the
   original source, as well as its receipt and complete file hashes.
8. Save the completed native result only after those receiving phases finish.

The program restores the producer directories on completion or cancellation.
A restarted operation restores an interrupted original parking phase before
continuing. Its completed reopen uses the independently delivered source and
application.

Use the existing operation after an interruption:

~~~sh
starforge ruby-runtime operation --directory "$RUBY_RUNTIME" \
  --operation-id "$CUSTOMER_EXECUTION_UUID"

starforge ruby-runtime resume --directory "$RUBY_RUNTIME" \
  --operation-id "$CUSTOMER_EXECUTION_UUID" --wait

starforge ruby-runtime run --directory "$RUBY_RUNTIME" \
  --id customer --entry baserow-customer-lifecycle \
  --operation-id "$CUSTOMER_REOPEN_UUID" --wait -- \
  reopen --directory "$CUSTOMER_PHASE"
~~~

Keep the returned result and the complete application handover together:

| Retained path in the phase | Purpose |
| --- | --- |
| lifecycle-input.json | Exact original run/result, selected executables, publication and customer identity |
| source-packet.json | Original prepared customer packet descriptor |
| client-package.json | Complete original generated source-client descriptor |
| delivered-client/ | Independently copied complete client, Rails importer, operator source and templates |
| delivered-customer/ | Complete Baserow source packet, native dataset and original attachment files |
| delivered-application/ | Received SQLite application, configured mapping, original source copy, reviews and history |
| operator-result.json | Complete authenticated application journey and relative application file manifest |
| native-result.json | Completed original customer result, file links and complete receiving identities |

Actual counts, source IDs, bytes, hashes and phase results come from those
returned files. Retain the original stderr and exit status if a host or
dependency error interrupts the operation; the next invocation uses that same
saved phase.

## Operate the received application

Register the complete delivered application in the installed environment. For
the original Baserow continuation, DELIVERED_APPLICATION is the retained
CUSTOMER_PHASE/delivered-application directory.

~~~sh
starforge ruby-runtime register --directory "$RUBY_RUNTIME" \
  --id customer-app --title "Customer data" --environment-id customer \
  --application-directory "$DELIVERED_APPLICATION" \
  --request-id "$APPLICATION_REQUEST_UUID" --wait

starforge ruby-runtime launch --directory "$RUBY_RUNTIME" \
  --id customer-app --operation-id "$APPLICATION_LAUNCH_UUID" --port 9292

starforge ruby-runtime application --directory "$RUBY_RUNTIME" --id customer-app
~~~

Open the returned private application URL, or open the same saved application
through the environment desk or the **Received Rails application** catalog card.
Its URL appears after the actual Puma listener and authenticated HTTP response.
The complete application lives in its own managed working directory; its
original received source and database remain retained.

The operator displays saved source reviews, every preview category, exact import
jobs, committed editions and original files. Its existing Rails authentication
and CSRF behavior remain active. A production Rails application installs these
same controllers under its configured account scope and durable job queue.

The direct original command remains available to a host with its own configured
compatible Ruby bundle:

~~~sh
starforge baserow-rails operator --ruby "$RUBY" -- \
  --directory "$DELIVERED_APPLICATION" --port 9292
~~~

That direct local server uses username **operator** and the application's
retained private access-key file.

For a customer with a complete delivery but no original public-catalog run,
prepare the application directly through the original API:

~~~ruby
require "/absolute/client/baserow/customer/baserow_customer_receiving"
require "/absolute/client/developer/ruby-client/examples/rails_dataset/operator/commission"

Starforge::DatasetOperator::Commission.run(
  customer_directory: configured_customer_directory,
  manifest_sha256: configured_customer_manifest_sha256,
  directory: private_application_directory,
  source_key: original_source_key,
  record_id_column: original_projected_record_id_alias
)
~~~

An exported Baserow client preserves the original seller SDK directory layout:
**baserow/customer/baserow_customer_receiving.rb** and
**developer/ruby-client/**. Applications loading the source checkout use those
same relative paths beneath **sf30-seller-sdk/**. The selected record ID
column is the real output alias backed by **$recordId**.

For an independently copied application, call
**Starforge::DatasetOperator::Commission.reopen(directory: received_directory)**
from the same source package. It verifies every retained application file and
current target value, then reopens the original result.

## Transfer the operating application and its bundle

Stop the managed application, wait for that original launch to finish, and
export its complete working state with the environment.

~~~sh
starforge ruby-runtime stop --directory "$RUBY_RUNTIME" --id customer-app
starforge ruby-runtime operation --directory "$RUBY_RUNTIME" \
  --operation-id "$APPLICATION_LAUNCH_UUID" --wait

starforge ruby-runtime export --directory "$RUBY_RUNTIME" \
  --id customer --application-id customer-app \
  --operation-id "$APPLICATION_EXPORT_UUID" --wait

starforge ruby-runtime file --directory "$RUBY_RUNTIME" \
  --operation-id "$APPLICATION_EXPORT_UUID" \
  --name ruby-runtime.tar --out "$RUBY_APPLICATION_ARCHIVE"
~~~

The full TAR contains the original source/client, exact Gemfile.lock, cached
Bundler and dependency sources, and every file of the stopped application.
Keep its returned complete archive SHA-256. On the receiving host, select the
compatible actual Ruby executable, then use **Receive** in the Ruby desk or:

~~~sh
starforge ruby-runtime init --directory "$RECEIVED_RUBY_RUNTIME"

starforge ruby-runtime receive --directory "$RECEIVED_RUBY_RUNTIME" \
  --id received-customer --title "Received customer data" \
  --ruby "$RECEIVING_RUBY" --archive "$RUBY_APPLICATION_ARCHIVE" \
  --expected-sha256 "$RUBY_APPLICATION_ARCHIVE_SHA256" \
  --operation-id "$RUNTIME_RECEIVING_UUID" --wait

starforge ruby-runtime inspect --directory "$RECEIVED_RUBY_RUNTIME"
~~~

Receiving verifies the original archive and each member, installs the exact
retained bundle offline, and checks the original dataset, mapped target rows,
edition receipts and rendered Rails pages. Use the returned local application
ID to launch the independent received working copy. The receiving host's Ruby
engine, ABI and platform must match the archive; it supplies any native
development tools needed to compile the cached gems.

The browser supports a streamed archive upload with the same original receive
UUID and complete byte/SHA binding. A completed transfer is reused on retry.
The [whole native customer example](../../stellar/scf-starforge-20261009/distribution/ruby-runtime/examples/customer-runtime.mjs)
performs installation, the existing source customer program, real Rails HTTP,
stopped export, offline receiving while its producer is unavailable, full
target/history verification and recipient reopening as one retained journey.

## Other existing finalized datasets

The same selected product includes the original direct SF100 customer entry:

~~~sh
starforge baserow-rails dataset --ruby "$RUBY" -- --help
~~~

The [native dataset guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/developer/ruby-client/NATIVE_DATASETS.md)
gives the complete original room → typed Ruby rows → Rails preview/import →
complete portable application path. Use the source owner's already finalized
room, manifest, source key and dataset ID. The Baserow customer entry additionally
binds its source field selection and original attachment references.

## Source ownership and upgrades

This standalone edition adopts the original complete implementations from
public product PRs [1952](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/1952),
[2019](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2019) and
[2088](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2088),
at original source **03baf7a1b9da6dff74c54fbbb9534e1545c488d4**.
The managed Ruby environment and complete application receiving come from
[PR2188](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2188).
The standalone source selection, product command and guides compose those
original modules. Original shared native APIs remain the selected standalone
runtime's source.

Retain customer files and application database during a source upgrade. A new
runtime uses the maintained upgrade/transfer procedure. A new source edition
uses the same logical source and selected query, a new received edition, and a
new reviewed import operation. Reopen old operations with their own original
receipts.
