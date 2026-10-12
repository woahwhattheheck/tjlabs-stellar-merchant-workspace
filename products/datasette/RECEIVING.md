# Install and receive Datasette

A complete delivery consists of the selected application source/runtime, its original source edition or whole customer workspace, and the private host connection used to reopen it.

## Build the complete selected source

Use Node 24 and the source commit that contains the composed Datasette publisher, original client/receiver, industrial operator, customer Analysis and installation contribution. The complete customer contribution includes the original Python package and its Node bridges; prepare Python 3.11 or newer with the workbooks extra through the retained Python installation before opening customer Analysis.

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --ref ORIGINAL_COMMIT \
  --selection datasette --out /absolute/datasette-release
~~~

Retain the emitted source archive and actual SHA-256, the exact commit, selection and complete build result. The original builder discovers the static module and browser asset closure from the maintained source. Continue the same interrupted operation with the same output and --resume.

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --ref ORIGINAL_COMMIT \
  --selection datasette --out /absolute/datasette-release --resume
~~~

The Runtime workspace **Build a product** view invokes the same native source builder and opens its result in Source & profile.

## Install and reopen the runtime

Use the real emitted archive and hash:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/private/datasette-runtime \
  --archive /absolute/datasette-release/ACTUAL_ARCHIVE.tgz \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/private/datasette-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/private/datasette-runtime --load --source
~~~

The source manifest supplies the original dependency selection. Installation preserves its actual lock, source and native load result. Existing compatible dependencies can be adopted through the maintained runtime transfer workflow. Follow the [Runtime install](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) and [Runtime transfer](../../stellar/scf-starforge-20261009/distribution/RUNTIME_TRANSFER.md) guides for offline receiving.

Attach the READY runtime to the existing Runtime workspace and open Applications:

~~~sh
starforge runtime-workspace attach \
  --workspace /absolute/private/runtime-workspace \
  --runtime /absolute/private/datasette-runtime --label "Datasette"
~~~

The product contains the Datasette source/publisher, original Datasette customer Analysis and Datasette source workflow Applications entries. Reopen each against its retained original directory. In **Python & workbooks**, resolve and retain the original workbooks extra, install it offline and select that Python installation in customer Analysis. Follow the [installed customer guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/datasette-analysis/INSTALLATION.md) for the full source, interpreter and receiving settings.

## Deliver a reviewed source edition

In the source browser, open the saved named edition and choose **Export complete source package**. The original exporter retains a compressed .datasette.json.gz archive containing the edition, complete review, original capture, all source HTTP pages and their native metadata.

The returned archive SHA-256 identifies the whole compressed file. **Download original package** reads every byte range from the original retained-file authority and verifies the complete downloaded hash.

The same original operation is available to CLI and agent clients:

~~~json
{
  "editionId": "ORIGINAL_EDITION_ID"
}
~~~

~~~sh
starforge datasette \
  --url-file /absolute/private/datasette-workspace/connection.json \
  --operation source.export --input-file /absolute/private/export-edition.json
~~~

For host-local CLI receiving:

~~~sh
starforge datasette receive \
  --directory /absolute/private/receiving-workspace \
  --archive-file /absolute/private/source.datasette.json.gz \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --destination /absolute/private/receiving-workspace/editions/received-source
~~~

Create the receiving workspace first. When it is already serving, use its --url-file and the original source.receive input rather than opening a second local owner.

## Browser upload and source receiving

In **Receive a complete source edition**, select the original package and its local receiving edition identifier. Supplying the archive SHA from its export receipt avoids hashing a large file again in the browser. When the field is empty, the browser computes the file SHA before the first byte is sent.

The browser saves the original upload UUID, filename, total byte count, hash and receiving selection. The native owner receives raw ranges through the original file authority. Each durable range has its original offset, length and hash.

After an interrupted request or browser restart, select that same archive again. The original upload status verifies the saved prefix and tells the browser where to continue. A completed upload returns its actual archiveFile and retainedFile identity; those exact values become the original source.receive input.

The receiver checks the whole package and creates or reopens the immutable local edition. Open its retained original rows and review, select it for the publisher, and continue customer work.

