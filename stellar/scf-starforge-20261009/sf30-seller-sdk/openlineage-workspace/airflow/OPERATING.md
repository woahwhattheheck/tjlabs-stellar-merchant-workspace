# Airflow commissioning

Connect an installed Apache Airflow environment to the OpenLineage operations workspace, commission complete DAG runs, compare two saved editions and deliver the original application and data.

The installed Apache provider generates every event. This operator supplies configuration, execution receiving, source review and handover around that provider.

## Included operating functions

- Inspect the actual Python, Airflow, provider, SDK and selected DAGs.
- Compile Apache OpenLineage provider 2.20.2 configuration while retaining the customer's Airflow version.
- Execute a complete native DAG with persistent process identity, original output, run inventory and exact plan binding.
- Read complete, revision-consistent source and event records from the existing collector.
- Review original DAG terminals, task states, datasets, jobs and facets across two saved editions.
- Deliver the original workspace and complete Airflow operator in one portable handover.
- Select the cohort and inspect saved results through the offline browser desk.
- Integrate six callable actions through the maintained host's existing input and directory aliases.

Node 22.13.0 or later runs the workspace and operator. The Python helpers run inside the customer's installed Airflow environment. Apache provider 2.20.2 requires Airflow 2.11.0 or later. The inspector checks the installed provider and its actual dependency versions.

## Choose the complete operating path

| Work to complete | Entry and full guide | Result to retain |
| --- | --- | --- |
| Commission the customer's selected DAG cohort | [This guide](OPERATING.md), [environment inspector](environment.py), [commissioning CLI](cli.mjs) and [browser desk](desk.html) | The inspected environment, reviewed plans, complete native executions and two saved workspace editions |
| Receive the selected Python runtime | [Runtime bundle operations](RUNTIME_BUNDLES.md) and [maintained runtime helper](runtime_bundle.py) | The exact complete dependency archive, manifest, installed inventory and runtime receiving record |
| Operate the original CSV commissioning case | [Full native receiving guide](NATIVE_RECEIVING.md) and [native entry](RECEIVING.mjs) | Both real CSV editions, native provider events, complete reviews, customer handover and independent receiving/cold reopen |
| Continue an interrupted case | The original native entry with `--report`, then the same original invocation | The current phase, original command/output files, existing worker or native run and subsequent receiving progress |

The selected merchant installation exposes `starforge openlineage-airflow` for the commissioning CLI. The commands below use its complete source entry directly. A portable customer handover contains the original OpenLineage application and all 18 Airflow source files. [sources.json](sources.json) maps those files, their entry points, the original implementation editions and the Apache contracts.

Keep the operating case, its original database and native command records on persistent storage. The Python runtime can be restored from its exact delivered archive. Its selected absolute interpreter path stays with the original plan and operation.

## 1. Inspect the original environment

Run from the OpenLineage application directory:

~~~bash
python airflow/environment.py --dag-id ORIGINAL_DAG --output environment.json
~~~

Repeat the named DAG option for the complete cohort. The inspector reads installed distribution metadata and asks the original CLI for its capabilities. It resolves the provider's effective configuration without constructing an emitting client. The JSON includes the selected configuration source, destination, credential presence and native command summaries. Credentials are omitted from the observation.

Save the original startup JSON announced by the running OpenLineage application as connection.json. It contains the workspace identity, current process identity and collector origin. Use the current workspace read token for review commands and the existing producer token for Airflow where those roles are separate.

The provider obtains transport configuration from an Airflow connection, a configuration file, an Airflow transport setting or the Python client fallback. The executor resolves the installed provider configuration and compares its actual destination with the reviewed plan before the DAG starts.

## 2. Select the actual DAGs

Open airflow/desk.html directly in a browser. Import the environment observation and workspace connection. Enter the namespace, original DAG IDs and logical dates, then download selection.json.

~~~json
{
  "operationId": "customer-airflow-commissioning-20261012",
  "title": "Customer Airflow commissioning",
  "namespace": "customer.airflow.production",
  "mode": "connection",
  "connectionId": "commons_openlineage",
  "tokenEnv": "COMMONS_OPENLINEAGE_TOKEN",
  "compression": "gzip",
  "dags": [
    {
      "dagId": "warehouse_daily",
      "logicalDate": "2026-10-13T00:00:00Z",
      "expectedTerminal": "COMPLETE",
      "taskIds": ["extract_orders", "build_daily_revenue"]
    }
  ],
  "runTimeoutSeconds": 3600,
  "continueOnFailure": false
}
~~~

