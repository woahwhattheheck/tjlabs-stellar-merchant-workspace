# Frictionless source workbench

Operate an original data package from source intake to a reviewed publication plan,
then deliver the complete source edition to another operator. This selected
merchant product includes the original Frictionless capture and review engine,
source workbench, publisher, managed browser, agent client and receiving tools.
Its companion local dataset customer workflow retains complete native pages,
DuckDB editions, saved SQL and full customer reports.

| Work to finish | Installed entry point |
| --- | --- |
| Inspect inputs, create source editions, review and select the publisher source | **Applications → Frictionless source workbench**, `starforge frictionless-agent` |
| Operate the same retained source requests from an agent or CLI | `merchant_frictionless_*`, `starforge frictionless-source` |
| Capture, inspect, export or receive the native source archive directly | `starforge frictionless` |
| Extract, review and publish the selected source | The original publisher controls and `merchant_publisher_*` |
| Receive all reviewed native pages, analyze customer editions and export reports | **Applications → Local dataset customer workspace**, `starforge local-dataset-agent` |

Source capture preserves the descriptor, original resource files, schemas,
dialect, references, missing-value declarations and rights. An operator chooses
the query projection and reviews its actual rows. Source export preserves the
selected edition and its commissioning records. Published dataset generations
and customer warehouses travel through their existing complete handovers.

## Build the selected installation

Use Linux, Node.js 22.16 or later, Python 3.11 or later, Git, npm and util-linux
`flock`. The original publisher uses Node's SQLite and a native lifetime lock.
Keep private workspaces on a filesystem with working file locks, atomic
publication and fsync.

From this repository, build the committed source selection:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo . --ref HEAD --selection frictionless-source \
  --out /absolute/private/packages/frictionless-source
~~~

Retain the returned archive, SHA-256, source commit and manifest. The selected
package includes both source and customer workflows, original source-owned
registrations, browser assets, Python applications, Parquet decoder and this
guide. A build continuation uses its retained source, selection and output
directory; follow the original builder's `--resume` behavior.

Install the completed source package in a new application directory:

~~~sh
npm install --ignore-scripts --offline --omit=optional /absolute/path/to/package.tgz
npx --no-install starforge doctor
~~~

The standalone installed command is **starforge**. Before installation,
replace that command with the original dispatcher:

~~~sh
node stellar/scf-starforge-20261009/distribution/cli.mjs
~~~

Use the actual archive and hash from the completed build to prepare the
maintained runtime:

~~~sh
starforge runtime-install prepare \
  --dir /absolute/private/runtimes/frictionless-source \
  --archive /absolute/path/to/package.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

starforge runtime-install install \
  --dir /absolute/private/runtimes/frictionless-source

starforge runtime-install run \
  --dir /absolute/private/runtimes/frictionless-source -- source
~~~

The existing installer owns dependency selection, installation progress and
recovery. Retain its exact lock and installation records. Use the original
[runtime installation guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md)
for an existing donor graph, offline transfer or interrupted installation.

Attach this runtime to the original Applications workspace:

~~~sh
starforge runtime-workspace init \
  --workspace /absolute/private/runtime-workspace

starforge runtime-workspace attach \
  --workspace /absolute/private/runtime-workspace \
  --runtime /absolute/private/runtimes/frictionless-source \
  --label 'Frictionless source operations'

starforge runtime-workspace serve \
  --workspace /absolute/private/runtime-workspace --port 0
~~~

Use an existing runtime workspace instead of initializing another when one is
already in use. Open the actual local URL returned by the server and select
the attached runtime.

### Python source and customer environments

CSV, TSV and JSON source capture use the original Python standard-library
implementation. Select the trusted interpreter through
`SF_FRICTIONLESS_PYTHON` when it differs from the host default. Parquet uses
the included original Wherobots decoder and its declared
`pyarrow==26.0.0` dependency. Keep the exact
[decoder requirements](../../stellar/scf-starforge-20261009/sf30-seller-sdk/wherobots/source/requirements.txt)
with the installed source. Remote Wherobots accounts and jobs are separate
operations; local Parquet decoding uses the original Arrow reader.

