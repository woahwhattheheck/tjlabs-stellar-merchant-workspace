# Data preparation workspace

Retain original CSV and JSON Lines editions, join them with saved SQL recipes, review complete results, and hand over a project that another operator can reopen and edit. Applications, the original browser, the typed Node client and 21 merchant tools share one native Python/SQLite workspace.

| Entry | Customer workflow |
| --- | --- |
| Selection **data-preparation-workspace** | Installed Applications, original engine, typed tools and complete receiving |
| **starforge data-preparation** | Original create, import, recipe, run, review, export, receive and browser commands |
| **starforge data-preparation-managed** | Applications-owned listener over that same original workspace |
| Applications → Data preparation | Review, save, start, open, stop and reopen the original operator |
| **merchant_preparation_*** | Declared input import, native SQL, complete delivery and customer receiving |
| **./seller/data-preparation/connection** | Typed attachment, original row pages and streamed complete downloads |
| **./seller/data-preparation/managed** | Original receiving and installed Python launcher |
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

The initializer creates the original release store and merchant configuration with the source-owned preparationWorkspaceConnection input. Ordinary merchant configuration resolves it to the preparationWorkspaces provider family. Existing stdio and HTTP hosts use the same 21 tools.

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

This managed contribution adds Applications, instance-bound attachment, source-owned registrations, 21 typed tools and durable delivery around that engine. Its selection adopts the original data-preparation contribution and keeps the native Python/SQLite source in the installed product. The original guide remains at sf30-seller-sdk/data-preparation/README.md.


## Continue the retained original customer project

The complete native receiving programme is products/data-preparation/receiving.py with its adjacent receiving.mjs. It opens the exact original PREP12 demonstration package, preserves all 120,012 input rows and original recipe/result/review history, and continues it through Applications provider preparation, the managed listener, typed merchant tools, native browser downloads, complete retained files, stop/reopen and independent customer editing. It also loads the delivered six-row merchant dataset through the original SF30 command and assembles the complete runnable delivery.

~~~sh
python3 "$PREPARATION_SOURCE_ROOT/products/data-preparation/receiving.py" \
  --source-root "$PREPARATION_SOURCE_ROOT" \
  --source-commit FULL_40_CHARACTER_COMMIT \
  --package /absolute/private/Starforge_Data_Preparation_2026-10-12.zip \
  --directory /absolute/private/new-managed-receiving \
  --node /absolute/existing/node \
  --playwright-module /absolute/existing/node_modules/playwright \
  --chromium /absolute/existing/chromium
~~~

The original package is 1,143,288 bytes with SHA-256 38b52c9837c81177d691127e07587894de7ae52bd6ef74013b02a18578814577. Its existing attachment is F0C8Q7QV5G9 in the original preparation Slack case. Use the existing full package and an empty receiving directory under an owned private parent. The programme retains its original operation directory on failure so the same customer state can be inspected. Its complete output links the maintained source and includes the original project, complete delivered files, independently editable customer project and the actual operating result.