The native command returns the actual Airflow run ID. A logical date includes its timezone and identifies the original business interval. For a DAG loaded directly from a file, add its original dagFilePath. For a configured Airflow 3 bundle, use bundleName. The executor reads the installed CLI help before choosing the supported flag. An optional conf object supplies the reviewed original DAG configuration.

The taskIds list describes the actual expected task inventory. DAG state and the provider's own emission declaration explain skipped or optimized tasks. An EmptyOperator can complete without executing a task process, so the review retains the DAG's explanation alongside emitted task events.

Choose a unique operation ID for the original commissioning assignment. A second complete review edition has a different logical date and its own saved plan, with the same operation ID and workspace.

## 3. Compile and install the selected provider configuration

~~~bash
node airflow/cli.mjs plan --environment environment.json --connection connection.json --selection selection.json --directory commissioning
~~~

The command writes the exact plan.json and returns its SHA-256. It also writes the environment observation, selected cohort, required Airflow/provider versions, connection example and installation command list.

Use installation.json in the original approved image or virtual environment. The commands retain the installed Airflow version explicitly while selecting provider 2.20.2. Airflow's matching constraints file applies to the Airflow installation. The subsequent provider installation keeps Airflow pinned while resolving the provider's documented dependencies. The executor performs no installation or database migration.

Generic Connection mode puts transport in connection extras and lets the native provider resolve the connection password. Process-environment mode passes the original Python HTTP transport through the Airflow transport setting. Both modes obtain a token from the host variable named by tokenEnv. The selection contains the variable's name, never its value. For an existing local collector that uses no authentication, set useAuthentication to false in the selection.

The executor configures the original child execution environment. For a persistent deployment, use the existing scheduler and worker configuration mechanism and restart those services after applying the reviewed settings. Every emitting scheduler and worker needs the same provider edition and transport.

The generated native emission policy selects the named DAG cohort and excludes source-code capture. Supply emissionPolicy when the customer needs another documented native policy. The compiler validates the provider's actual rule fields and scope shapes.

## 4. Save the baseline and execute the complete DAG

~~~bash
node airflow/cli.mjs begin --directory commissioning --session first --token-file /private/workspace-token
python airflow/execute.py --plan commissioning/plan.json --plan-sha256 EXACT_SHA_FROM_PLAN --output /private/airflow-run-first
~~~

Set the original provider token in the selected host variable through the host's credential mechanism. The baseline records the complete original source and event selection before the DAG starts.

The executor checks actual versions and effective transport, inventories the exact DAG and logical date, and invokes the original full airflow dags test command. It retains a private plan copy, worker and child identities, complete output logs, exit code and before/after native run inventories. Repeating the invocation receives the existing worker. Add --receive to read original work without creating another DAG run.

The full-DAG command executes the selected tasks and dependencies, using the original DAG code and configured services. Use the commissioned environment's intended data and original logical date.

If the original command is still running, receive its existing operation. If its destination is unreachable, inspect the recorded native output, correct the actual collector or configuration, and continue that execution record. A changed reviewed plan belongs in a new private execution directory.

## 5. Save the first native review edition

~~~bash
node airflow/cli.mjs review --directory commissioning --session first --execution /private/airflow-run-first/execution.json --token-file /private/workspace-token
~~~

The review reads every source and event page at one workspace revision. It selects events from the intended namespace and exact native Airflow run identity or logical date. It includes original DAG terminals and task states, native task run IDs, dataset inputs and outputs, job metadata, full run facets, source byte identities and complete retained events. Additional cohort-shaped events from another run remain separately visible.

A completed cohort is saved as an original workspace edition. A run still receiving events has a current review document identifying the missing terminal, task declaration or parser diagnostic. The next review invocation receives newly committed events from the same baseline.

If the server committed an edition before a response was interrupted, the stable edition operation ID recovers that same saved edition on the next invocation. A complete saved review is returned unchanged when reopened.

## 6. Commission and compare the second edition

Correct the actual source or configuration that the customer wants to compare. Select the next original logical date and save selection-second.json.