The complete [native upload guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/datasette/UPLOADS.md) defines range recovery, native file custody and same-upload finalization.

## Export the whole workspace

**Export complete workspace** retains source captures, named editions, publisher plans and runs, dataset versions, customer work and retained exports through the original archive engine. Live control sockets, locks and transient database files follow that engine's maintained rules.

~~~sh
starforge datasette export-workspace \
  --url-file /absolute/private/datasette-workspace/connection.json \
  --archive-file /absolute/private/datasette-workspace/exports/customer-workspace.zip
~~~

Use a new selected archive path for a new export. An interrupted export continues its original path and archive identity. The result supplies the complete workspace identity, file inventory, archive and source hashes.

Keep the entire .zip and actual returned SHA. The original files and full source history remain available through the browser's retained-file inventory and merchant receiving tools.

## Receive and reopen independently

Choose a separate private destination. Offline receiving uses the original archive engine without opening the sender:

~~~sh
starforge datasette receive-workspace \
  --archive-file /absolute/private/customer-workspace.zip \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --destination /absolute/private/received-datasette

starforge datasette serve \
  --directory /absolute/private/received-datasette \
  --connection-file /absolute/private/received-datasette/connection.json \
  --port 0
~~~

The browser can perform the same receiving workflow: choose **Complete workspace**, select the original ZIP, its hash and a separate absolute receiving directory. Once the original receiver completes, open that returned directory in the installed application.

The receiver preserves the original source, editions, publisher history and customer work while recording the actual receiving directory and relocations. Retain its result and reopened workspace identity. Further customer work continues in the received original store.