For the optional customer-analysis phase, open **Python & workbooks** in the
same runtime workspace, select the **duckdb** extra and complete its normal
wheel review and offline installation. That original customer declares
`duckdb==1.5.6`. **Applications → DuckDB dataset workspace** owns its database
and listener. The
[local dataset operating guide](../local-dataset/OPERATING.md) contains the
complete customer setup, immutable-edition mapping, SQL, report and portable
warehouse procedure.

## Prepare or retain the original publisher

If a Frictionless publisher already exists, keep its directory, source history,
dataset target, plans and reviews. Configure the source workbench against that
same publisher. Close a separately running publisher before another merchant
owner opens it.

For a new publisher, begin with an actual original descriptor or a received
native source archive. A local descriptor example is:

~~~sh
starforge frictionless capture \
  --descriptor /absolute/original/datapackage.json \
  --output /absolute/private/source-capture

starforge frictionless inspect-capture \
  --capture /absolute/private/source-capture/capture.json

starforge frictionless suggest-source \
  --capture /absolute/private/source-capture/capture.json \
  --output /absolute/private/reviewed-source.json
~~~

Inspect all original resources and references, then review the suggested
query definitions. Preserve original field names, column order, type and
physical representation, missing markers, time meaning and units. Suggested
projections remain drafts until their native review is acceptable. The
[original Frictionless source guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/frictionless/README.md)
defines supported schema and dialect corrections and the retained reference
evidence they require.

Run the original source review and create the publisher after reviewing its
result:

~~~sh
starforge frictionless review-source \
  --source /absolute/private/reviewed-source.json

starforge frictionless init \
  --workspace /absolute/private/source-publisher \
  --source /absolute/private/reviewed-source.json \
  --state /absolute/private/source-dataset
~~~

For a received native archive, first use the source-receive procedure below
and supply its actual received source path. Keep the original receive receipt
and source identities.

Create a private publisher connection with the actual original directory:

~~~json
{
  "schema": "stellar-forge.merchant-publisher-connection.v1",
  "workspaces": {
    "source": {
      "label": "Reviewed source",
      "kind": "frictionless",
      "directory": "/absolute/private/source-publisher"
    }
  }
}
~~~

A new merchant can use the existing initializer:

~~~sh
starforge merchant-mcp init-publishers \
  --dir /absolute/private/source-merchant \
  --connection /absolute/private/publishers.json \
  --name 'Frictionless source operations'
~~~

Retain its actual merchant configuration, release store and export directory.
For an existing merchant, add the new connection to its original configuration
while preserving its other providers. The next section uses alias
**original_frictionless_publisher** as a placeholder; substitute the actual
alias, such as **source** above.

The source workbench takes a complete descriptor or retained source archive through capture, resource inspection, immutable query editions, full native review, publisher source selection and publication planning. It uses the configured Frictionless publisher, its scheduler and the original merchant MCP owner.

The installed application is **Frictionless source workbench**. Its command is **frictionless-agent**. The browser and agent client use the same retained workbench UUID, source editions and operation history.

## Configure the existing merchant

Keep the original merchant configuration and its publisher connection. Add the source-workbench connection filename to that same configuration:

~~~json
{
  "publisherConnection": "publishers.json",
  "frictionlessWorkspaceConnection": "frictionless-workspaces.json"
}
~~~

These are entries to add to the existing merchant configuration. Preserve its remaining fields, authentication, runtime declarations and service connections.

The workspace connection selects an existing publisher alias. Each Frictionless publisher has one source-workbench alias:

~~~json
{
  "schema": "stellar-forge.frictionless-workspace-connection.v1",
  "workspaces": {
    "source_operations": {
      "label": "Source operations",
      "publisher": "original_frictionless_publisher",
      "inputs": {
        "supplier_descriptor": {
          "kind": "descriptor",
          "label": "Supplier data package",
          "path": "/private/source-inputs/datapackage.json"
        },
        "supplier_archive": {
          "kind": "source-archive",
          "label": "Received complete source",
          "path": "/private/source-inputs/source.tar.gz"
        }
      }
    }
  }
}
~~~

