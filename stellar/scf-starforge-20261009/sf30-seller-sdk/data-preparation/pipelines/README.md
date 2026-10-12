# Preparation pipelines

Build a complete dataset through a sequence of saved preparation steps, retain intermediate results, and hand the entire editable project to another operator.

The pipeline workspace uses the original data-preparation `Workspace` for every source import, saved SQL recipe, native query, exact-decimal function, result file, review and merchant delivery. It adds a dependency graph and a durable execution journal. It does not replace the query engine or create a second payment service.

## Start with the source or offline package

Python 3.11 or later on a POSIX host is required. The Python application has no third-party dependencies. Node 22 or later is needed only for the Node launcher and typed HTTP client.

From this directory:

```sh
python3 cli.py --workspace ./project init --label "Revenue preparation"
python3 cli.py --workspace ./project serve --port 8777
```

Open the exact `http://127.0.0.1:PORT` address printed by the operator. The application is loopback-only. Use the **Original inputs**, **Pipelines**, **Executions**, **Compare runs** and **Handover** sections.

Build the complete offline archive from maintained source with `node package.mjs ./dist`. With the supplied npm archive, installation requires no network service:

```sh
npm install --offline --ignore-scripts ./tokenjunkielabs-data-preparation-pipelines-0.1.0.tgz
npx --no-install starforge-data-pipelines --workspace ./project init
npx --no-install starforge-data-pipelines --workspace ./project serve
```

A cumulative Starforge distribution selecting the `data-preparation-pipelines` contribution exposes the same operation as `starforge data-pipelines`. Set `STARFORGE_PYTHON` to choose the Python executable. A local source archive includes the original preparation implementation alongside this directory.

## Import and bind exact originals

```sh
python3 cli.py --workspace ./project import orders.csv --alias orders --label "October order ledger"
python3 cli.py --workspace ./project import accounts.jsonl --alias accounts --format jsonl
```

The commands return retained source identities. The browser selects readable source labels and row counts. Importing new bytes produces a new source edition; saved pipeline executions retain their earlier selection.

Each stage's SQL alias selects either a named original input or another saved stage. Stages may branch and join, and may appear in any order in the definition. Dependency validation rejects cycles, absent references and duplicate stage names before the definition is saved.

A minimal two-stage definition is:

```json
{
  "label": "Customer totals",
  "inputs": {"orders": "RETAINED_ORDER_SOURCE_ID"},
  "stages": [
    {
      "id": "closed_orders",
      "label": "Select closed orders",
      "sql": "SELECT * FROM orders WHERE status = :status ORDER BY order_id",
      "parameters": {"status": "closed"},
      "bindings": {"orders": {"input": "orders"}}
    },
    {
      "id": "totals",
      "label": "Calculate customer totals",
      "sql": "SELECT account, decimal_sum(amount) AS gross FROM selected GROUP BY account ORDER BY account",
      "bindings": {"selected": {"stage": "closed_orders"}}
    }
  ],
  "outputs": ["totals"]
}
```

Save and execute it:

```sh
python3 cli.py --workspace ./project save pipeline.json
python3 cli.py --workspace ./project run PIPELINE_ID --revision 1 --request-key october-closed-01
```

Use a stable request key for the same invocation. Reusing that key with the same pipeline edition and source identities returns the original execution. Rebinding it to different inputs or another edition is rejected. The browser retains its enqueue request key across a lost response.

An explicit complete `--inputs` JSON mapping can select other source editions for a new run without changing the saved definition. No stage silently selects an alias's latest edition. The browser's **Start from an original saved recipe** control copies that recipe's actual SQL, parameters and source identities into a new pipeline definition.

## Editions and concurrent editing

Saving another edition requires the last observed revision:

```sh
python3 cli.py --workspace ./project save revised.json --id PIPELINE_ID --expected-revision 1
```

Older definitions remain available for execution. Existing executions contain their complete frozen definition, original input records, stage attempts and native recipe/run references.

For programmatic first creation, a caller may preselect an identifier in the form `p_` plus 32 lowercase hexadecimal characters and pass it as `pipeline_id` with `expected_revision=0`. After a lost save response, read that identifier rather than creating another pipeline. An out-of-date edit returns a reload error instead of replacing another operator's work.

## Exact values and intermediate results

The original SQLite query authorizer continues to enforce selected-source, read-only access. SQL parameters accept text, integers, booleans and null. Use quoted text for monetary decimals and for integers outside JavaScript's safe range when using the browser or Node client.

Use `decimal_sum`, `decimal_add`, `decimal_sub`, `decimal_mul`, `decimal_cmp` and `decimal_quantize` for the original exact-decimal semantics. Ordinary SQLite numeric expressions retain ordinary SQLite behavior; this layer does not make binary floating-point arithmetic exact.

A nonempty stage is imported into the next stage from its complete original JSON Lines result, preserving null separately from empty text. An empty result is imported from its header-only CSV so its exact column schema is preserved without inventing a row. Every imported intermediate keeps its upstream run and digest in the execution journal.

