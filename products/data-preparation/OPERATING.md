# Data preparation workspace

Retain original CSV and JSON Lines editions, join them with saved SQL recipes, review complete results, and hand over a project that another operator can reopen and edit. Applications, the original browser, the typed Node client and 40 merchant tools share one native Python/SQLite workspace.

| Entry | Customer workflow |
| --- | --- |
| Selection **data-preparation-workspace** | Installed Applications, original engine, typed tools and complete receiving |
| **starforge data-preparation** | Original create, import, recipe, run, review, export, receive and browser commands |
| **starforge data-preparation-managed** | Applications-owned listener over that same original workspace |
| Applications → Data preparation | Review, save, start, open, stop and reopen the original operator |
| **merchant_preparation_*** | Declared input import, native SQL, complete delivery and customer receiving |
| **./seller/data-preparation/connection** | Typed attachment, original row pages and streamed complete downloads |
| **./seller/data-preparation/managed** | Original receiving and installed Python launcher |
| **./seller/data-preparation/pipelines/connection** | Original pipeline client on the same private Applications attachment |
| **./seller/data-preparation/mcp** | Typed host configuration, tool arguments and merchant class |
| **starforge dataset** | Original SF30 inspection of a prepared merchant dataset |

## Install the selected product

Use a POSIX host with Node 22.16 or later and Python 3.11 or later. The preparation engine uses the Python standard library, SQLite and the original native transfer implementation. It requires no Python package installation. STARFORGE_PYTHON selects an existing Python executable.

From the maintained repository, build the selected source at the full commit containing this guide:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace \
  --ref FULL_40_CHARACTER_COMMIT \
  --selection data-preparation-workspace \
  --out /absolute/private/preparation-build
~~~

The selected package contains the complete original Python engine and browser, its client, the managed layer, source-owned registrations, merchant tools, native customer commands and this guide. The source builder retains the exact source and dependency manifest. Continue the same interrupted build with --resume; --status inspects that operation.

Install the produced archive using its actual SHA-256:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/private/preparation-runtime \
  --archive /absolute/private/preparation-build/ACTUAL_ARCHIVE.tgz \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/private/preparation-runtime
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/private/preparation-runtime --load
~~~

Inspection returns the READY installation's actual sourceRoot. Bind the following commands to that exact private installation:

~~~sh
PREPARATION_RUNTIME=/absolute/private/preparation-runtime
PREPARATION_SOURCE_ROOT=/ACTUAL_SOURCE_ROOT_RETURNED_BY_INSPECT
export PREPARATION_SOURCE_ROOT
starforge() {
  node "$PREPARATION_SOURCE_ROOT/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" \
    run --dir "$PREPARATION_RUNTIME" -- "$@"
}
~~~

This shell function works from the operator's directory. The JavaScript example below likewise imports from the installed source root. General references remain in distribution/RUNTIME_INSTALL.md and distribution/SOURCE_SELECTIONS.md.

## Create and open the original workspace

Keep the operator workspace, merchant host and customer destination beside one another under an owned private directory. Use mode 0700 for directories and 0600 for private host configurations.

~~~sh
mkdir -m 700 /absolute/private/preparation
starforge data-preparation \
  --workspace /absolute/private/preparation/operator \
  init --label "Customer data preparation"
~~~

The original create command writes workspace.json, native SQLite metadata, retained-input storage and result directories. To open an already delivered project, use the native receive command instead:

~~~sh
starforge data-preparation \
  --workspace /absolute/private/preparation/customer \
  receive /absolute/private/preparation/complete-project.zip
~~~

Receiving creates a new directory and reconstructs native tables from original files. It carries every retained source, recipe edition, run and review. A received project keeps the original creation metadata while having its own independently editable database.

Attach the selected installation to the existing runtime workspace:

~~~sh
starforge runtime-workspace attach \
  --workspace /absolute/private/runtime-workspace \
  --runtime /absolute/private/preparation-runtime
~~~

Open that runtime workspace's **Applications** section. Choose **Data preparation**, select the existing private operator directory, choose local port 0, then **Review**, **Save** and **Start**. Open the returned browser link.