Use the real publisher alias and original private file paths. The publisher's kind remains **frictionless**, and its directory remains the original configured directory.

| Input | Declaration | Native operation |
|---|---|---|
| Current publisher source | Built-in alias **current** | Inspect the original selected source, then supply its returned hash for an explicit intake. |
| Local descriptor | **kind: descriptor**, one **path** | Capture the exact original descriptor and its selected resources with the original capture engine. |
| Public descriptor | **kind: descriptor**, one public HTTPS **url** | Capture that declared remote source with the original capture engine. |
| Received source archive | **kind: source-archive**, one private **path** | Receive the complete original native source archive, retaining its original resource and reference selection. |

A descriptor can also declare **resources** as distinct original resource names, **references** as public HTTPS reference URLs and **timeoutSeconds** from 1 through 300. A source archive already contains its original selection and accepts its archive path and optional label.

Descriptors use exactly one path or URL. Public URLs have no embedded credentials, fragments or credential/capability query parameters. Resolve local paths relative to the connection file, or use canonical absolute paths. Keep the original connection and source files private and owned by the running host.

Configuration supports up to 32 workbench aliases and up to 64 declared inputs per workbench. The reserved **current** alias always refers to the original publisher source. Local descriptor files are limited to 8 MiB; received source archives are limited to 256 MiB by the maintained configuration reader.

## Start through installed Applications

1. Open **Applications** in the installed merchant workspace.
2. Choose **Frictionless source workbench**.
3. Select the original merchant configuration file and the declared workspace alias.
4. Select browser and MCP ports, using **0** for available loopback ports.
5. Select the existing MCP token environment name, normally **MCP_ACCESS_TOKEN**, and provide its value through the host's existing private environment mechanism.
6. Review the selected configuration and start the application.
7. Open the returned local operator URL. Use the returned MCP URL and workspace UUID with the existing source client.

Applications binds the exact merchant, publisher-connection and source-workbench-connection files, their sizes and hashes, the publisher alias and its original directory. The normal source-selection and publisher state can continue changing during operation.

The original Applications resource family remains **merchant-mcp** for the selected merchant configuration. Another application using that same merchant configuration shares its existing ownership rules.

## Start from the command line

Inspect configuration without opening the publisher or a listener:

~~~sh
starforge frictionless-agent inspect \
  --config /private/merchant/merchant-mcp.json \
  --workspace source_operations
~~~

The result includes **bindingSha256** and the three exact configuration-file identities. Retain that selection when starting:

~~~sh
starforge frictionless-agent serve \
  --config /private/merchant/merchant-mcp.json \
  --workspace source_operations \
  --expected-binding-sha256 SELECTED_BINDING_SHA256 \
  --port 0 \
  --mcp-port 0 \
  --token-env MCP_ACCESS_TOKEN
~~~

Replace the selected hash with the actual inspection result. The first startup record uses schema **stellar-forge.frictionless-agent-workspace-startup.v1** and status **FRICTIONLESS_AGENT_READY**. It identifies the persistent workbench UUID, original publisher alias/directory, current workbench and publisher instance UUIDs, browser URL and MCP URL.

Serve starts one original merchant MCP owner and borrows its publisher. SIGINT or SIGTERM closes that owner through its original lifecycle. A failed close remains attached to the same owner for retry.

## Complete the source workflow

### 1. Inspect the original selected source and inputs

Open the source workbench and inspect **Current source**. Retain the returned source identity, capture identity, resource declarations and query definitions. Open the declared input you intend to receive.

The agent equivalents are **merchant_frictionless_open**, **merchant_frictionless_current** and **merchant_frictionless_input**. Opening returns the persistent **workspaceId** and current instance identities. Subsequent scoped calls use that exact workspace UUID.

For a local file or the built-in current source, use the exact SHA-256 returned by input inspection. A changed original file is a new input selection requiring its current inspected hash.

### 2. Capture the complete input

Start intake with an operator-chosen label and one caller-retained request UUID. The original capture/source-receive engine performs the work and retains a complete immutable capture.