~~~bash
node airflow/cli.mjs plan --environment environment.json --connection connection.json --selection selection-second.json --directory commissioning/second-plan
node airflow/cli.mjs begin --directory commissioning --plan commissioning/second-plan/plan.json --session second --token-file /private/workspace-token
python airflow/execute.py --plan commissioning/second-plan/plan.json --plan-sha256 SECOND_PLAN_SHA --output /private/airflow-run-second
node airflow/cli.mjs review --directory commissioning --plan commissioning/second-plan/plan.json --session second --execution /private/airflow-run-second/execution.json --token-file /private/workspace-token
node airflow/cli.mjs compare --directory commissioning --first first --second second --token-file /private/workspace-token
~~~

The commissioning directory retains both exact plans and their baseline records. Each execution directory retains its original native process and outputs. Comparison uses the existing workspace edition comparison and carries the original job, dataset and run changes.

Open a saved review JSON in the desk to inspect the full result. Generate a printable report:

~~~bash
node airflow/cli.mjs report --directory commissioning --out commissioning/COMMISSIONING.html
~~~

## 7. Deliver and receive the complete product

~~~bash
node airflow/cli.mjs export --directory commissioning --out handover.json --token-file /private/workspace-token
node airflow/cli.mjs verify --input handover.json
node airflow/cli.mjs receive --input handover.json --directory received-workspace
~~~

Export requires the two complete saved commissioning editions. It obtains the original full workspace export through the existing resumable download client. The handover contains that exact bundle, source bytes, all review documents and the entire Airflow operator.

Receiving verifies the handover and original workspace package, installs the workspace into a new staging directory, writes the Airflow operator beside the received application and publishes the complete directory. A failed installation cleans up its owned staging directory. Receiving the same handover again returns the original receiving result and preserves later workspace corrections.

~~~bash
node received-workspace/application/cli.mjs serve --workspace received-workspace
node received-workspace/application/airflow/cli.mjs status --directory received-workspace/commissioning
~~~

Use the newly announced connection for future execution. Keep historical plans intact; a new commissioning plan records the reopened collector origin and current environment.

## 8. Receive the runtime and continue the original operation

The runtime bundle is a separately delivered part of the operating package. Follow [RUNTIME_BUNDLES.md](RUNTIME_BUNDLES.md) to build it from an original installed inventory, inspect its complete members, or receive an existing archive. Use the maintained helper shipped beside this guide for receiving and restoration.

Run from the complete application root:

~~~bash
python3 airflow/runtime_bundle.py receive --archive /private/incoming/airflow-original-runtime.tar.gz --sha256 DELIVERED_ARCHIVE_SHA256 --directory /private/received/airflow-runtime
python3 airflow/runtime_bundle.py restore --bundle /private/received/airflow-runtime --runtime /original/private/selected-venv
~~~

The helper checks the delivered manifest, Python implementation, exact Python version and platform. It installs the original wheel graph with package indexes disabled, runs the native dependency check and compares the complete installed inventory. Repeating restore at the same selected location verifies and receives the existing runtime. The original reference package is CPython 3.12.14 on Linux x86_64, Airflow 2.11.0 and OpenLineage provider 2.20.2, with 144 packages; another customer's inspected environment keeps its own explicit selection.

For a continued case, restore to the interpreter path already recorded in that case. Preserve the original operation directory, AIRFLOW_HOME/database, collector address, input files, exact plans and receiving destinations. These records identify the existing run and its saved work.

The complete native entry in [NATIVE_RECEIVING.md](NATIVE_RECEIVING.md) performs private environment preparation, original DAG registration, both actual CSV executions and the full customer receiving journey. Its private Airflow 2 database registers the selected DAG with the native `dags reserialize --subdir` command before the first run inventory. The saved phase and command logs are reused when the operation continues.

Read an existing operation without starting a DAG:

~~~bash
node /original/application/airflow/RECEIVING.mjs /original/private/operation --report
~~~

Continue that same operation after receiving its current state:

~~~bash
flock --nonblock --conflict-exit-code 75 /original/private/operation/.native-receiving.lock node /original/application/airflow/RECEIVING.mjs /original/private/operation --python /original/private/selected-venv/bin/python
~~~

The fixed report is available from startup and after each native phase. It retains the current phase, interruption history, both available execution reports and complete original command files. If an initial inventory reports an absent native DAG registration, use the current complete driver on the same private case. That inventory return occurs before creation of a native worker specification; the registered DAG can then be received by the same case. An existing worker specification or actual native run is reconciled by the executor.