For analytical work, use the installed Datasette customer Analysis application. Supply the returned editionFile and editionSha256 in the [native-edition handover](OPERATING.md#receive-the-publishers-named-edition); the original customer reader imports that complete reviewed source into its own Analysis database. Export the complete editable customer workspace after substantive customer changes and use that application's original receiving workflow on the next host. Reopen the restored database with its original customer Analysis operation ID. The source/publisher ZIP and customer Analysis ZIP preserve the original stores they came from.

## Receive a complete report project

The source workflow's complete project ZIP carries the original business
request and history, selected configuration, all native query/report/workbook
files and Analysis archive, original supplier review/coverage package and the
complete built application source. Use this project export when the receiving
operator must reopen and continue the full request-to-report delivery.

Receive the matching complete merchant runtime and workbooks Python
installation through the existing transfer and Python controls above. Use the
receiving runtime ID, runtime directory and original Python installation from
that host. Select new canonical private workflow and Analysis directories:

~~~sh
starforge datasette-analysis \
  --runtime-workspace /srv/starforge/receiving-operator \
  --runtime-directory /srv/starforge/receiving-runtime \
  --runtime-id RECEIVING_24_HEX_RUNTIME_ID \
  --installation-id RECEIVING_64_HEX_PYTHON_INSTALLATION_ID \
  -- workflow receive \
  --archive /srv/starforge/transfers/Complete_Supplier_Project.zip \
  --sha256 ACTUAL_COMPLETE_PROJECT_SHA256 \
  --workspace /srv/starforge/received/workflow \
  --analysis-workspace /srv/starforge/received/analysis
~~~

The original receiver retains the business request, result, selected source and
native operation identities and records the actual received paths. It runs the
maintained Analysis archive receiver for the selected native destination.
Repeating the same receive selection continues that original receiving
operation.

The received workflow contains:

| Relative location | Original contents |
| --- | --- |
| received/delivery | Source editions, complete native query/report/workbook files and original Analysis archive |
| received/delivery/supplier | Unchanged native supplier manifest, all declared files under their original basenames, complete coverage inputs and outputs, original reviewed workspace and workflow link |
| received/application | Entire original built application source archive |
| received/workflow | Selected workflow source, guides, example profiles and native Kestra source |
| received/intake | Complete original request intake |
| received/deployment | Actual rendered native flow delivery when configured |

The outer result's Supplier_Report_ labels identify portable file descriptors.
The supplier directory preserves each original filename beside its unchanged
manifest. Start the complete original supplier editor from its received directory:

~~~sh
node /srv/starforge/received/workflow/received/delivery/supplier/supplier-report-cli.mjs serve --port 8765
~~~

Open its localhost URL and the adjacent workspace.json. Its report, rules,
complete baseline and candidate, changes and any accepted output keep their
original identities. The original input review is separately retained as
original-supplier-workspace.json. The same directory includes the original
editor, CLI, helper and guide source declared by its complete manifest.

### Open both received applications

In **Applications**, create or reopen these original entries:

| Application | Receiving selection |
| --- | --- |
| Datasette customer Analysis | The restored Analysis directory, its original 32-character operation ID and the receiving workbooks installation |
| Datasette source workflow | The received workflow directory and the same installed Python environment |

Open the workflow without a configuration to inspect its retained request,
source/report files, supplier status, history and complete project export.
Start the restored Analysis owner when continuing native report work. Its
source editions, saved queries, workbook and operation history remain available
through **Original Analysis**.

The source workflow has its own private listener and resource lease for its
request directory. Startup verifies the original process, workspace and private
launch record and checks its authenticated health response. The health result
also reports the configured Analysis operation's readiness. Use the current
Applications Open link after reopening; each listener has a fresh capability.

### Continue the actual customer project

Build a successor configuration with workflow configure using the real
receiving paths. The full supplier example binds:

| Configuration input | Original received file |
| --- | --- |
| Primary prices and coverage pricing | received/delivery/supplier/coverage-pricing-source.csv |
| Related catalog and coverage catalogue | received/delivery/supplier/coverage-catalogue-source.csv |
| Both source metadata and coverage metadata | received/delivery/supplier/coverage-publisher-metadata.json |
| Native supplier review workspace | received/delivery/supplier/original-supplier-workspace.json |
| Complete source archive | The actual received/application archive filename |
| Analysis selection | Restored Analysis directory and its original operation ID |
| Supplier component | The complete products/conapi/supplier-report in the receiving installed sourceRoot |

Preserve the profile's prices-to-candidate sourceBindings and coverage
prices/catalog aliases. Configure verifies the actual complete files and
source-owned parser. The original supplier review retains its own request ID,
comparison, revision and actual status. A changed supplier candidate uses its
corresponding native reviewed workspace and complete source together.

Use a new business request for the intended report change. For example, the
same original monthly pricing report can have an explicitly linked successor
selecting the published free period:

~~~json
{
  "schema": "stellar-forge.source-workflow-request.v1",
  "requestId": "conapi-supplier-received-successor-20261012",
  "parentRequestId": "conapi-supplier-a-20261012",
  "correlationId": "conapi-supplier-receiving-20261012",
  "profile": "elite-supplier-review",
  "parameters": {"period": "free"}
}
~~~

Review the new configuration in the saved workflow application, open it, and
accept and run this original successor. Its six report sections run against
the retained complete source pair with the actual changed parameter.
Source/baseline reports and workbooks retain the original CSV columns and
publisher metadata. Re-export the completed project to a new destination;
the received original delivery and successor relation remain in that project.

[The complete native receiving programme](../../stellar/scf-starforge-20261009/sf30-seller-sdk/datasette-analysis/WORKFLOW_RECEIVING.md)
includes every source-binding command, selected native Analysis operation,
full query/report review, interruption continuation and successor export.
[The installed Applications guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/datasette-analysis/INSTALLATION.md)
contains the exact managed mode, four-field wrapper and readiness contract.

## Complete remote customer receiving

The existing merchant Datasette client can export/read complete source or workspace archives from an original configured remote workspace. It keeps the configured workspace identity, exact file SHA and byte positions, then invokes the maintained receiver with the full original archive.

Use the installed datasette-mcp command and the [original merchant guide](../../stellar-forge/mcp-merchant-operator/DATASETTE_WORKSPACES.md). The maintained complete receiving programme is documented at [SCF Datasette MCP receiving](../../operations/scf-datasette-mcp-receiving-20261012/README.md).

Deliver the actual selected source archive and build receipt, runtime profile/lock or full runtime transfer, original customer archive and hash, complete receiving result and host-owned private connection configuration. The saved application and workspace identifiers identify the work to reopen.