The intake arguments are **requestId**, current **expectedVersion**, declared **input**, **label** and the inspected **expectedSha256** for local/current inputs. The original request is retained before the operation begins.

Keep the original request identity if the browser or client disconnects. Inspect it through **merchant_frictionless_request** with **action: inspect**. Continue that exact retained request through **action: resume** when appropriate.

### 3. Inspect resources and create an immutable source edition

Read the capture's original package metadata, resource schemas, physical inspection, references, suggested queries and declared files. Page every relevant resource and file list. Open the complete retained file when field detail exceeds a page.

Create a source edition from explicit original query projections. Preserve the source resource names and projected column order. The existing source engine controls supported schema overrides and the captured reference evidence they require.

For precision-sensitive query definitions, use **queriesText**, the literal query JSON returned by original source inspection. It preserves the original Python serialization, including large integer constraints. Edition creation accepts exactly one of structured **queries** or literal **queriesText**.

The agent equivalents are **merchant_frictionless_capture** and **merchant_frictionless_edition**. Source editions are immutable; a revised projection becomes a new edition with its original parent capture and exact query content retained.

### 4. Review every selected row

Run the native review of the selected edition with the actual reviewer and review note. This uses the original source reviewer over every selected row. Read the original review outcome and its complete retained report.

A successful operation can still contain validation findings. Use those actual findings to correct the source contract or query edition and run the appropriate original review again. The workbench preserves the earlier edition and review.

Use **merchant_frictionless_review** with **action: run** to start the review and **action: inspect** to reopen a retained review.

### 5. Select the reviewed source and save the publication plan

Inspect the currently selected publisher source again. Select the reviewed immutable edition with its exact **editionId**, **reviewId** and current **expectedSourceHash**. The existing publisher writer applies the original source selection atomically.

Obtain the publication plan template through **merchant_frictionless_plan_input**, selecting the exact edition and original query. Review the complete plan, then save it with the same caller-retained request semantics through **merchant_frictionless_plan**.

The operator can open the actual saved plan in the original publisher controls. Continue extraction, candidate review, publication, dataset export and customer receiving through those existing controls. The source workbench retains the exact source and plan relationship.

Earlier plans and their source bytes remain available. After an uncertain response, inspect the original request and original saved plan before continuing.

### 6. Compare captured source changes

Compare the relevant immutable source captures. The retained comparison describes original data-file hashes, descriptors, schemas and dialect changes. Use complete native review and the actual downstream queries to assess their operational effect.

The agent equivalent is **merchant_frictionless_compare**, with explicit **create** and **inspect** actions. Its original comparison UUID and full retained file preserve the selected pair.

### 7. Export and reopen the complete source handover

Select the exact reviewed edition and create a source export with its original request UUID. The completed source export contains:

- The original **source.tar.gz** native source archive.
- The frozen source-edition JSON, including exact query JSON text.
- The applicable original native reviews.
- Complete retained capture inspection.
- Original source-selection history and saved publication-plan bindings.
- The receiving instructions and complete file manifest.

Inspect the completed export and read its full download manifest. Retrieve every declared file through **merchant_frictionless_export_file**, retaining the original manifest hash, individual file hashes and byte offsets. The existing source client supports interruption and owner reopening in the same receiving directory.

On the receiving host, declare the original exported source archive as a host input, inspect its exact SHA-256 and use the original source-archive intake. Recreate the applicable source edition from the exported exact query JSON and perform the original review against the receiving environment. The archived edition and review remain source records from their actual originating workspace.

Published dataset generations and customer warehouse state use their existing complete dataset/customer export workflows. Source export identifies the source contract and its original commissioning history.

## Agent operation map