Application review binds the directory identity and SHA-256 of the original immutable workspace.json. The managed launcher obtains an exclusive listener lease before opening the engine. It writes private preparation-connection.json, and the Applications observer authenticates the actual HTTP instance before publishing the browser link.

Direct managed launch is also available:

~~~sh
starforge data-preparation-managed \
  --workspace /absolute/private/preparation/operator \
  --port 0
~~~

The original browser remains available through data-preparation … serve. Use the managed launch when Applications and merchant tools should attach to the same listener.

## Use the original browser

The four original sections are **Inputs**, **Recipes**, **Results** and **Handover**.

1. **Inputs:** import complete CSV or JSONL files, choose aliases and inspect original cells. New bytes create retained editions; identical bytes and interpretation reuse an edition.
2. **Recipes:** select exact retained source IDs for each SQL alias, enter the read-only query and named parameters, and save an edition. An edit to an existing recipe requires its current revision.
3. **Results:** run the selected recipe edition, follow its saved run ID, page full results and record accept, revise or withdraw decisions. Old results and reviews remain available.
4. **Handover:** download a complete project archive or selected merchant dataset. Native result files and readable reports are also available for each result.

The managed bootstrap opens this original UI. It keeps the private token in the tab's session storage, removes the token fragment from the address bar and adds bearer/instance headers to native requests. Browser downloads use expiring single-use links for one selected file, so complete archives stream through the browser's normal download path.

**Stop** in Applications closes the listener, requests cooperative cancellation of its actual SQL jobs, drains active HTTP/file transfers and joins those jobs before releasing ownership. Completed native results and managed deliveries remain on disk. Reopen the same application to obtain a new listener instance over the saved project.

After an unexpected process exit, use the original **Recover** action. It obtains the original writer before marking abandoned work interrupted. **Rerun** creates a new attempt from that run's frozen recipe and input editions. A run that remained queued because another writer was active is resumed by **Start**.

## Declare input and customer aliases

Create a private host configuration such as /absolute/private/preparation/host.json:

~~~json
{
  "schema": "stellar-forge.data-preparation-workspaces.v1",
  "maxFileBytes": 21474836480,
  "maxExpandedBytes": 21474836480,
  "workspaces": {
    "operator": {
      "label": "Customer data preparation",
      "directory": "/absolute/private/preparation/operator",
      "inputs": {
        "orders": {
          "label": "Closed orders",
          "kind": "csv",
          "file": "/absolute/private/preparation/inputs/orders.csv",
          "sha256": "ACTUAL_64_CHARACTER_SOURCE_SHA"
        },
        "customers": {
          "label": "Customer directory",
          "kind": "jsonl",
          "file": "/absolute/private/preparation/inputs/customers.jsonl",
          "sha256": "ACTUAL_64_CHARACTER_SOURCE_SHA"
        },
        "incoming_project": {
          "label": "Received project",
          "kind": "project",
          "file": "/absolute/private/preparation/inputs/project.zip",
          "sha256": "ACTUAL_64_CHARACTER_ARCHIVE_SHA"
        }
      },
      "destinations": {
        "customer": {
          "label": "Independent customer project",
          "directory": "/absolute/private/preparation/customer"
        }
      }
    }
  }
}
~~~

Replace digest placeholders with the exact complete files and omit unused inputs. Input parents and receiving parents must already be private directories. A customer destination must be separate from every configured original workspace.

A CSV input may declare nullToken, such as "\\N". That token is part of the source's interpretation. JSONL keeps JSON null separately from empty text. Optional workspaceSha256 binds an alias to a previously observed original identity; configuration also retains the actual directory identity. Update an input's declared SHA before importing changed bytes.

The host-owned maxFileBytes controls complete project inputs and native immutable file readers. maxExpandedBytes is passed to the original receiver. Both default to its original 20 GiB receiving allowance; select a larger explicit allowance when the host and original project require it.

Save this initializer as /absolute/private/preparation/merchant-setup.json:

~~~json
{
  "directory": "/absolute/private/preparation/merchant",
  "connection": "/absolute/private/preparation/host.json",
  "name": "Preparation operations"
}
~~~

