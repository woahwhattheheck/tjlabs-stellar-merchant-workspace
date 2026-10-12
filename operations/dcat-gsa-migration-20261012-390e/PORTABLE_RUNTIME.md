# Original GSA migration on Python 3.12

This explicit execution profile runs the retained DCAT-GSA-MIGRATION-20261012-390E operation on actual Python 3.12. The default `original` profile continues to require Python 3.13 or newer. Select `portable-python312` explicitly for a Python 3.12 process.

## Source and runtime contract

The complete 37-file GSA source remains unchanged at GSA/dcat-us commit `4996591483b52f4ccc0cb72c42e4ec3fe59a4b06`. Its manifest, converter, transforms, all schemas, project declaration and dependency lock retain their original bytes. The upstream project still declares `>=3.13,<4.0`.

The portable profile changes the wrapper's interpreter selection and declares it in every native review. Its source uses Python features available in 3.12, including standard `tomllib`, and every selected package in the retained main dependency lock accepts Python 3.12. The lock contains compatible CPython 3.12 or stable-ABI distributions for its compiled packages.

Every original dependency-range check, registry selection, format-checker requirement, schema outcome, converter call, field comparison, identity mapping and conservation rule stays in the native operation. The profile accepts actual versions `>=3.12,<3.13`; the interpreter's real version is recorded. Runtime profile selection belongs to the host invocation and does not add an accepted field to the customer JSON request.

The installed source contains the successor wrapper and operation driver together. Their byte identities differ from the original frozen packet; the run manifest records that original packet SHA256 and original engine SHA256 alongside the exact successor engine it executes. Keep the full original packet with the receiving source.

## Prepare one private environment

Choose an actual Python 3.12 executable and an owned source directory. The following commands start in the complete materialized packet root:

~~~sh
python3.12 -m venv .runtime-python312
.runtime-python312/bin/python -m pip install --require-hashes --only-binary=:all: \
  -r portable-runtime-requirements.txt
.runtime-python312/bin/python -B application/ckan/dcat_migration.py \
  --runtime-profile portable-python312 --check-runtime
~~~

The requirements file is a direct, complete export of the original lock's 47 main packages and original SHA256 distribution hashes. It excludes the development-only packages. The unchanged upstream Poetry project continues to select its original interpreter range, so this portable environment installs the locked distributions directly. For an already supplied offline wheelhouse, add `--no-index --find-links /absolute/wheelhouse` to the same pinned install command.

A host with an existing compatible complete dependency selection may select its actual Python 3.12 executable directly. The runtime reports actual and locked versions, `lock_matches`, and the complete format set. Retain that output. Missing original dependencies or format checkers must be installed before the complete operation can run.

## Run the complete original case

~~~sh
.runtime-python312/bin/python -B run_catalog_migration.py \
  --runtime-profile portable-python312 \
  --engine-root application/ckan \
  --legacy inputs/legacy-data.json \
  --current inputs/current-data.json \
  --output native-results
~~~

The source inputs remain the complete original 344-record legacy catalog and complete original 344-record current catalog. The operation retains all three phases: full legacy conversion with current-edition comparison, exact-byte current preservation, and an explicit reviewed candidate with typed identity mappings for the series identifiers rejected by the actual IRI checker.

The complete automatic legacy output is compared byte for byte with a separate invocation of the unchanged original conversion function in the same declared runtime. A changed original output fails the operation. The reviewed candidate must conserve every original member. Every actual schema exception, proposed correction, exact input, complete request, native stdout/stderr, candidate and run manifest stays in the owned output directory.

A complete review with catalog corrections remains an operation result. Runtime, request, source, process and conservation failures are recorded by the complete driver and return a nonzero operation exit. Deliver the complete source, original frozen packet and the whole output directory into the same 390E receiving thread so the maintained installed application can continue its original case.

## Native interfaces

CLI: `--runtime-profile original|portable-python312`.

Python APIs: `review_catalog(..., runtime_profile="portable-python312")`, `process_request(..., runtime_profile="portable-python312")`, and the retained runtime opener `_OriginalRuntime(original_root, runtime_profile="portable-python312")`.

Portable native review metadata adds:

~~~json
{
  "runtime_profile": {
    "id": "portable-python312.v1",
    "required_python": ">=3.12,<3.13",
    "upstream_required_python": ">=3.13,<4.0"
  }
}
~~~

The original profile retains its existing runtime metadata shape. Portable review identities include the explicit profile through the existing canonical complete-review hash.