| Work | Original tool |
|---|---|
| List declarations / inspect retained state | **merchant_frictionless_status** |
| Borrow / close the configured workbench | **merchant_frictionless_open**, **merchant_frictionless_close** |
| Inspect original source / declared input | **merchant_frictionless_current**, **merchant_frictionless_input** |
| Start complete intake | **merchant_frictionless_intake** |
| Read retained capture/resources/files | **merchant_frictionless_capture** |
| Create/read immutable query edition | **merchant_frictionless_edition** |
| Run/read complete native review | **merchant_frictionless_review** |
| Read/save original publication plan | **merchant_frictionless_plan_input**, **merchant_frictionless_plan** |
| Select reviewed original publisher source | **merchant_frictionless_select** |
| Compare original source captures | **merchant_frictionless_compare** |
| Create/read complete source export | **merchant_frictionless_export** |
| Inspect/continue original request | **merchant_frictionless_request** |
| Cancel the selected original active job | **merchant_frictionless_cancel** |
| Read/release exact retained bytes | **merchant_frictionless_file**, **merchant_frictionless_file_release** |
| Inspect/read/release complete export | **merchant_frictionless_export_manifest**, **merchant_frictionless_export_file**, **merchant_frictionless_export_file_release** |
| Borrow the original browser | **merchant_frictionless_browser** |

Each mutation receives its caller-retained UUID and the current applicable version or source binding. New UUIDs represent new intended operations. Close uses the persistent workspace UUID plus both current instance UUIDs returned by the original open/status response. The borrowed close drains its browser, retained reads and workbench model; the original merchant publisher remains with its owner.

## Receiving and operational record

Keep the complete original source input, actual capture/review results and finished source export with the work being delivered. Open the original files and receiving guide to reproduce the relevant source edition. Record actual native review and publication results separately from configuration inspection or source compilation.

The installed launcher inspects and opens the product. Starting it does not by itself perform intake, native review, publication or customer receiving. Those steps have their own retained operations and results in the same workspace.

## Complete source receiving procedure

This directory carries one immutable source edition and its original commissioning records. Start with **manifest.json** and **source-edition.json**, then receive **source.tar.gz** through the original Frictionless source receiver.

The original package descriptor, resource files, captured reference files, schemas, dialect and source rights travel inside the native source archive. The workbench also retains the exact query JSON text, complete native reviews, original source selections and saved publication-plan bindings for the exported edition. Publication and customer processing continue through their existing dataset and customer handovers.

### Files and identities

| File | Meaning |
|---|---|
| manifest.json | Original workbench export UUID, workspace UUID, edition UUID, original source/capture hashes and every delivered member's byte count and SHA-256. |
| source.tar.gz | Complete native source archive made by the original Frictionless exporter. Its internal manifest binds the original source configuration and every captured file. |
| source-edition.json | Frozen edition/capture metadata, exact queriesText, the selected review, all then-retained source selections and saved-plan bindings for this edition. |
| capture-inspection.json | The original full native capture inspection, or an explicitly marked original inspection-error record when intake retained a source that still needed a query correction. |
| reviews/UUID.json | Every native review for this edition retained when export began, with each original report preserved as exact bytes. |
| RECEIVING.md | These receiving and reopening instructions, declared in the original export manifest. |
| Frictionless-Source-Download.json | Additional complete download descriptor written by the merchant client. It binds the native manifest and all of its files to the original workspace and export UUID. |

The native export manifest lists its content files; the merchant download descriptor additionally binds **manifest.json** itself. The download client may retain its own checkpoint files beside these members. Those files belong to the transfer operation and should remain when continuing an interrupted transfer.

Read source rights and references from the original descriptor and captured material. An export preserves those declarations; it does not grant additional data rights or independently establish scientific validity.

### Obtain every declared file

Use the installed merchant source client against the original MCP URL returned by the source-workbench launcher. Supply the token through the already selected host environment variable; keep its value outside commands and reports.

~~~sh
starforge frictionless-source download \
  --url ORIGINAL_MCP_URL \
  --workspace ORIGINAL_WORKSPACE_ALIAS \
  --workspace-id ORIGINAL_WORKBENCH_UUID \
  --id ORIGINAL_EXPORT_UUID \
  --directory /private/received-source-handover \
  --token-env MCP_ACCESS_TOKEN
~~~

Use the exact original workspace and export IDs from the completed export operation. The receiver reads the original complete manifest before downloading its members. It retains offsets, verifies already received prefixes and confirms each full file's length and SHA-256 before committing the completed transfer.