~~~sh
starforge merchant-providers inspect data-preparation-workspaces
starforge merchant-providers init data-preparation-workspaces \
  --options /absolute/private/preparation/merchant-setup.json
starforge merchant-mcp-stdio \
  --config /absolute/private/preparation/merchant/merchant-mcp.json
~~~

The initializer creates the original release store and merchant configuration with the source-owned preparationWorkspaceConnection input. Ordinary merchant configuration resolves it to the preparationWorkspaces provider family. Existing stdio and HTTP hosts use the same 40 tools.

## Complete agent workflow

Start with merchant_preparation_status to see aliases, complete input digests and customer destinations. Connect operator with merchant_preparation_connect. Retain the instance ID and original IDs returned by following operations.

| Tools | Work performed by the original engine |
| --- | --- |
| status, connect, disconnect, browser | Inspect and attach to the current Applications listener |
| records, source_page, result_page | Page complete original metadata and exact cell values |
| import_source | Import one declared complete file at its reviewed SHA |
| save_recipe | Save an original SQL edition and selected source bindings |
| run, start, rerun, cancel, recover | Operate original queued, running and interrupted SQL jobs |
| review | Append the selected result's native review revision |
| export, exports, file, file_release | Retain, list and read complete original deliveries |
| receive, received | Rebuild and reopen an independently editable customer project |

All names in the table have the merchant_preparation_ prefix.

Import each tabular input using its sourceInput, expectedSourceSha256 and SQL alias. Use the returned source IDs as recipe bindings. For an orders/customers schema matching the original preparation guide:

~~~sql
WITH totals AS (
  SELECT customer_id, decimal_sum(amount) AS gross
  FROM orders
  WHERE status = :status
  GROUP BY customer_id
)
SELECT customers.name, totals.gross
FROM totals JOIN customers ON customers.id = totals.customer_id
ORDER BY customers.name
~~~

save_recipe receives the SQL, selected source-ID bindings and {"status":"closed"} parameters. Native read-only authorizer rules restrict the query to those views. Save and run the returned recipe ID/revision, page its complete results, then append a review.

Inspect status after reviewing and retain its stateSha256. Export with a new operationId, that expectedStateSha256 and one kind:

- **project:** every original input, recipe edition, run, result file and review in a portable ZIP.
- **merchant:** the selected complete run's dataset CSV, original SF30 configuration, null/field mapping and README.
- **report:** the original selected run's readable HTML report and review history.
- **result:** one complete result.csv, result.jsonl or schema.json from the selected run.

Merchant, report and result exports require runId. A merchant may set a display label; a result may choose its filename.

Managed delivery acquires the original mutation lock, checks the reviewed state inside that lock and calls the existing transfer functions. It retains intent, a prepared-file record and final immutable content. A completed retry with the same operation ID and arguments reopens those exact bytes, including after Applications stops. An interruption before a completed file can continue against the same unchanged original state; if the project changed, inspect it and create a new delivery operation.

exports pages retained deliveries while disconnected. Keep its inventorySha256 across pages. records pages likewise retain a coherent stateSha256; a changed edition prompts a current first-page read.

file returns complete metadata plus base64 data, bytesRead and nextOffset. Continue until nextOffset is null. A read is bound to the full SHA and an opened immutable native descriptor. After restart, reopen the same fileId with its original expectedSha256 and byte offset, omitting the expired read ID. The native reader verifies the full file before returning chunks.

To receive a project, choose a declared destination and exactly one sourceInput of kind project or retained project fileId, plus the complete SHA. The original transfer engine checks every declared member, reconstructs SQLite tables from retained source/result bytes and restores recipes, runs and reviews. The managed receipt binds the customer directory to the accepted archive and supports replay after publication. received returns actual counts, directory and original identity. Open that destination as another Data preparation application and continue editing.

Disconnecting releases the merchant attachment's calls and file readers. Applications keeps its SQL process available to the browser and other clients. Separate configured workspaces have independent dispatch queues.

## Typed Node customer operation

Use the READY installation's exported source root. This example uses the orders/customers schema shown above, actual original hashes and absolute private paths:

~~~js
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';

