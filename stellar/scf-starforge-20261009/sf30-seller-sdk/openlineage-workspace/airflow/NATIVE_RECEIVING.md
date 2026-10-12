# Native Airflow commissioning receiving

The receiving entry runs the installed Apache Airflow provider against the original
OpenLineage workspace application. It executes a complete two-task CSV DAG twice,
keeps both original native run identities and provider source bodies, then moves
the entire editable application and its commissioning history to a receiving
directory. Run it on one existing Linux host with the selected Python environment.

## Prepare the actual runtime

Use Node 22.16 or later and the host's ordinary Python, flock and tar tools. The
Python environment must satisfy the complete environment.py report:
apache-airflow >=2.11.0, apache-airflow-providers-openlineage ==2.20.2,
apache-airflow-providers-common-compat >=1.15.0,
apache-airflow-providers-common-sql >=1.32.0, openlineage-python >=1.52.0 and
openlineage-integration-common >=1.52.0.

Reuse an installed compatible environment. For this standalone receiving case,
a new private Python 3.10–3.12 virtual environment can use Apache Airflow 2.11.0.
Install that Airflow pin with its official version/Python constraint file, then
install provider 2.20.2 while retaining the Airflow pin. Keep the actual install
log and dependency inventory with the native operation. The commissioning
executor itself performs no installation. Existing customer environments keep
their inspected Airflow and Python versions in the reviewed plan.

The driver creates its own private AIRFLOW_HOME and SQLite database. It uses
SequentialExecutor with Airflow 2 and LocalExecutor with Airflow 3 for this
receiving case. Its dags test commands run both actual original tasks locally.
For Airflow 2, it registers the selected original DAG with the native
`dags reserialize --subdir` command after migration and before the first run
inventory. This preparation is confined to the driver's private database and
retained as the native-dag-registration phase. Reopening the same operation
reuses that completed phase and its original command logs.
An installed Airflow 3 runtime must support that native command and its local
database configuration; the environment and command records identify the actual
runtime used.

## Run the original case

Hydrate the complete parent OpenLineage application and its airflow directory
from the same release. The parent browser assets and all original application
modules are required for customer export. The airflow handover source inventory
includes RECEIVING.mjs, receiving_csv_dag.py and this guide alongside the
maintained commissioning files.

Use an empty private operation directory, or the same directory when continuing
this operation. Keep the permanent native receiving lock file with the directory.

    mkdir -p /absolute/private/airflow-commissioning
    chmod 700 /absolute/private/airflow-commissioning
    flock --nonblock --conflict-exit-code 75 \
      /absolute/private/airflow-commissioning/.native-receiving.lock \
      node /absolute/application/airflow/RECEIVING.mjs \
      /absolute/private/airflow-commissioning \
      --python /absolute/selected-venv/bin/python

Operation identity:

    SCF-AIRFLOW-PROVIDER-COMMISSIONING-E258-20261012

The stable input CSVs are preserved under inputs/. The DAG reads the selected
working invoices.csv, writes normalized.json, then aggregates settlements.json.
The original first edition has four documents, including one credit, with a USD
400.25 total. The corrected edition changes INV-1002 from USD 75.25 to USD 95.25
and adds INV-1003 for USD 40.00. The native corrected total must be USD 460.25;
Northwind changes from USD 200.25 to USD 260.25 and Harbor remains USD 200.00.
All arithmetic occurs inside the actual Airflow task using integer cents.

The first run uses the provider's Airflow connection configuration. The second
uses its environment transport configuration. Both use the same actual collector
workspace, with distinct logical dates and original native DagRun IDs. Tokens
are generated into private files and passed in child environments; plan files
contain only credential variable or connection references.

The DAG implements the provider's documented get_openlineage_facets_on_start,
get_openlineage_facets_on_complete and get_openlineage_facets_on_failure methods.
Those methods return native SDK Dataset and OperatorLineage metadata. The
installed provider owns the DAG/task event construction and emission. Its
original events must show normalize_invoices and settle_customers START and
COMPLETE lifecycles with the actual source, normalized and settlement file
datasets.

## Receive the complete customer workflow

The same entry continues through:

1. Original installed environment inspection and private native database migration.
2. First CSV processing, native execution report, provider source receiving and
   immutable first commissioning edition.
3. Actual input correction, second native run, exact correction totals and
   immutable corrected commissioning edition.
4. Comparison of both native cohorts, preserving each source and event membership.
5. Complete customer export, including the original parent application, the
   complete Airflow operator and the exact reviewed plans.
6. Receiving into a new directory and opening the received application in its
   own Node process. Original native wire bytes are read back by their identities.
7. A later receiving-operator edition, followed by replay of the same original
   handover. The later edition and current revision must remain present.
8. Closing that application process and opening another from the received source.
   The original two editions, later operator edition, sources and events remain.

## Continue and collect

airflow-native-operation.json retains completed phases, the original selected
Python interpreter, source editions, workspace identity, collector port and
all actual native command locations. Run the unchanged command against that
same directory to receive unfinished work. The Python executor keeps each
original DAG/logical-date selection under its immutable plan and native worker
record. It receives an existing worker or actual native DagRun before another
DAG launch. Its explicit --receive mode performs receiving only.

Native command directories retain complete stdout and stderr, actual command,
PID, exit code, signal and timestamps. Each native-execution-* directory retains
the exact original plan, configured observation, before/after native inventories,
worker launch attempts and execution.json. artifacts/ retains both original
normalized and settlement outputs.

A complete return consists of airflow-native-receiving.json,
airflow-customer-handover.json, the two commissioning reviews and comparison,
the native command and execution directories, actual dependency/install records,
and the original input/output files. Keep the operation directory private:
Airflow's native logs and its local database belong to the receiving operator.
The standalone customer handover follows the operator's explicit export rules.

## Original Apache contracts

- [Provider requirements and release](https://airflow.apache.org/docs/apache-airflow-providers-openlineage/stable/index.html)
- [Provider configuration](https://airflow.apache.org/docs/apache-airflow-providers-openlineage/stable/configurations-ref.html)
- [Native operator metadata methods](https://airflow.apache.org/docs/apache-airflow-providers-openlineage/stable/guides/developer.html)
- [Airflow 2.11 native CLI](https://airflow.apache.org/docs/apache-airflow/2.11.0/cli-and-env-variables-ref.html)
- [Airflow 3.3 native CLI](https://airflow.apache.org/docs/apache-airflow/3.3.1/cli-and-env-variables-ref.html)
- [Official Airflow installation and constraints](https://airflow.apache.org/docs/apache-airflow/stable/installation/installing-from-pypi.html)