If the connection closes, run the **same command with the same receiving directory and IDs**. The existing receiver reopens released file readers with their original digest and byte offset. A completed file is reused after verification. Reconnection does not start another source capture, review or export.

When the merchant process has reopened, first reopen the same declared workbench through **merchant_frictionless_open**, then inspect its persistent workspace UUID. The new instance IDs describe the new owner lifetime; the workbench UUID and existing export UUID remain the receiving identity. Use the listener that belongs to that reopened owner. Changing a transfer's endpoint or immutable binding requires its explicit original receiver recovery rules, rather than editing checkpoint files.

The browser's **Source receiving** view offers the native manifest and each exact file. For a full handover with many review files, the client command above receives every declared member and retains the complete transfer state. Keep all declared members together.

### Receive the original source archive

Use the same installed source distribution that contains the Frictionless source exporter and receiver. The source commands use Node, the original Python parser and its supported dependencies. Set **SF_FRICTIONLESS_PYTHON** to the configured Python executable when it differs from the host default. CSV, TSV and JSON use the original standard-library parser. Parquet uses the original selected decoder and its declared Python requirements.

Read the **source.tar.gz** SHA-256 from the verified export manifest. Select a new private output directory:

~~~sh
starforge frictionless source-receive \
  --archive /private/received-source-handover/source.tar.gz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --output /private/received-native-source
~~~

The original receiver checks the complete archive, validates its members and writes the received source atomically. Keep its actual return value with the source handover. The resulting **source.json** refers to the received capture. **original-source.json** retains the exact exporting source configuration.

The source configuration's hash may change when its capture path is relocated. The exported **source-edition.json** separately records:

- **edition.sourceHash**, the original immutable exporting source configuration.
- **capture.captureSha256**, the original capture manifest identity.
- **queriesText**, the exact original query definitions.
- **receivingSourceHash**, the source identity from the exporter's verified receiving copy.

Use the original receiver's actual source path and fresh inspection when working in another directory. Compare the capture identity, original source bytes and query definitions; do not replace a current source hash with an old path-dependent hash.

Once reception completes, reopening reads the existing **source.json**. Keep the received directory intact. Do not use another source-receive invocation to overwrite it.

### Review the received source

Run the original full source review against the received source configuration:

~~~sh
starforge frictionless review-source \
  --source /private/received-native-source/source.json
~~~

The native review reads every selected row and applies the declared field, key, missing-value, type, schema and dialect contract. Preserve its actual result alongside the originating reviews. A source operation can complete with validation findings; inspect its reported resource states and issues before selecting that source for publication.

Original reports retain the previous environment's actual observation and reviewer. A receiving review is a new observation in the receiving environment. Preserve both, including corrections and unsuccessful reviews.

The workbench's exact **queriesText** is the portable query-editing input. Keep projected columns in their original order and preserve literal missing values. JSON integer constraints outside the exact JavaScript range should stay in this text form. The original Python handling of decimal JSON numbers remains unchanged; represent precision-sensitive text according to the source's native contract instead of silently narrowing it through a browser number.

### Reopen in the source workbench

Add the exported archive to the receiving merchant's existing source-workbench connection under a host-selected alias:

~~~json
{
  "kind": "source-archive",
  "label": "Received source edition",
  "path": "/private/received-source-handover/source.tar.gz"
}
~~~

Keep the original connection schema and publisher alias. The installed **Frictionless source workbench** application opens the same configured publisher and scheduler under one merchant MCP owner.

1. Open the declared workbench and inspect its persistent workspace UUID.
2. Inspect this archive alias and retain the actual SHA-256 returned by the host.
3. Start one explicit intake using that SHA, the current workbench version and a caller-retained request UUID.
4. Read the retained capture's resources and original file list.
5. Create a receiving edition from **queriesText** in the original exported **source-edition.json**. A receiving edition has its own UUID while retaining the same original source meaning and capture.
6. Run the original full native review and retain its actual reviewer and result.
7. Inspect the publisher's current source hash, then select this reviewed edition using that exact current hash.
8. Obtain and review the original publication-plan template for the selected query. Save it through the original publisher, then continue its existing extraction, candidate review and publication controls.

