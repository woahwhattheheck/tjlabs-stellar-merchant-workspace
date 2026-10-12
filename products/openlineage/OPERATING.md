# OpenLineage operations — installed product

The `openlineage-operations` selection delivers the complete lineage workspace through the existing Starforge builder, installer, Applications lifecycle and merchant host. Operators can receive original producer events, inspect jobs, runs and datasets, review a saved edition, attach its complete result files, and hand an editable workspace to another operator.

## Product entry points

| Surface | Entry |
| --- | --- |
| Browser | **OpenLineage operations** in the existing Applications view |
| Operator CLI | `starforge openlineage` |
| Native pipeline producers | `starforge openlineage native-python` and `starforge openlineage native-java` |
| Native API and typed client | The original HTTP server and `./seller/openlineage` package export |
| Direct MCP | `starforge openlineage mcp --workspace DIR` |
| Managed merchant agent | The source-owned OpenLineage workspace provider |
| Source-selected installation | `--selection openlineage-operations` |
| Complete customer handover | Original events, results, editions, reviews, operation history and portable application |

The [complete source/API guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/README.md) explains producer intake, entity and facet semantics, the API catalog, typed client, and direct receiving. The [source contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/SOURCE_CONTRACT.md) identifies the original upstream contracts and untouched examples.

## Build the selected source

Choose `openlineage-operations` in the existing Runtime workspace's **Build a product** view. Select the full source commit, review the product, and build into a new owned output directory. The resulting archive opens in the existing **Source & profile** view.

The same operation is available from the source checkout:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace-checkout \
  --ref ORIGINAL_FULL_COMMIT \
  --selection openlineage-operations \
  --out /absolute/openlineage-release
```

The returned archive, SHA-256 and source manifest identify this exact product edition. The manifest retains the original selection, contributions, source paths, original Git objects and complete byte identities. Use that returned archive when installing or transferring the product.

Continue an interrupted build through its original output:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace-checkout \
  --out /absolute/openlineage-release --resume
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --out /absolute/openlineage-release --status
```

The saved output retains its original commit and selection. A different product or source edition uses a different output. The [maintained source-build guide](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/SOURCE_BUILDS.md) covers browser operation, offline Git acquisition, original locks and continuation.

## Install the maintained merchant profile

The portable OpenLineage application itself uses Node builtins and runs on Node 22 or later. The maintained merchant installation uses the existing Node 22.16+ runtime and its selected native, schema, OpenAPI, MCP and operator dependencies. Their exact versions come from the selected source and retained dependency lock.

```sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/openlineage-runtime \
  --archive /absolute/openlineage-release/ORIGINAL_PACKAGE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/openlineage-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/openlineage-runtime --load --source

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/openlineage-runtime -- openlineage --help
```

Use the original installer's dependency adoption and offline transfer flows when an existing complete dependency tree is available. Its retained lock, source inspection and READY state stay with the same runtime. The [runtime installation guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) provides these operations.

The commands below use the installed `starforge` executable. If it is not on PATH, use the same `runtime-install-cli.mjs run --dir /absolute/openlineage-runtime --` prefix and pass the command shown after `starforge`.

```sh
starforge source
starforge registrations --source openlineage-workspace
starforge merchant-providers list
```

## Open the customer's workspace

Initialize a new private project once:

```sh
starforge openlineage init \
  --workspace /absolute/private/lineage \
  --title "Pipeline operations"

starforge openlineage serve \
  --workspace /absolute/private/lineage --port 0
```

Open the printed URL. For managed operation, register the READY runtime in the existing Runtime workspace, open **Applications**, and select **OpenLineage operations**. Choose this initialized workspace and an optional private token file. Review and save the launch, then use the existing Start, Open and Stop controls. Reopen a received project through the same application entry.

The application verifies its workspace identity and server instance when connecting. The browser retains an exact pending mutation before sending it. If a response is interrupted, reopen the same workspace and recover that original action. A revision conflict presents the current state for review before a new intended change.

## Receive producer originals and save a review

Import the complete producer JSON, event array or NDJSON file:

```sh
starforge openlineage import \
  --workspace /absolute/private/lineage \
  --input /absolute/producer/events.ndjson \
  --name events.ndjson \
  --source https://YOUR_PRODUCER/retained-run-log \
  --operation-id original-producer-capture

starforge openlineage edition \
  --workspace /absolute/private/lineage \
  --title "Reviewed production run" \
  --operation-id original-reviewed-edition
```

