# OpenFEMA Public Assistance portfolios

Maintain an analyst's Public Assistance portfolio from complete FEMA source editions, review the original projects, exchange a programme's own project register, and hand over a workspace that the next operator can restore and continue.

The browser, command line, managed Applications entry and 41 merchant tools operate the same private workspace. The product preserves original source responses, six-table portfolios, analyst decisions, complete destination schemas, customer CSV inputs, native dataset releases and receiving history.

The maintained selection is **openfema-portfolios**. The original registration source is **openfema**, the Applications entry is **Public Assistance portfolios**, and the merchant provider is **openfema-workspaces**. The [source adoption record](SOURCE_ADOPTION.json) pins the complete original component and contribution. The [receiving guide](RECEIVING.md) covers another operator's installation, project exchange, original-file download and workspace restore.

## Complete an analyst job

| Operator work | Retained output |
| --- | --- |
| Receive a complete official cohort or capture a new one | Original response bytes, dataset dictionaries, opening/closing refresh observations and immutable source edition |
| Select disaster, applicant, category, date and amount criteria | An immutable portfolio version with all six native tables and source references |
| Review projects and applicant matches | Named analyst decisions, explanations, owners, dates, priority and original record identity |
| Compare two versions or deliveries | Scope, official-source and analyst changes with exact financial measures |
| Map the programme's destination fields | Complete supplied schema, immutable mapping and review of its exact hash |
| Receive the programme's complete CSV | All original rows and bytes, matched records, source differences, customer-only records and review proposals |
| Apply explicitly selected analyst decisions | A new portfolio version preserving the original source and concurrent review checks |
| Publish and receive an agreed dataset | Original SF30/SF82 release and existing SF88/SF100 customer files |
| Hand over the project | Full workspace ZIP, complete project deliveries, original customer file and readable reports |

The application retains project cost, federal obligations, total obligations and mitigation as four separate exact decimal USD measures. Missing, null and negative adjustments remain explicit. Source selection, analyst exclusion and changes in the observed edition are separately represented.

## 1. Install the maintained product

Use a Linux host with Node 24, Git, npm and the original installer prerequisites, including Python 3.11 or newer and util-linux flock. The native workspace uses an owned, canonical private directory and the kernel's original one-writer lease. Keep workspaces, input files, merchant configuration and exports outside the installed source and dependency directories.

From a checkout of this repository at the intended immutable commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo . \
  --ref "$(git rev-parse HEAD)" \
  --selection openfema-portfolios \
  --out /absolute/private/openfema-package \
  --offline
~~~

Keep the returned archive filename, complete SHA-256 and source commit together. The selection carries the whole OpenFEMA component, the original application and merchant providers, browser route manifest, all guides and recorded examples, and the shared installation, publisher and buyer source closure.

Install that source archive in a new private directory:

~~~sh
install -d -m 700 /absolute/private/openfema-install
cd /absolute/private/openfema-install
npm install --ignore-scripts --offline --omit=optional \
  /absolute/private/openfema-package/ORIGINAL_ARCHIVE.tgz

npx --no-install starforge doctor
npx --no-install starforge registrations --source openfema
npx --no-install starforge merchant-providers inspect openfema-workspaces
~~~

The source registration inspection names four commands: openfema-workspace, openfema, openfema-mcp and openfema-merchant-exchange. It also names the original application/provider and merchant/provider declarations.

For the complete installed merchant and Applications workflow, prepare the runtime from that same archive and SHA:

~~~sh
npx --no-install starforge runtime-install prepare \
  --dir /absolute/private/openfema-runtime \
  --archive /absolute/private/openfema-package/ORIGINAL_ARCHIVE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

npx --no-install starforge runtime-install install \
  --dir /absolute/private/openfema-runtime

npx --no-install starforge runtime-install inspect \
  --dir /absolute/private/openfema-runtime --load --source
~~~

Use the actual READY installation returned by the maintained installer. It retains the selected source, exact dependency declarations, lock and installation attempt. Its normal offline/cache and local Node-header options remain available. If installation is interrupted, continue with runtime-install resume and the same directory.

The [runtime installation guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) and [source selection guide](../../stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md) describe those existing operations. In the commands below, run npx from the source installation directory. Runtime-install run selects the actual prepared dependency closure explicitly.

## 2. Open the saved workspace through Applications

Open the existing runtime workspace, or start its maintained command:

~~~sh
npx --no-install starforge runtime-workspace serve \
  --workspace /absolute/private/merchant-runtime-workspace \
  --port 8465
~~~

Use its original installation workflow to select the READY OpenFEMA runtime. In **Applications → Public Assistance portfolios**, select the private OpenFEMA workspace directory. Use the directory restored from a completed handover when continuing an existing project. For a new project, select a new directory under an existing owned private parent.

