# Imagery, processing and customer delivery

Operate one saved imagery workspace from its catalog and source selection through
scene review, processing history, customer delivery and receiving on another host.
The browser, installed commands and agent client use the same saved workspace.

This guide is the product entry point for `starforge stac`. The selected package
also contains the full [imagery reference](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/README.md),
[processing reference](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/processing/PROCESSING.md),
[customer commerce reference](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/MERCHANT.md)
and [Applications reference](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/STAC_APPLICATIONS.md).

## 1. Select the runtime and keep the working directories

Use Linux, the Node version required by the selected package, and the original
operator prerequisites. The current source requires Node 22.16 or later, Python
3.11 or later and util-linux `flock`. Keep work on a local filesystem that supports
the original locks, atomic rename and fsync.

Keep the installed runtime and operating data in separate private directories:

| Directory | Contents |
| --- | --- |
| `/srv/starforge/runtimes/imagery-01` | The selected installed source and runtime profile |
| `/srv/starforge/imagery` | Catalogs, saved queries, scene editions, decisions and acquired files |
| `/srv/starforge/processing` | The optional FilmDrop or Cirrus deployment and retained run history |
| `/srv/starforge/operator` | Saved Applications, managed operations and current connection files |
| `/srv/starforge/deliveries` | Complete customer and portable outputs |
| `/srv/starforge/private` | Private configuration and references to existing credentials |

These are example absolute paths. Select the actual locations for this host.
Original workspace directories are owned by the running user and use mode 0700;
private configuration and connection files use mode 0600. Keep the whole workspace
together when moving an existing operation.

Build or obtain the original product archive and retain its returned SHA-256.
The [product installation guide](../merchant-workspace/OPERATING.md) and
[runtime installer](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md)
describe the original build, installation and upgrade commands. A retained imagery
and processing operator uses the original Node command and operator requirements:

~~~sh
starforge runtime-install prepare \
  --dir /srv/starforge/runtimes/imagery-01 \
  --archive /srv/starforge/downloads/merchant.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --operator

starforge runtime-install install \
  --dir /srv/starforge/runtimes/imagery-01

starforge runtime-install inspect \
  --dir /srv/starforge/runtimes/imagery-01 --load --source
~~~