The source reference is retained metadata. Imports preserve every original byte, the producer's namespaced identities, original event content and its source positions. Later observations retain their original content while the operational view applies the relevant facet replacement and deletion rules.

Use the browser's entity inspector to follow the original event and active lineage. Save a reasoned review against the chosen edition and entities. Attach an existing result file with its source reference and original query where applicable. The result's complete bytes remain attached to that edition even after later imports.

Compare saved editions before adopting an upstream change. The full report and source downloads preserve the inspection context. The [source contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/SOURCE_CONTRACT.md) describes how explicit lineage, input/output boundaries, supported schema versions and historical observations are represented.

## Connect native pipeline producers

The existing producer endpoint accepts original JSON/NDJSON or gzip bodies.
Open **Producer intake** in the browser to inspect the current endpoint, queue
and server counters and download complete Python or Java settings. The
`producer-config` CLI generates the same private settings from the current
connection file. Keep the original workspace pin across ordinary server restarts.

For a dedicated producer credential, start the same workspace with a private
operator token and a different producer token:

```sh
starforge openlineage serve \
  --workspace /absolute/private/lineage --port 8767 \
  --token-file /absolute/private/operator-token \
  --producer-token-file /absolute/private/producer-token

starforge openlineage producer-config \
  --connection /absolute/private/lineage/connection.json \
  --token-file /absolute/private/producer-token \
  --client python --compression gzip \
  --out /absolute/private/openlineage.yaml
```

Both token values contain at least 24 characters. Point the existing producer's
`OPENLINEAGE_CONFIG` at the complete generated file. The browser and managed
merchant use the operator credential; the producer credential admits event
bodies at `POST /api/v1/lineage`.

A successful producer response follows the original atomic source commit.
Concurrent bodies use its serial append queue. Retry an unacknowledged unchanged
body and operation identity after retryable backpressure. Original wire and
decoded identities, client-specific setup, capacity and complete continuation
are documented in the [producer guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/PRODUCERS.md).

## Operate the included Python and Java producers

The installed product and each complete workspace export include the native OpenLineage SDK 1.53.0 producers. They retain complete input files, stable event delivery identities, actual SDK request bodies and matching saved workspace acknowledgements. Resume the same operation directory after an interrupted delivery; use the current connection of the same original workspace after a restart.

The [Python operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/PYTHON_PRODUCER.md) covers the pinned Python runtime, retained input delivery, local status and continuation:

```sh
starforge openlineage native-python emit \
  --python /absolute/private/openlineage-python/bin/python \
  --directory /absolute/private/pipeline-delivery \
  --connection /absolute/private/lineage/connection.json \
  --token-file /absolute/private/producer-token \
  --input /absolute/original/events.ndjson \
  --operation-id original-pipeline-delivery
```

The [Java operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/JAVA_PRODUCER.md) covers JDK/Maven preparation, the saved dependency classpath and original Run, Job and Dataset event delivery. Use `starforge openlineage native-java prepare` and `native-java emit` with the same original source files and owned runtime.

The receiver continues to use Node builtins. Each producer's selected Python or Java runtime is prepared separately and stays reusable across deliveries. Version 3 project exports carry both producer implementations and guides; receiving also accepts complete earlier version 1 and version 2 application packages.

## Manage producer delivery through the merchant host

The managed producer desk uses the configured workspace and file aliases in the
private host JSON. Add the producer token, configuration directory and named
Python or Java profiles using the [merchant guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/MERCHANT.md).
The host prepares complete upstream settings and sends retained source files to
the same native intake used by the included SDK producers.

```sh
starforge openlineage producer profiles \
  --connection /absolute/private/openlineage-host.json --workspace operations

starforge openlineage producer status \
  --connection /absolute/private/openlineage-host.json --workspace operations

starforge openlineage producer configure \
  --connection /absolute/private/openlineage-host.json --workspace operations \
  --profile python

starforge openlineage producer emit \
  --connection /absolute/private/openlineage-host.json --workspace operations \
  --input production-events --sha COMPLETE_ORIGINAL_FILE_SHA256 \
  --operation-id original-production-delivery --content-encoding identity
```

A file alias selects the complete original on the merchant computer. Its hash
covers all transmitted bytes; a gzip input uses its compressed hash and
`--content-encoding gzip`. Each profile produces a private immutable
configuration file. The returned path, environment setting and hash identify
the complete configuration to use in the producer process.