Optional fields select the original buyer inbox, private merchant release-runtime JSON and identifying User-Agent. Review and save that application, then Start and Open it through the same lifecycle.

The original launcher binds the workspace UUID and selected directory, source, inbox and runtime inputs to the actual OPENFEMA_READY startup line. Normal source capture and review changes do not invalidate the saved application's workspace selection. Start, Stop, recovery and the private application-url.json remain with the maintained Applications engine.

The equivalent original command is:

~~~sh
npx --no-install starforge runtime-install run \
  --dir /absolute/private/openfema-runtime -- \
  openfema-workspace --workspace /absolute/private/openfema-desk
~~~

Add --inbox and --release-runtime only when those original inputs belong to the installation. Open the returned loopback URL and keep it in the private host configuration.

The running browser and connected merchant tools share that service. A separate openfema CLI process opens the workspace as its writer; stop the service before using those standalone CLI commands, then reopen the same saved application. The [managed guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openfema/MANAGED.md) documents the exact startup and stop/drain contract.

## Private operator working copies

The browser's **Working copy** panel preserves named unfinished preparations, complete original source/schema/customer files and the original request history across refresh and browser close. Select, duplicate, rename or export a copy without changing the native portfolio. A full import creates a separate copy against the same native workspace UUID.

Use **Export complete copy** for unfinished browser preparation and the existing **Handover → Complete workspace ZIP** for the native project. Both belong in an operator handover. Storage conflicts retain the visible copy for full export; original requests continue through the native journal with their first complete payload.

The complete [working-copy operating and receiving guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openfema/WORKING_COPIES.md) covers exact-file limits, cold reopen, native response recovery, concurrent windows and the whole original 195-project course.

## 3. Receive source and establish the portfolio

Use an already acquired complete source bundle for the selected cohort. In **Sources**, receive its full JSON or gzip JSON. The native importer validates the original dataset versions, metadata, source URLs, complete page sequence, byte hashes and refresh boundaries.

With the running workspace closed, the CLI equivalent is:

~~~sh
npx --no-install starforge openfema receive-source \
  --workspace /absolute/private/openfema-desk \
  --bundle /absolute/private/OpenFEMA_Original_Source_Bundle.json.gz

npx --no-install starforge openfema view \
  --workspace /absolute/private/openfema-desk
~~~

Record the returned source-edition ID. An edition ID is distinct from the original capture ID.

For a new source observation, select the actual disaster cohort in Sources and continue its original capture through pause, retry or process restart. The CLI also accepts capture with disaster/state/declaration-date selectors. Selector kinds combine with AND; values of one kind combine with OR. The collector retains associated applicant and obligated-project records for the selected disasters.

In **Portfolios**, choose the exact retained edition and the analyst's criteria. Inspect **disasters, declarations, applicants, projects, categories and issues**. Financial filters and sorting retain exact decimal meaning. The [source contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openfema/SOURCE_CONTRACT.md) accompanies the edition and explains dataset identities, paging, refresh and interpretation.

The included [DR4724 output](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openfema/examples/recorded-dr4724/README.md) contains the complete original report, portfolio JSON, manifest and all six CSV tables for 195 funded projects, 43 applicant registrations and two declaration areas. Its complete original source bundle remains an identified source input. Follow the [commissioning guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openfema/COMMISSIONING.md) to select that exact edition and retain its original observations.

## 4. Review the original records

Use **Review** to record the actual analyst, status, disposition, explanation, owner, due date and priority. A deliberate applicant choice selects an original applicant source row and retains its explanation. Each review is bound to the exact portfolio version and record.

Accept the selected portfolio version when its review is ready for delivery. Use **Changes** to compare retained versions. The comparison keeps changed criteria, official fields and analyst decisions distinct; a project absent from a later selection remains tied to that selection's observed scope.

The complete [operating reference](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openfema/README.md) describes the supported table fields, review states, exclusions, money representation and version controls.

## 5. Exchange the programme's project register

Open **Data integration** in that same workspace.

1. Receive the complete destination specification and map its exact target columns to the available source or analyst fields. Customer-owned columns can remain unmapped.
2. Save the mapping and record a named review of its exact SHA. A changed mapping creates a new version.
3. Select the reviewed mapping and an exact portfolio version, then export the complete project delivery ZIP.
4. Receive the complete customer CSV prepared from that delivery. The original file is retained with all rows, columns, filename, bytes and SHA.
5. Inspect the reconciliation. Select only the valid analyst decisions to import, enter the actual reviewer and reason, and save the new native portfolio version.
6. Export the next complete delivery, optionally carrying the selected reconciliation's customer-owned values, then compare the two retained deliveries.