const sourceRoot = process.env.PREPARATION_SOURCE_ROOT;
const fromSource = path => import(pathToFileURL(join(sourceRoot, path)).href);
const product = 'stellar/scf-starforge-20261009/sf30-seller-sdk/data-preparation/';
const {PreparationWorkspaceClient} = await fromSource(product + 'connection.mjs');
const {receivePreparationWorkspace} = await fromSource(product + 'managed.mjs');

const client = await PreparationWorkspaceClient.connect(
  '/absolute/private/preparation/operator/preparation-connection.json'
);
try {
  const orders = await client.importFile(
    '/absolute/private/preparation/inputs/orders.csv',
    {alias: 'orders', format: 'csv', expectedSha256: 'ACTUAL_ORDERS_SHA'}
  );
  const customers = await client.importFile(
    '/absolute/private/preparation/inputs/customers.jsonl',
    {alias: 'customers', format: 'jsonl', expectedSha256: 'ACTUAL_CUSTOMERS_SHA'}
  );
  const recipe = await client.saveRecipe({
    label: 'Closed orders by customer',
    sql: 'WITH totals AS (SELECT customer_id, decimal_sum(amount) AS gross FROM orders WHERE status = :status GROUP BY customer_id) SELECT customers.name, totals.gross FROM totals JOIN customers ON customers.id = totals.customer_id ORDER BY customers.name',
    bindings: {orders: orders.id, customers: customers.id},
    parameters: {status: 'closed'}
  });
  const queued = await client.run(recipe.id, recipe.revision);
  let run;
  do {
    await pause(250);
    run = (await client.state()).runs.find(value => value.id === queued.id);
  } while (run.status === 'QUEUED' || run.status === 'RUNNING');
  if (run.status !== 'COMPLETE') throw Error(run.message || run.status);

  for await (const row of client.resultRows(run.id)) {
    console.log(row);
  }
  await client.review({
    run_id: run.id, decision: 'accept', reviewer: 'Customer preparation',
    note: 'Reviewed the complete selected result.', expected_revision: 0
  });
  const current = await client.status();
  const delivery = await client.exportDelivery({
    operationId: 'customer-project-' + run.id,
    kind: 'project', expectedStateSha256: current.stateSha256
  });
  const archive = '/absolute/private/preparation/complete-project.zip';
  await client.downloadDelivery(delivery, archive);
  const received = await receivePreparationWorkspace({
    archive, directory: '/absolute/private/preparation/customer',
    expectedSha256: delivery.sha256
  });
  console.log(received);
} finally {
  await client.close();
}
~~~

For a streamed browser download, call resultDownloadLink(runId, filename), preparedDownloadLink(relativeUrl), or deliveryDownloadLink(fileId), then open the returned URL once within five minutes. These methods authenticate the ticket request and bind the chosen complete file to the actual listener. The inherited resultURL and downloadURL helpers are protected API locators; pass one to downloadLink when converting it into a browser download. downloadDelivery remains the full SHA-checked, create-only local file receiving path.

The managed client inherits the original typed preparation client, including source/result pages, recipes, run operations, reviews and full-state inspection. Managed methods add instance binding, persistent deliveries, complete streaming and explicit detach. A shared writer can leave a newly requested run queued; inspect it and use start(runId) when the original writer is available.

The original Python CLI remains a customer interface on that same received workspace:

~~~sh
starforge data-preparation \
  --workspace /absolute/private/preparation/customer state
starforge data-preparation \
  --workspace /absolute/private/preparation/customer \
  recipe --label "Customer revision" \
  --sql-file /absolute/private/preparation/customer-query.sql \
  --bindings '{"orders":"ACTUAL_RETAINED_SOURCE_ID"}'
starforge data-preparation \
  --workspace /absolute/private/preparation/customer \
  run ACTUAL_NEW_RECIPE_ID
~~~

## Saved pipelines on the same Applications workspace

Choose **Open preparation pipelines** in the original browser, or call merchant_preparation_pipeline_browser for the connected workspace. The pipeline editor opens on that same private listener and uses its original sources, saved SQL recipes and complete result files.

The original **Original inputs**, **Pipelines**, **Executions**, **Compare runs** and **Handover** sections provide the complete workflow:

1. Select the retained source editions and create a definition from a saved SQL recipe, or compose named stages. Each SQL alias selects an original input or a completed upstream stage. The engine checks dependencies and retains the stage order with the saved edition.
2. Save the complete definition and retain its ID and revision. A later edit uses that ID and its current expected revision, preserving the previous edition.
3. Enqueue with a stable request key, the exact saved edition and the complete named input selection. Start the returned execution. Repeating the same request key and selection returns its original execution.
4. Inspect each completed stage, its native run, complete rows, original input lineage and retained attempts. Stage execution uses the existing preparation engine, so each new attempt retains its own native recipe and run alongside the original project history.
5. Record the selected stage's review, compare complete executions, and export the whole editable project, selected result files, report or merchant dataset. The complete project carries both the original preparation state and the pipeline journal.
6. Receive that project and open its independent editor. The original receipt retains the accepted archive identity. Applications creates a private connection file for the received workspace and owns that child listener until Stop.

**Resume** retains completed stages and continues the original unfinished execution. **Recover** obtains the original executor lease before marking abandoned work interrupted. **Cancel** requests cancellation through the same pipeline and native SQL engine. Inspect a WAITING result and start or resume its saved execution when the original executor becomes available.

A new execution may explicitly select reuseExecution from an earlier saved execution. The original engine verifies its native source identity, frozen stage definition, inputs and complete retained result before reuse. It records the selected earlier execution and stage in the new journal. Preserve those returned IDs and decisions when continuing an operation after a lost response.

Stopping the parent Applications entry closes its received-project listeners, requests cancellation of their owned jobs and drains their active transfers. The complete received files, recipes, pipeline editions, executions and reviews remain saved. Reopening the parent and choosing a retained receiving reopens that exact private child. A received workspace can also be selected directly as its own Applications entry once the previous listener has closed.

### Typed pipeline operation

This example starts from an existing saved native SQL recipe in the operator workspace. Supply the actual recipe ID and revision as the two script arguments. It uses the READY installation's source root defined above.

~~~js
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir} from 'node:fs/promises';

const sourceRoot = process.env.PREPARATION_SOURCE_ROOT;
const product = 'stellar/scf-starforge-20261009/sf30-seller-sdk/data-preparation/';
const fromSource = path => import(pathToFileURL(join(sourceRoot, product, path)).href);
const {PreparationWorkspaceClient} = await fromSource('connection.mjs');
const {PreparationPipelineClient} = await fromSource('pipeline-connection.mjs');

const recipeId = process.argv[2];
const recipeRevision = Number(process.argv[3]);
if (!recipeId || !Number.isSafeInteger(recipeRevision) || recipeRevision < 1) {
  throw Error('Supply an existing saved recipe ID and its revision.');
}
const preparation = await PreparationWorkspaceClient.connect(
  '/absolute/private/preparation/operator/preparation-connection.json'
);
let customer;
try {
  const pipelines = new PreparationPipelineClient(preparation);
  const definition = await pipelines.fromRecipe(recipeId, {revision: recipeRevision});
  const saved = await pipelines.save(definition);
  const queued = await pipelines.enqueue(saved.id, 'customer-pipeline-' + saved.id, {
    revision: saved.revision
  });
  console.log({pipelineId: saved.id, revision: saved.revision, executionId: queued.id});
  await pipelines.execute(queued.id);
  const execution = await pipelines.wait(queued.id);
  if (execution.status !== 'COMPLETE') throw Error(execution.message || execution.status);

  for await (const row of pipelines.allRows(execution.id, 'prepare')) {
    console.log(row);
  }
  const review = await pipelines.review(execution.id, 'prepare', {
    decision: 'accept', reviewer: 'Customer preparation',
    note: 'Reviewed the complete saved result.', expectedRevision: 0
  });
  console.log({nativeRun: execution.stages.prepare.nativeRun, review});

  const destination = '/absolute/private/preparation/pipeline-delivery';
  await mkdir(destination, {recursive: true, mode: 0o700});
  const current = await pipelines.status();
  const project = await pipelines.exportDelivery({
    operationId: 'pipeline-project-' + execution.id, kind: 'pipeline-project',
    expectedStateSha256: current.stateSha256,
    expectedPipelineSha256: current.pipelineStateSha256
  });
  const archive = join(destination, project.filename);
  await preparation.downloadDelivery(project, archive);
  const received = await pipelines.receiveProject(archive, {
    requestKey: 'customer-receive-' + execution.id,
    expectedSha256: project.sha256
  });
  console.log(received);

  customer = await PreparationWorkspaceClient.connect(received.connectionFile, {
    workspaceSha256: received.workspaceSha256,
    expectedInstanceId: received.instanceId
  });
  const customerPipelines = new PreparationPipelineClient(customer);
  const restored = await customerPipelines.definition(saved.id, {revision: saved.revision});
  const {id, revision, createdAt, order, ...editableDefinition} = restored;
  const customerEdition = await customerPipelines.save({
    ...editableDefinition, label: restored.label + ' — customer edition'
  }, {pipelineId: id, expectedRevision: revision});
  console.log({receivedProject: received.id, customerEdition});
} finally {
  if (customer) await customer.close();
  await preparation.close();
}
~~~