Keep the operation ID, file alias, hash, encoding and any expected revision when
continuing an interrupted send. A persistent merchant session retains a captured
pending body and can recover it after the original input has moved. After
reopening the merchant owner, restore that same input file and continue its
original request. When the server restarts, the persistent merchant connection
provides explicit instance inspection and reconnect; the operation still belongs
to the same saved workspace.

## Review schema changes and assign the work

Save an edition before a pipeline change and another after its original events
arrive. Open **Schema changes** in the workspace, select those two editions, and
compare the original dataset fields, nested structures, types and declared
column relationships. The impact view follows the producer's declared
relationships and shows unresolved field references alongside the affected
records.

Use a staff review to record the selected changes, reviewer and reason.
**Needs work** requires an owner and a concrete action; **Resolved** requires
the completed resolution. Update an existing review as the work progresses so
its original selection, earlier decisions and supporting source/result
references remain together. A separate selection starts a separate review.

The same comparison and reports are available through the installed CLI:

```sh
starforge openlineage schema-compare \
  --workspace /absolute/private/lineage \
  --from BEFORE_EDITION_ID --to AFTER_EDITION_ID

starforge openlineage schema-impact \
  --workspace /absolute/private/lineage \
  --input /absolute/private/schema-impact-selection.json

starforge openlineage schema-review \
  --workspace /absolute/private/lineage \
  --input /absolute/private/schema-review.json

starforge openlineage schema-report \
  --workspace /absolute/private/lineage \
  --from BEFORE_EDITION_ID --to AFTER_EDITION_ID \
  --format html --out /absolute/delivery/schema-review.html
```

Use the comparison's returned ID and change IDs in the selection and review
files. A saved review also carries its original operation ID and expected
workspace revision. JSON, CSV and HTML reports include the comparison, staff
decisions and follow-up state. The [schema operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/SCHEMA_OPERATIONS.md)
provides complete argument files and the receiving journey.

Native HTTP, the typed client, direct MCP and the managed merchant catalog
expose `schema.compare`, `schema.impact`, `schema.review.save` and
`schema.report`. Managed tools retain the same pending-mutation and revision
handling as the other saved workspace actions.

## Native agents share the same owner

The direct CLI, browser, typed client and MCP interfaces call the same revisioned workspace. Managed merchant access connects to the running application's original connection file and binds the selected workspace and instance. File-input aliases can name complete original event or result files with their SHA-256, so the operator can transfer actual retained files through the existing private configuration.

Use the [merchant operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/MERCHANT.md) for provider setup, tools, exact request recovery and complete downloads. `workspace.metadata` returns the current revision and retained counts. `records.read` pages through complete collections at that same revision; continue `nextOffset` until it is null. The `operations` collection is the complete workspace journal and is read without an edition restriction. It retains original saved outcomes for recovery.

Preserve the same operation ID and original mutation arguments after an uncertain response. Reconnecting to a restarted application is explicit. A new intended action receives a new ID after its current state has been reviewed.

## Complete delivery and receiving

Create the full editable workspace package:

```sh
starforge openlineage export \
  --workspace /absolute/private/lineage \
  --out /absolute/delivery/openlineage-workspace.json

starforge openlineage report \
  --workspace /absolute/private/lineage \
  --format html --out /absolute/delivery/openlineage-report.html
```

The workspace package includes all retained source and result objects, saved state, editions, review history, schema comparisons and staff resolutions, original operation outcomes, and every portable application file. Each original object and application file has a byte length and SHA-256. Receiving derives event attribution and edition membership from the original source bytes.

Receive into a new directory and reopen the original workspace identity:

```sh
starforge openlineage verify \
  --input /absolute/delivery/openlineage-workspace.json

starforge openlineage receive \
  --input /absolute/delivery/openlineage-workspace.json \
  --out /absolute/received-lineage

node /absolute/received-lineage/application/cli.mjs serve \
  --workspace /absolute/received-lineage --port 0
```

The receiving directory contains the original state and objects plus its own editable `application/` source. The receiver can inspect, import, review, attach results, export and reopen this same project. The maintained installed application can also select that received workspace.

For large exported packages, the typed client and merchant adapter support complete range downloads with original byte identities. Keep the same original export ID, destination and partial download record when continuing. A completed identical destination is reused.