## Read and deliver the operating records

| Record | Meaning and use |
| --- | --- |
| `environment.json`, exact `plan.json` and archived `plan-<sha256>.json` | The actual inspected environment, selected original DAG/configuration and immutable workspace binding |
| Each native `execution.json` and command directory | The original native argv, process identity, stdout/stderr, exit, selected logical date and before/after run inventories |
| `airflow-native-operation.json` | The full receiving driver's original phase checkpoints, interpreter, workspace and retained source editions |
| `airflow-native-receiving.json` | The current full native receiving summary and exact private command/execution files, including an interrupted first command |
| Saved commissioning reviews and comparison | The two complete original event/source cohorts and the changes between their saved editions |
| `airflow-customer-handover.json` | The complete exported original application, all Airflow sources and reviewed commissioning documents, ready for independent receiving |
| Runtime manifest, `runtime-intent.json` and `runtime-receiving.json` | The selected complete dependency graph, intended installation location and actual installed receiving result |

The native receiving summary advances as the original case advances. A prepared runtime, a completed DAG and an independently reopened customer handover are separate completed phases in that record. Receive the full original phase outcome and its files when assessing the delivery.

Keep complete native command logs, local Airflow databases and private execution records with the operating case. Customer export selects the reviewed documents and executable application through the maintained handover rules. The complete native entry then receives that export into another directory, preserves later saved work when the same archive is replayed, and opens the received application in a new process.

## Complete source and implementation index

The [machine-readable source index](sources.json) lists every current Airflow handover member and its role. The handover's own inventory binds the exact delivered bytes and hashes. Current exports carry 18 Airflow files; the receiver also accepts the original complete 16-file edition.

| Source group | Complete maintained files |
| --- | --- |
| Environment and native execution | [environment.py](environment.py), [execute.py](execute.py) |
| Plan, workspace receiving and reporting | [plan.mjs](plan.mjs), [client.mjs](client.mjs), [io.mjs](io.mjs), [report.mjs](report.mjs) |
| Operator entry points | [cli.mjs](cli.mjs), [mcp.mjs](mcp.mjs), [desk.html](desk.html), [package.json](package.json) |
| Portable customer receiving | [handover.mjs](handover.mjs) |
| Original full native commissioning | [RECEIVING.mjs](RECEIVING.mjs), [receiving_csv_dag.py](receiving_csv_dag.py), [NATIVE_RECEIVING.md](NATIVE_RECEIVING.md) |
| Original runtime delivery | [runtime_bundle.py](runtime_bundle.py), [RUNTIME_BUNDLES.md](RUNTIME_BUNDLES.md) |
| Operating guidance and original contracts | [OPERATING.md](OPERATING.md), [sources.json](sources.json) |

The implementation history joins the [complete commissioning product](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/571), [native DAG registration](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/625), [complete runtime handover](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/691), [full native progress and recovery receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/731), and [atomic runtime continuation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/739).

## Operator integration and source

Import createAirflowOperator from airflow/mcp.mjs and supply the maintained host's existing input, directory and output alias resolvers. The six actions compile a plan, save a baseline, review a cohort, compare editions, export and receive a handover. The existing LineageClient performs the workspace actions.

The Airflow directory is an adjunct to the original workspace. Its handover preserves the original application inventory and established receiver, then installs the adjunct atomically. Existing dbt and asynchronous SDK producers continue to use the same collector.

The sources.json file contains primary Apache and OpenLineage documentation for this edition. Configuration and event semantics follow the pinned provider; the installed environment and native output remain with each commissioning case.

## Process ownership and original cohorts

The commissioning client requires Node.js 22.13.0 or later, where the built-in SQLite module is available without a command-line flag. Directory mutations use an SQLite transaction on the private .commission-lock.sqlite3 file. A concurrent operation returns the original-operation instruction; process death releases the database lock automatically. Keep the lock database in place and resume the same commissioning directory.

Native Airflow DAG identity is authoritative whenever its facet supplies dag_id. Job-name fallback is used only when the native DAG identity is absent. An available native logical date must match the selected date even when an explicit native run-ID map is supplied. Runs from a different DAG or date therefore remain outside the reviewed cohort.