Retain the returned pipeline ID/revision, execution ID, review revision, receiving request key and complete delivery record in the calling operation. After an interrupted invocation, inspect those records and continue the same saved stage; creating another definition starts a new customer operation. Enqueue and receiving request keys bind their exact original selections, while updates and reviews require the current expected revision.

The PreparationPipelineClient is a view over its owning PreparationWorkspaceClient. Its inherited original methods preserve the original metadata and execution model. Closing that attachment drains the view's requests and complete-file streams; Applications owns the actual listener lifecycle.

Pipeline resultURL returns a protected API path. Use pipelines.download(path, absoluteDestination, {sha256, bytes}) for a complete create-only file, or pipelines.downloadLink(path) for an authenticated single-use browser link. The original exportProject, report, deliver and merchant methods return a complete native download record; pass its download field to those same managed download methods.

### Pipeline tools and complete receiving

The following tools join the existing preparation catalog. Every name has the merchant_preparation_pipeline_ prefix and uses the same declared workspace alias.

| Tools | Original operation |
| --- | --- |
| status, browser | Inspect both current state digests and open the private pipeline editor |
| list, definition, from_recipe, save | Page saved editions, inspect a complete definition, start from a saved recipe and save an explicit edition |
| enqueue, execute, execution, events | Retain the original request selection, operate its saved execution and read complete attempt/event history |
| rows, review, compare | Page original stage results, record their native review and compare complete executions |
| cancel, recover | Cooperatively cancel or recover the original execution |
| export | Retain a complete project, results archive, report, merchant dataset or result file |
| receive, received, open_received | Receive a complete project and reopen its original independently editable private workspace |

For pipeline export, inspect status immediately before selecting a new operationId and include both expectedStateSha256 and expectedPipelineSha256. Choose:

- **pipeline-project:** the complete original preparation project and pipeline journal.
- **pipeline-results:** all original selected output stages of executionId.
- **pipeline-report:** the complete readable report for executionId.
- **pipeline-merchant:** the selected executionId and stageId as an original merchant dataset.
- **pipeline-result:** one original result.csv, result.jsonl or schema.json for executionId and stageId.

The original exporters hold their own native and pipeline locks. Managed publication checks both reviewed states before and after the full export and retains its complete file record. If an active writer changes either state, inspect the current project before preparing a new delivery. Completed operation retries reopen their existing verified content.

Use the existing merchant_preparation_exports and merchant_preparation_file tools for those retained files, including after Applications stops or the merchant host restarts. The full delivery record carries both source state digests, the actual byte length and complete SHA-256.

The original pipeline receiver retains its 20 GiB complete-archive and expanded-project allowance. The preparation host's maxExpandedBytes configures native preparation receiving; maxFileBytes also bounds declared project inputs and retained file readers.

Pipeline receiving accepts exactly one declared project sourceInput or retained pipeline-project fileId, plus expectedSourceSha256 and a stable requestKey. It uses the original receiver's saved receiving directory and archive receipt. Repeating the same request preserves the original received project, including independent edits made after it was received. The returned connectionFile, workspaceSha256 and instanceId identify its private attachment; origin and url are the browser's full opening URL.