Deliver the selected source archive and its installer receipt alongside the customer's workspace package when the recipient needs the entire managed merchant installation. Follow the original Runtime transfer workflow to carry its selected dependency profile and complete installation. Keep project data in its private project directory across runtime upgrades.

## Run the complete native operating journey

The source includes `RECEIVING.mjs`, a complete original operation using the retained upstream OpenLineage examples and actual native HTTP, client and MCP. It imports complete sources, saves and compares editions, inspects lineage, reviews an entity, attaches an original reference file, recovers an original mutation, writes complete reports, downloads the full export, receives into an independent directory and starts that received application.

From the OpenLineage source directory:

```sh
node RECEIVING.mjs /absolute/new-openlineage-receiving
```

Use a new owned receiving directory for a new run. The programme records its actual progress and final result in that directory, preserves its complete generated outputs, and closes its two native servers. Browser operation can be reviewed by opening the received workspace through the normal serve command.

The companion producer operation exercises native gzip and simultaneous HTTP
arrivals, original replay, explicit writer backpressure, server restart and
independent receiving of all compressed originals:

```sh
node PRODUCER_RECEIVING.mjs /absolute/new-openlineage-producer-receiving
```

Its saved operation file retains the original workspace and stage identities.
An interrupted stage continues through the same directory. The complete
producer guide explains the generated files and continuation.

The same complete application includes these additional operating journeys:

| Programme | Input and operation |
| --- | --- |
| `MERCHANT_PRODUCER_RECEIVING.mjs` | A new private operation directory; managed configuration, complete file delivery, writer recovery, token rotation and reopened export. |
| `JAVA_RECEIVING.mjs` | An original private operation directory and `--runtime` directory; native SDK plain/gzip delivery, workspace pin, writer recovery, restart replay and Java delivery from the received application. Select the existing JDK and Maven with `--java` and `--maven` when needed. |
| `SCHEMA_RECEIVING.mjs` | The complete input JSON described in `SCHEMA_OPERATIONS.md`; original before/after sources, concurrent staff decisions, request recovery, full reports and independent receiving. |

Each journey retains its original operation files and continues from the same
directory. The schema guide also accepts actual earlier workspace packages for
version 1/version 2 receiving. Keep private credentials with the operator and
transfer the complete project export to the recipient.

## Operate pipeline service levels

Open **Service levels** in the original OpenLineage workspace to save per-job timeliness, duration and failure expectations, review an assessment at an explicit time, and assign or resolve observed incidents with complete decision history. The desk shares the running application's original workspace and instance connection.

Use `starforge openlineage service-levels --help` for the same local or HTTP workflow. The typed `./seller/openlineage/service-levels` export and six native/merchant tools call the original revisioned writer. Customer reports include policy versions, exact observed source/event references and complete incident history; the existing full workspace export retains these records and the editable service-level application.

The [service-level guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/SERVICE_LEVELS.md) defines completion freshness, observed duration, failure windows, historical selections and receiving. The [operator desk guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/SERVICE_LEVELS_OPERATOR.md) covers ordinary operation and exact interrupted-request recovery.

## Google catalog commissioning

The companion `starforge openlineage-google` carries a saved original source edition through Google project/quota-project review, explicit event approval, Data Lineage import, stable request recovery, exact table-edge receiving and a complete editable package. Its wrapper retains both the original source application and the current receiver; the original workspace format and application version remain intact.

Use the [Google catalog operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/DATAPLEX.md) for preparation, customer credentials, genuine OpenLineage 1.x requirements, expected catalog identities and independent reopening. Source editions retain every original event and facet, including event kinds outside Google's importer contract. Receiving preserves all API attempts and distinguishes field edges from table edges.

## Operate dataset quality

Open **Quality** in the original OpenLineage workspace to inspect original metric and assertion history, select an exact dataset and run, save threshold or assertion rules, retain evaluations and record reasoned dispositions against individual saved findings. Producer assertion success, severity and run completion state remain separate. Missing measurements remain unreported.

The desk shares the existing workspace, selected edition, server connection, source browser and pending-request recovery. HTML, JSON and CSV quality reports retain the selected evaluation; the original complete workspace export carries the rules, immutable evaluations, decision history and editable quality application.

The typed `@tokenjunkielabs/starforge-merchant/seller/openlineage/quality` export exposes `QualityClient` through the original HTTP action owner. The complete [quality operator and client guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/QUALITY_OPERATOR.md) covers source semantics, rule configuration, evaluation, decisions, reports, recovery and independent receiving.