All stage results are available as complete CSV, JSON Lines and schema files. The browser preview is paged; the typed client can iterate all rows. A page is never used as an export. CSV renders both null and empty text as empty cells; JSON Lines keeps the distinction.

## Stop, resume and recover

```sh
python3 cli.py --workspace ./project cancel EXECUTION_ID
python3 cli.py --workspace ./project recover
python3 cli.py --workspace ./project resume EXECUTION_ID
```

One pipeline executor holds the workspace's pipeline lease. The original engine independently owns its native mutation lock. A different original operation can therefore make a pipeline wait without losing its queued stage. Definitions, status reads and cancellation remain available.

Recovery marks abandoned native work interrupted only after acquiring the original engine's lock. Resume reuses completed stage results and creates another native attempt for an unfinished, failed or cancelled query. A SQL aggregate interrupted halfway through is restarted; its partial output is never presented as complete.

The journal records an attempt token before saving its native recipe. The token identifies that exact native recipe after a lost response. A recipe has one original native run for each attempt; recovery adopts its existing queued or completed run rather than enqueueing it again. All failed/interrupted attempts remain in history.

The browser offers explicit recovery and resume controls. A second pipeline waiting behind an active native mutation needs an explicit Resume after the writer is available; no hidden scheduler or background service is installed.

## Review, compare and deliver

A result review is written through the original preparation review operation, using the exact native run identity and optimistic review revision. Reviewing does not change a dataset or block an operator from exporting it.

Execution comparison includes every stage and every changed input selection. Result equality compares the complete ordered JSON Lines digests. It is order-sensitive and is not a key-matched row-difference report.

```sh
python3 cli.py --workspace ./project report EXECUTION_ID ./pipeline-report.html
python3 cli.py --workspace ./project deliver EXECUTION_ID ./customer-results.zip
python3 cli.py --workspace ./project export ./project.zip
python3 cli.py --workspace ./received receive ./project.zip
python3 cli.py --workspace ./received serve --port 8777
```

**Customer results** includes all selected complete output datasets and their schemas plus an operating report. **Editable project** includes the entire original native preparation project together with all pipeline definitions, execution attempts and event history. A recipient may save new editions and run the project independently.

The pipeline receiver verifies archive member sizes and hashes, rejects duplicate or unexpected paths, invokes the original native project receiver, and cross-checks every pipeline reference against its reconstructed sources, recipes and results. It never loads a supplied SQLite database or executes saved SQL during receiving. The default expanded-byte allowance is 20 GiB and can be changed with `--max-bytes`.

Use the **pipeline** project export to retain the pipeline graph and history. The original preparation-only export remains its original format and does not include the new pipeline journal.

The **Handover** section also produces a dataset package through the original SF30 merchant writer. It retains the original field/null-indicator mapping and merchant limits. Complete result and project downloads remain available independently of merchant packaging.

## Typed Node client

```js
import { PipelineClient } from './client.mjs';

const client = new PipelineClient('http://127.0.0.1:8777');
const state = await client.state();
const selected = state.pipelines.items[0];
const execution = await client.enqueue(selected.id, 'customer-run-01', {
  revision: selected.revision
});
await client.execute(execution.id);
const finished = await client.wait(execution.id);
if (finished.status !== 'COMPLETE') throw new Error(finished.message);

for await (const row of client.allRows(finished.id, finished.definition.outputs[0])) {
  // Consume the complete retained result without collecting it in memory.
  console.log(row);
}
const delivery = await client.exportProject();
await client.download(delivery.download, './customer-project.zip', {
  bytes: delivery.bytes,
  sha256: delivery.sha256
});
```

Downloads are streamed into a temporary file, checked against complete length/digest, then published create-only. Aborted or failed transfers do not replace an existing customer file. The client also provides complete pipeline/execution pagination and event iteration.

For a retained Python process, `cli.py --workspace PATH rpc` accepts one complete JSON request per line:

```json
{"id":"customer-1","operation":"enqueue","arguments":{"pipeline_id":"PIPELINE_ID","revision":1,"request_key":"customer-run-01"}}
```

Operations include `state`, `list`, `definition`, `from-recipe`, `save`, `enqueue`, `execution`, `execute`, `resume`, `cancel`, `recover`, `events`, `rows`, `review`, `compare`, `import`, `report`, `deliver`, `merchant` and `export`. The CLI's `call OPERATION --arguments-file FILE.json` uses the same dispatch. Long native execution occupies that one RPC process; use a separate operator request for concurrent cancellation.

## Implementation boundary

`engine.py` owns pipeline metadata and execution coordination; `delivery.py` owns the outer pipeline archive. The original `preparation.py` and `transfer.py` own native data and computation. `server.py`, the browser, the Python CLI and `client.mjs` share that implementation.

The accompanying original-engine correction allows SQLite's column-free `count(*)` authorization callback only after the same selected source view has authorized the table. Unrelated sources, workspace metadata, SQL writes and extension loading remain outside that query connection's authorization.