Each mapped record includes the original disaster number and GM project ID. Customer-only or pre-obligation records, duplicates, source-field differences and invalid review values remain visible in the full reconciliation. Source rows and four financial measures remain with their original source edition.

The [data integration guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openfema/DATA_INTEGRATION.md) specifies the complete ZIP members and review-conflict rules. It also supplies the original CLI workflow. Mapping and customer files travel at their full native limits; the operator can inspect every reconciliation row.

For location-level engineering work, the complete [Orange Hurricane Ida source-review application](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openfema/examples/orange-ida/README.md) is included. It preserves issued location units separately from their parent FEMA projects, keeps original source documents and distinct amount bases, and exports a complete local workspace. Its prepared source and original source register travel unchanged with this product.

## 6. Attach the 41 original merchant tools

Keep the workspace running. Save a private connection file containing the actual UUID and its existing managed URL record:

~~~json
{
  "schema": "stellar-forge.openfema-workspace-connection.v1",
  "workspaces": {
    "public-assistance": {
      "label": "Programme Public Assistance portfolio",
      "workspaceId": "ACTUAL_ORIGINAL_WORKSPACE_UUID",
      "applicationUrlFile": "/absolute/private/original/application-url.json"
    }
  }
}
~~~

Alternatively select exactly one original consoleUrlFile or consoleUrlEnv. The adapter reads the current host reference and checks the UUID at the running service. A legitimate application restart can change its session and port while preserving the saved alias.

Declare complete sourcePackages and deliveryInputs in that same connection when those original files will be received. Each declared path carries its complete file SHA; tool arguments choose the host alias. See the [merchant guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openfema/MCP.md) for the full source, mapping and customer CSV shapes.

Create a private setup JSON with directory, connection and name:

~~~json
{
  "directory": "/absolute/private/openfema-merchant",
  "connection": "/absolute/private/openfema-connection.json",
  "name": "Public Assistance operator"
}
~~~

Initialize and connect the existing merchant transport:

~~~sh
npx --no-install starforge runtime-install run \
  --dir /absolute/private/openfema-runtime -- \
  merchant-providers init openfema-workspaces \
  --options /absolute/private/openfema-setup.json

npx --no-install starforge runtime-install run \
  --dir /absolute/private/openfema-runtime -- \
  merchant-mcp-client-config \
  --config /absolute/private/openfema-merchant/merchant-mcp.json \
  --name openfema \
  --output /absolute/private/openfema-mcp-client.json
~~~

Apply the returned server entry through the existing MCP client's configuration workflow. The original generator writes the actual Node executable and installed stdio entry. The equivalent terminal launch is merchant-mcp-stdio with the same --config inside runtime-install run. An HTTP client can use merchant-mcp with that configuration and the host's existing MCP_ACCESS_TOKEN environment.

The tools expose source acquisition/receiving, six-table record inspection, review, dataset/release operations, original buyer receiving, mapped project exchange, complete archive receiving and bounded file reads. Exact action schemas and typed replies are exported by the original client. The source-selected provider loads its native implementation only when configured.

Save every action's operation ID, payload and expected revision before dispatch. On an interrupted response, inspect that original operation and continue the unchanged request. Native generation and portfolio-version checks remain part of their original actions.

## 7. Deliver through the original merchant and buyer engines

**Publication** prepares a selected table as an original SF30 dataset with all source provenance, then uses the existing SF82 release lifecycle. Its query contract pages up to the native dataset limit; deliver all agreed rows. **Customers** receives the original completed SF88/SF100 intents and retains dataset.csv, dataset.jsonl, review.html, delivery.json and manifest.json.

Keep the actual source owner, merchant operator, payer, agreed request, spending and receiving analyst with the same customer workorder. Runtime connection or package adoption retains that original commercial operation. The [commissioning workorder](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openfema/examples/commissioning-workorder.md) and complete commissioning guide describe the retained inputs and receiving responsibilities.

## 8. Save and reopen the whole project

Use **Handover** or the existing workspace.export action to receive the complete native ZIP. It includes source responses and metadata, portfolio versions, review and acceptance history, mappings, original customer CSVs, project deliveries, comparisons, operation results and native publication state.

The merchant retains the complete archive in its original private export directory and returns a stable workspace file selection. The typed downloader can continue the same bytes after a session change and reopen the received files offline. Restore the complete archive into a new private directory, then select that actual restored directory through Applications.

The [receiving guide](RECEIVING.md) gives the exact inspect, restore, restart and complete exchange commands, and distinguishes original workspace restoration from file-transport verification.
