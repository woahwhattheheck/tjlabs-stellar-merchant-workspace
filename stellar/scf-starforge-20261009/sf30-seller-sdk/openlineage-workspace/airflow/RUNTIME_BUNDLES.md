# Receive the original Airflow runtime

This tool carries the complete selected Python package graph with the Airflow
commissioning case. A receiving operator installs the original versions from
the delivered wheels, then continues the original native programme with that
interpreter.

The first retained case uses CPython 3.12.14 on Linux x86_64, Apache Airflow
2.11.0 and the OpenLineage provider 2.20.2. Its installed inventory contains
144 packages. Select that original inventory; keep later runtime selections
as separate bundles.

The selected merchant installation registers `starforge openlineage-airflow`
for the original commissioning CLI. Its complete Airflow sources, including
this runtime tool and guide, are carried under
`source/stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/airflow/`.
Customer handovers also retain these sources. The receiving operator accepts
complete original handovers as well as the edition containing the runtime tool.

## Build the complete selected bundle

Use the original preparation's installed-native-environment.json and its
Apache constraints file. Run from the complete application root:

~~~sh
python3 airflow/runtime_bundle.py build \
  --profile /private/original/preparation/installed-native-environment.json \
  --constraints /private/original/preparation/apache-airflow-2.11.0-constraints-3.12.txt \
  --directory /private/runtime-delivery/bundle \
  --source-distribution python-nvd3 \
  --setuptools-version 80.7.1 \
  --wheel-version 0.45.1 \
  --operation-id SCF-AIRFLOW-PROVIDER-COMMISSIONING-E258-20261012

python3 airflow/runtime_bundle.py archive \
  --bundle /private/runtime-delivery/bundle \
  --output /private/runtime-delivery/airflow-original-runtime.tar.gz
~~~

The builder retains every original package wheel, the original installed
profile, the exact constraints file, command output, the unchanged
python-nvd3 source distribution, its locally built wheel, and the separate
build-tool wheels. The build tools must match literal pins in the retained
Apache constraints file. Building that older source distribution with those
selected tools prevents its build preparation from selecting a newer
setuptools release.

The 144-package runtime receives its own complete wheelhouse. Build tools
live in a separate private build interpreter and do not change that runtime
selection. Requirements for receiving include each selected wheel's SHA256.
The manifest binds the full file inventory, package metadata, Python
implementation/version and platform.

An interrupted build can continue with the same profile, constraints,
source-distribution selection and directory. Existing downloaded wheels
remain available to the same builder. Each command keeps a separate
complete log. A complete bundle is immutable. Archive export publishes the final
TAR only after the complete file has been written, so an interrupted export can
be repeated from that same complete bundle.

## Receive the delivered archive

Materialize the complete archive and the maintained runtime_bundle.py.
Compare the archive SHA256 with the delivered value when selecting it:

~~~sh
python3 airflow/runtime_bundle.py receive \
  --archive /private/incoming/airflow-original-runtime.tar.gz \
  --sha256 DELIVERED_ARCHIVE_SHA256 \
  --directory /private/received/airflow-runtime
~~~

Receiving verifies every archive member before publishing the new bundle
directory. Opening the same complete archive at that destination returns
the existing bundle. Select a separate directory for a different runtime
edition.

## Restore in the original operating location

Use the same Python implementation, exact version and platform recorded
in the delivered manifest. The selected destination must be empty or contain
this tool's retained receiving intent for the same bundle. A completed receiving
record is bound to that absolute directory and interpreter path; copying an
installed virtual environment to a new location does not change that binding.

~~~sh
python3 /private/received/airflow-runtime/runtime_bundle.py restore \
  --bundle /private/received/airflow-runtime \
  --runtime /original/private/selected-venv
~~~

Restoration installs the entire selected graph with package indexes disabled,
using only the delivered wheels and hash-locked requirements. It runs the
native dependency check and compares every installed package name/version
with the original inventory. Its runtime-receiving.json retains the original
bundle SHA256 and actual interpreter.

When restoring an interrupted commissioning case, select the exact interpreter
path already recorded in its plan and operation. Preserve its original
operation directory, AIRFLOW_HOME/database, collector address, inputs, plans
and receiving destinations. The complete commissioning driver then continues
that original operation under its existing flock:

~~~sh
flock --nonblock --conflict-exit-code 75 \
  /original/private/operation/.native-receiving.lock \
  node /original/application/airflow/RECEIVING.mjs \
  /original/private/operation \
  --python /original/private/selected-venv/bin/python
~~~

The runtime archive carries dependencies. The original commissioning case
carries the original native operation and customer work. Keep both when
moving or restoring an interrupted operation.

## Inspect a received bundle

~~~sh
python3 airflow/runtime_bundle.py inspect \
  --bundle /private/received/airflow-runtime
~~~

The returned manifest identifies every full wheel and source member, the
complete original package graph, and the original build selection. The
restored runtime can be reopened with the same restore command; a completed
matching receiving verifies its current package graph and returns the
retained receiving record.