The receiving workbench preserves its own edition and operation history. The exported original UUIDs remain source provenance; they are not rewritten to impersonate receiving operations.

### Recover a disconnected operation

The source workbench stores an original request before beginning its action. Browser requests retain their exact input before dispatch and store a confirmed native result before refreshing derived views.

For an uncertain result, use **Requests** or the native request client:

~~~sh
starforge frictionless-source request \
  --url ORIGINAL_MCP_URL \
  --workspace ORIGINAL_WORKSPACE_ALIAS \
  --workspace-id ORIGINAL_WORKBENCH_UUID \
  --id ORIGINAL_REQUEST_UUID
~~~

If the retained action is incomplete and the original owner is available, explicitly resume that same request:

~~~sh
starforge frictionless-source request \
  --url ORIGINAL_MCP_URL \
  --workspace ORIGINAL_WORKSPACE_ALIAS \
  --workspace-id ORIGINAL_WORKBENCH_UUID \
  --id ORIGINAL_REQUEST_UUID \
  --resume --wait
~~~

A browser reload reads retained state. It does not replay a mutation. A new UUID represents a new requested action; retain the original body, query order and UUID when recovering an interrupted operation.

A completed source export freezes the exact selected edition, reviews, source selections, saved-plan bindings and guide. Later reviews do not change an already started export. Reopening a completed export verifies and returns its original files.

### Operational scope and limits

This source handover carries a complete source archive and the selected edition's commissioning records. The publisher's full database, candidate rows, published dataset generations, payment records and customer warehouse are carried by their respective existing export workflows. Export those artifacts as well when the receiving work includes them.

The workbench permits up to 64 native queries per source edition. Its original native archive is limited to 256 MiB compressed and the source receiver applies its existing 512 MiB unpacked bound. The merchant receiver permits at most 10,000 declared files, including the native manifest, and 256 MiB per file; download and native manifest bounds are 64 MiB. Full row review remains subject to the original native source contract and its resource bounds.

Retain the complete handover, actual native return values, configuration selection and final source version used to receive it. Close borrowed browsers and file readers through their original owner. A browser close does not close the publisher or scheduler that another component still owns.


## Original publisher and customer continuation

After source selection and plan saving, use the original publisher controls to
extract the selected resource, inspect the candidate, record the real review
and publish against the exact current dataset state. Select the actual saved
plan in those controls; earlier plans keep their original captured source.

The first source selection advances the opting-in Frictionless publisher's
workspace marker to its supported v2 form. Older readers reject that marker
instead of silently using its initial source. The standalone publisher keeps
its existing relative-path configuration behavior: this schema promotion
preserves the exact stored initial source and target paths.

For customer analysis, open the included **Local dataset customer workspace**
against the same publisher and the original independently owned DuckDB service.
Its complete [operating guide](../local-dataset/OPERATING.md) covers original
reviewed-run selection, all native cursor pages, field mapping, immutable
editions and views, saved SQL, full Parquet/CSV reports and portable warehouse
receiving. Retain the source archive with that customer handover when the work
requires upstream source custody.

A publisher preview and local customer receiving are original operator
operations. A signed paid acquisition has its own buyer approval, original
request, payment and reconciliation records. Record the actual operation that
occurred; source review, installation and handover do not establish payment or
customer acceptance.

## Interrupted source exports and original history

A source export freezes its edition, capture inspection, reviews, selections,
saved-plan bindings and guide before export work begins. Once the native archive
has been created, the original operation records its exact byte count and SHA-256
before verifying a received copy. Every continuation checks that same archive
identity, and the verification directory is bound to that SHA. A changed archive
cannot reuse an older archive's verification.

Use the retained request and its exact inputs to continue incomplete work.
Preserve the original error when a binding differs; a new source or different
requested work requires its own reviewed operation. Completed exports retain
their original members and do not acquire later review events.

Keep the actual source commit, original request IDs, complete native return
values and declared output hashes with the customer delivery. The source code
and selected product describe supported operations; operating results are
recorded by each original native request.