For subsequent agent work in the received project, declare its returned private directory as another workspace alias in the host configuration and initialize the merchant host with that complete configuration. The same original preparation and pipeline tools then operate that customer workspace. Applications may own it through the parent receiving listener, or as its own selected entry after that listener closes.

## Merchant handover and data semantics

The merchant ZIP comes from the original merchant_delivery implementation. Keep dataset.csv, dataset.json and mapping.json together. After extracting that complete native dataset into a separate directory, inspect it through the installed original handler:

~~~sh
starforge dataset \
  --dataset /absolute/private/preparation/prepared-dataset/dataset.json
~~~

The configuration resolves its CSV relative to dataset.json. Use the existing seller configuration workflow for the chosen service path and payment terms. The selected product carries the original seller, merchant and buyer commands alongside this handover.

Source values remain text or null, including large integer identifiers and decimal lexemes. Ordinary SQL arithmetic retains SQLite behavior. Use the original decimal_sum, decimal_add, decimal_sub, decimal_mul, decimal_cmp and decimal_quantize functions for explicit exact decimal work.

Result JSONL preserves null separately from empty text. CSV represents both as an empty cell. Merchant delivery adds the original boolean null-indicator fields and retains their mapping. Original merchant limits are 64 exposed fields including null indicators, one million rows and 256 MiB of CSV; select narrower or partitioned recipes when needed. Complete project and result exports remain separate from those merchant limits.

The managed layer preserves the original SQL-preparation files. Declarative cleanup under data-preparation/records/ composes by importing its complete prepared CSV/JSONL output through the same native importer. Retain its output SHA and recipe history with that handover.

## Original source and receiving case

The original SQL engine, browser, typed client and transfer workflow are the 13-file PREP12 contribution from maintained PR415, merge 08caff5379d3111260b72738d481c0625abedb5b. Its original exercise and operating results are retained in the preparation case, including the 120,012-input-row, three-source project and independently editable receiving.

This managed contribution adds Applications, instance-bound attachment, source-owned registrations, 40 typed tools and durable delivery around that engine and its original saved pipelines. Its selection adopts the original data-preparation contribution and keeps the native Python/SQLite source in the installed product. The original guide remains at sf30-seller-sdk/data-preparation/README.md.


## Continue the retained original customer project

The full original receiving program is products/data-preparation/receiving.py with its adjacent receiving.mjs, receiving-source.json and RECEIVING.md. It opens the exact original PREP12 package, preserves all 120,012 input rows and original recipe/result/review history, and continues through Applications provider preparation, the managed listener, typed merchant tools, the original browser, complete retained downloads, stop/reopen and independent customer editing. It also loads the whole six-row merchant dataset through the original SF30 command.

Use the complete native source selected by receiving-source.json, currently commit 88feb91bc5089dced81813642aca24dc24ca713b. PREP12_SOURCE_ROOT below is the selected source from that exact commit; current maintained receiver files can reside separately. The receiver freezes and verifies all 35 original native source files before opening the project.

~~~sh
PREP12_SOURCE_ROOT=/absolute/selected-source-at-88feb91b
python3 products/data-preparation/receiving.py \
  --source-root "$PREP12_SOURCE_ROOT" \
  --source-commit 88feb91bc5089dced81813642aca24dc24ca713b \
  --package /absolute/private/Starforge_Data_Preparation_2026-10-12.zip \
  --directory /absolute/private/new-managed-receiving \
  --node /absolute/existing/node \
  --playwright-module /absolute/existing/node_modules/playwright \
  --chromium /absolute/existing/chromium
~~~

The original package is 1,143,288 bytes with SHA-256 38b52c9837c81177d691127e07587894de7ae52bd6ef74013b02a18578814577; its existing original attachment is F0C8Q7QV5G9. Use a new receiving directory beneath an owned private parent.

The program captures the original child's process identity across Linux PID namespaces and drains that exact owned group. Its complete delivery contains the original package, both closed editable workspaces, all complete downloads, preserved native directories and the actual operating result. An interrupted operation retains a complete closed checkpoint through the same packaging and save path. RECEIVING.md documents the whole journey, exact source/input identities and the optional supported five-helper save.