Use the actual archive identity from the selected release. The original installer
must reach READY before that runtime is attached in Applications. Its inspection
and saved profile describe the installed dependencies. Select the native payment,
schema and OpenAPI features when operating the merchant and customer flow in
section 7; the [commerce runtime selection](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/receiving/PORTABLE_GIS.md#install-the-selected-stac-commerce-runtime)
gives the exact dependency and pin contract. A Prescient deployment additionally
selects its original Python SDK installation.

The commands below use an already installed `starforge` entry point. To run a
command through the selected runtime explicitly, use:

~~~sh
starforge runtime-install run \
  --dir /srv/starforge/runtimes/imagery-01 -- stac COMMAND ARGUMENTS
~~~

From a source checkout, the equivalent command starts with
`node stellar/scf-starforge-20261009/distribution/cli.mjs stac`.

## 2. Open a catalog and acquire a selected scene edition

Create the original imagery workspace and open it:

~~~sh
starforge stac init \
  --workspace /srv/starforge/imagery \
  --title "Imagery operations" \
  --endpoint https://earth-search.aws.element84.com/v1

starforge stac serve \
  --workspace /srv/starforge/imagery --port 0
~~~

Open the local session URL printed by the original host. The browser supports
catalog discovery, area and time selection, source-request review, acquisition,
scene footprints, original metadata, decisions, assets, comparisons and exports.
The session and its saved work belong to this host.

A complete command-line capture follows the same workflow:

~~~sh
starforge stac discover \
  --workspace /srv/starforge/imagery --operation-id discovery-1

starforge stac query-save \
  --workspace /srv/starforge/imagery \
  --name "Austin September scenes" \
  --collections sentinel-2-l2a \
  --bbox=-97.85,30.15,-97.55,30.45 \
  --datetime 2026-09-01T00:00:00Z/2026-09-30T23:59:59Z \
  --cloud-cover-max 70 --page-size 100 --max-pages 1000

starforge stac review \
  --workspace /srv/starforge/imagery --query SAVED_QUERY_ID

starforge stac acquire \
  --workspace /srv/starforge/imagery \
  --review SAVED_REVIEW_ID --operation-id scene-capture-1
~~~

Use the actual query and review identifiers returned by the previous commands.
The dates and area above are a concrete query example; choose the customer's
actual collection, area, date range and source-supported predicates. Catalog
discovery determines which collections and query extensions the source supports.

The original request and response are saved before the page is accepted. The
edition follows the provider's actual next request, including GET or POST
continuation. A page budget can leave an edition PARTIAL. Continue that same
edition with `stac resume --workspace DIRECTORY --edition EDITION_ID`; the saved
coverage explains the remaining request. A complete edition ends after the source
pagination is exhausted.

Review a scene's complete native metadata before recording its selection.
Collection plus Item ID is the scene identity. Repeated identical Features are
deduplicated within a traversal; conflicting versions retain the original bytes
and end that capture for review. The edition comparison reports added, removed,
changed and unchanged metadata while preserving both source selections.

### Acquire the files that belong in the delivery

The asset review shows the original href, MIME description, roles, license,
provider and storage fields. Select the original asset and its receiving size
limit in the browser before acquisition. The saved result includes its actual
size, response MIME and SHA-256.

Public HTTPS assets use the original transport. A requester-pays S3 source uses
the configured original S3 connection and payer choice. The operator retains
the actual storage reference and source outcome. Local previews read the acquired
files; opening a scene does not download its remote thumbnail.

Retain the Collection's attribution and rights information with the selected
scene and export. The [source contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/SOURCE-CONTRACT.md)
links the original collection and imagery references.

## 3. Add FilmDrop or Cirrus processing history

Processing appears inside the same imagery browser. Open it with the original
processing workspace and configuration:

~~~sh
starforge stac serve \
  --workspace /srv/starforge/imagery \
  --processing-workspace /srv/starforge/processing \
  --processing-config /srv/starforge/private/processing.json \
  --port 0
~~~

Use the selected deployment's actual base URL and retained source description.
The [processing configuration reference](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/processing/PROCESSING.md#open-the-existing-application)
defines the original deployment, page size, optional credential environment
reference, exact OpenAPI or Cirrus source package, and capture metadata.

The full processing workflow is:

1. Configure the original deployment and retain its source description.
2. Capture its workflow inventory. Review which native workflows, duration and
   page size belong to the operating history.
3. Run the reviewed selection. Each workflow retains its own page chain, exact
   request, native run identities, returned count and available continuation.
4. Open the retained run details, available events and input/output payloads.
   Continue the original page when the source returns a next request.
5. Review any candidate association with the selected imagery. Retain the actual
   collection/item or asset references and the analyst's decision.
6. Export the selected processing editions together with their complete source
   captures and the selected imagery handover.

FilmDrop's source can return combined workflow results with a limited total.
The original controller follows one actual run-page chain per selected workflow.
Cirrus statistics retain their separate published counts and capture times.
An empty or unmatched scene association remains visible with the two original
identity sets. Use the provider's recorded metadata and analyst review when
comparing different acquisition and processing periods.

The same original operation can receive exact responses acquired by an equipped
source connection. Use the existing **Import response** action and its saved
pending request; the complete source carrier, continuation and native selection
remain in the processing workspace. The [Cirrus receiving example](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/examples/processing-cirrus-native.mjs)
uses these original interfaces.

## 4. Save the operator in Applications

Applications keeps the selected runtime, working directories and operating
connection across browser restarts. Choose the original mode that matches the
work:

| Work | Application kind | Saved selection |
| --- | --- | --- |
| Imagery and optional processing | `stac-imagery` | Existing imagery directory and optional processing configuration |
| eoAPI customer onboarding | `stac-eoapi` | Existing eoAPI workspace, selected source/policy configuration and separate customer output |
| Prescient customer operations | `stac-prescient` | Original operator root, deployment JSON and selected approved profile |

Initialize the runtime workspace, attach the completed runtime, and use the
returned runtime ID:

~~~sh
starforge runtime-workspace init --workspace /srv/starforge/operator
starforge runtime-workspace attach --workspace /srv/starforge/operator \
  --runtime /srv/starforge/runtimes/imagery-01 --label "Imagery runtime"
~~~

Copy the matching request from [examples](./examples), replace its runtime ID
and absolute paths, and omit optional fields that do not belong to this
workspace. In the browser, enter the same fields under **Applications**.

~~~sh
starforge runtime-workspace application-review \
  --workspace /srv/starforge/operator \
  --request /srv/starforge/private/imagery-review.json
~~~

Save a private JSON file containing a fresh UUID as `requestId` and the returned
review `id` as `reviewId`. Then save and connect the application:

~~~sh
starforge runtime-workspace application-save \
  --workspace /srv/starforge/operator \
  --request /srv/starforge/private/imagery-save.json

starforge runtime-workspace application-connect \
  --workspace /srv/starforge/operator --application-id APPLICATION_ID

starforge runtime-workspace application-start-review \
  --workspace /srv/starforge/operator --application-id APPLICATION_ID
~~~

The start request contains `applicationId`, the returned start-review `id`
as `reviewId`, and a fresh UUID as `requestId`:

~~~sh
starforge runtime-workspace application-start \
  --workspace /srv/starforge/operator \
  --request /srv/starforge/private/imagery-start.json

starforge runtime-workspace application-output \
  --workspace /srv/starforge/operator \
  --application-id APPLICATION_ID --operation-id ORIGINAL_OPERATION_UUID
~~~

The same saved request can be repeated to recover its original result. The output
supplies the running URL after the original host has opened the selected
workspace. In the browser, choose **Open** and continue the same scene and
processing work.

Review resolves the eoAPI policy and separate output directories, including
their original defaults. Save keeps those exact selected paths. Prescient review
resolves an omitted profile to its current profile hash and saves that choice.
Changes to a default profile therefore leave an already saved selection explicit.

The [complete Applications guide](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/STAC_APPLICATIONS.md)
covers all original settings, configuration changes and operation recovery.

### Keep one agent connection across restarts

The saved application's connection file is:

~~~text
/srv/starforge/operator/applications/APPLICATION_ID/stac-connection.json
~~~

Create the original STAC client's private configuration against that stable file:

~~~sh
starforge stac-workspace connection-init \
  --out /srv/starforge/private/stac-client.json \
  --console-url-file /srv/starforge/operator/applications/APPLICATION_ID/stac-connection.json \
  --workspace imagery

starforge stac-workspace status \
  --connection /srv/starforge/private/stac-client.json
~~~

The client uses the same authenticated state as the browser. It rereads this
connection file after a restart and verifies the selected workspace ID. Its
[agent guide](../../stellar-forge/mcp-merchant-operator/STAC.md) describes the
existing actions, processing configuration and local input aliases. Keep the
connection and its local session on the operating host.

### Stop, recover and reopen the same workspace

~~~sh
starforge runtime-workspace application-stop \
  --workspace /srv/starforge/operator \
  --application-id APPLICATION_ID --operation-id ORIGINAL_OPERATION_UUID
~~~

Wait for that operation's completed stopped state. The original host drains
accepted work and closes its listener and native workspace. A new Start uses a
new original operation and session while retaining the same saved application
and working data. The stable connection file receives the verified new address.

For an interrupted managed operation, use `application-recover` with the same
application and operation IDs. For an interrupted source acquisition, inspect
and continue that original domain operation in the imagery or processing
workspace. Both histories remain available. Review changed configuration before
starting a new selection.

## 5. Operate eoAPI customer onboarding

Use eoAPI when the delivery includes a selected Auth Proxy policy, original
source authorization, deployment commissioning and customer handover.

~~~sh
starforge stac eoapi-init \
  --workspace /srv/starforge/imagery \
  --endpoint https://earth-search.aws.element84.com/v1 \
  --title "Customer imagery"

starforge stac eoapi-serve --workspace /srv/starforge/imagery
~~~

Initialize a new workspace or select the existing original eoAPI workspace as
described in its guide. Keep output in a separate delivery directory, outside
the imagery workspace. Existing policy and source-runtime configuration belong
to the same customer and deployment.

In the eoAPI operator:

1. Import the approved original policy package and review its route and source
   choices.
2. Review the retained source edition or reviewed capture, then bind the accepted
   source review to that edition with its original operation ID.
3. Review selected asset access and acquire the selected files through their
   configured original source connection.
4. Review the complete delivery and record its approval.
5. Stage the original merchant with the agreed payment configuration and public
   origin, then operate the original customer path.
6. Export the approved delivery with its complete received customer directory.

~~~sh
starforge stac eoapi-delivery-export \
  --workspace /srv/starforge/imagery \
  --delivery-approval DELIVERY_APPROVAL_ID \
  --directory /srv/starforge/deliveries/original-customer \
  --out /srv/starforge/deliveries/eoapi-handover

starforge stac eoapi-delivery-open \
  --directory /srv/starforge/deliveries/eoapi-handover \
  --expected-manifest-sha256 HANDOVER_MANIFEST_SHA256
~~~

Use the recorded approval and returned manifest hash. The
[eoAPI operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/eoapi/ONBOARDING.md)
contains the complete policy, source-runtime, asset, commissioning and native
customer commands. When starting it through Applications, use the
[eoAPI request](./examples/eoapi-application.json) and that workspace's original
private configuration.

## 6. Operate a Prescient customer workspace

Prescient joins the original customer profile and SDK to the same imagery and
delivery workflow. Its operator directory contains both `operator/` and
`stac/`. Select this root directory in Applications.

Configure the original SDK's Python installation, customer binding, private
environment file and delivery/export roots using the
[Prescient host guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/prescient/OPERATOR.md)
and [SDK bridge](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/prescient/SDK_BRIDGE.md).
The environment values stay on the receiving host; the profile records their
binding name.

~~~sh
starforge stac prescient-init \
  --workspace /srv/starforge/prescient/customer-one \
  --profile /srv/starforge/private/prescient-profile.json \
  --actor "Customer operator"

starforge stac prescient-serve \
  --workspace /srv/starforge/prescient/customer-one \
  --deployment /srv/starforge/private/prescient-deployment.json \
  --port 0
~~~

Review and approve the original profile, connect the actual catalog, review and
acquire its selected scene and asset requests, then review the original customer
delivery. Export the approved handover and receive it through the original
`prescient-delivery-open` command on the recipient's configured host. The full
guide supplies the exact retained command envelopes and restart behavior.

The [Prescient Applications request](./examples/prescient-application.json)
selects that same operator root and deployment file. An omitted profile is
resolved during Review and saved explicitly; supply a profile hash when a
particular retained profile is intended.

## 7. Publish and receive a selected imagery edition

Use the original workspace's **Export edition** action to produce its immutable
delivery directory. It contains the manifest, scene CSV, original Features,
decisions, source requests/responses and selected acquired files. Keep the exact
export identity with the merchant and customer selection.

Merchant and customer execution requires the selected native commerce runtime,
facilitator, payment configuration and original buyer configuration. Use the
existing configured payer and reviewed aggregate amount for the actual delivery.

~~~sh
starforge stac merchant-stage \
  --edition /srv/starforge/deliveries/edition-1 \
  --directory /srv/starforge/merchant \
  --origin https://YOUR-MERCHANT-HOST \
  --path /stac \
  --payment /srv/starforge/private/stac-payment.json

starforge stac merchant-serve \
  --directory /srv/starforge/merchant \
  --port 8423 --facilitator https://YOUR-FACILITATOR
~~~

Create the customer with its reviewed query, exact selected files, page cap and
total amount in the asset's atomic units:

~~~sh
starforge stac customer-create \
  --directory /srv/starforge/customer \
  --merchant /srv/starforge/merchant \
  --id reviewed-stac-edition \
  --buyer-config /srv/starforge/private/stac-buyer.json \
  --query /srv/starforge/private/stac-query.json \
  --files /srv/starforge/private/stac-files.json \
  --max-pages 20 --max-total-atomic REVIEWED_TOTAL_ATOMIC \
  --chunk-bytes 1048576

starforge stac customer-run \
  --directory /srv/starforge/customer \
  --buyer-config /srv/starforge/private/stac-buyer.json

starforge stac customer-inspect \
  --directory /srv/starforge/customer \
  --buyer-config /srv/starforge/private/stac-buyer.json
~~~

The [merchant guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/MERCHANT.md)
defines the original payment, buyer, query and file JSON fields. Use those exact
contracts and the retained customer identifier. A customer interrupted after a
request continues through its original `customer-recover` command before the
same run proceeds.

After acquisition, assemble and open the complete receiving directory:

~~~sh
starforge stac customer-deliver \
  --directory /srv/starforge/customer \
  --buyer-config /srv/starforge/private/stac-buyer.json \
  --out /srv/starforge/deliveries/customer-1

starforge stac customer-open \
  --directory /srv/starforge/deliveries/customer-1
~~~

The original receiver carries the selected files, exact byte counts and hashes,
source edition and native acquisition outcomes. Large files retain the original
object byte windows and chunk hashes under the same customer cap.

### Give the recipient an offline scene explorer

~~~sh
starforge stac portable-export \
  --directory /srv/starforge/deliveries/customer-1 \
  --out /srv/starforge/deliveries/portable-1

starforge stac portable-open \
  --directory /srv/starforge/deliveries/portable-1 \
  --expected-manifest-sha256 PORTABLE_MANIFEST_SHA256
~~~

Retain the hash returned by the export and transfer the complete directory.
Open `scene-explorer.html` in a browser to search the received scenes, filter by
collection/date/cloud, inspect source footprints and metadata, and view the
retained images. The same directory contains its local STAC Catalog, original
GeoJSON, asset inventory and complete customer files.

Keep all relative files together. The explorer opens locally with no imagery or
map request. A file that was not included in the customer selection remains
visible with its actual outcome and source metadata. The original
`portable-open` command reopens and checks the received delivery and derived
files. The [portable receiving guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/receiving/PORTABLE_GIS.md)
describes the complete output layout.

## 8. Receive the working imagery and processing application

A working-team handover can retain the source workspace's scene editions,
decisions, selected asset bytes and processing history as well as its customer
deliveries. Use the original imagery and processing export/import controls.
Reimporting the identical handover returns its original receipt; the reopened
workspace preserves the native edition and scene identifiers.

For a complete installed Applications receiving run, copy
[managed-receiving.json](./examples/managed-receiving.json), select the actual
completed input directories and a separate private receiving directory, then run
the original driver from the selected runtime:

~~~sh
node /srv/starforge/runtimes/imagery-01/package/source/stellar/scf-starforge-20261009/sf30-seller-sdk/stac/examples/managed-applications-receiving.mjs \
  --input /srv/starforge/private/managed-receiving.json
~~~

The driver uses the maintained runtime and application manager to:

- Receive a private copy of the completed imagery and optional processing work.
- Attach the actual READY runtime, review/save/connect the application, and
  start the original host.
- Open it through the stable client connection and receive the full original
  imagery and processing exports.
- Stop and start that same saved application with its retained workspace and a
  new original session.
- Import the exported work independently, reconcile repeated receiving and
  reopen the recipient.
- Save the actual application, review, operation, source, export and receiving
  identities in the private result and journal.

Reuse the same receiving input and directory after interruption; its journal
reconciles the original stages. Omit `sourceProcessingWorkspace` for imagery
alone. The example does not change the completed source directories.

## 9. Continue an operating delivery

| Observed state | Continue through |
| --- | --- |
| A scene capture is PARTIAL | The original edition's saved continuation |
| A source request was interrupted | That domain operation's original recovery and retained response |
| A processing page remains available | Its saved workflow/run chain and exact next request |
| A managed worker was interrupted | Applications Recover with the original application and operation IDs |
| The application completed Stop | A fresh start review/request for that saved application |
| A native customer request needs reconciliation | The same customer's original recover and inspect commands |
| A file transfer was interrupted | The original receiving/export command against the same destination |
| A reviewed configuration changed | Review the current files and save the intended selection |
| The runtime needs an upgrade | The original new-directory upgrade/recovery flow, retaining the working data |

The complete delivery consists of the saved operating workspace, its reviewed
source selection, selected installed release and complete receiving files.
Its browser and agent connection reopen those same records for the next operator.
