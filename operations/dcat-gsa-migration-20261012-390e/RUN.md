# Complete GSA native migration operation

Operation: DCAT-GSA-MIGRATION-20261012-390E

This packet contains the complete source and actual inputs for one native operation. The first receiver that explicitly accepts and starts it owns execution; reconcile that acceptance in the existing company/coordination thread so another queued host does not duplicate the run.

## Materialize original bytes

Decode files[path].content_base64 into a new owned directory. Reject absolute paths or traversal components. Before writing, verify every byte count and SHA-256 in this packet. The complete selection includes the unchanged 37-file GSA source and its original dependency lock. No source download is needed after receiving the packet.

## Use the original runtime

From application/ckan/vendor/gsa-dcat-us/jsonschema:

~~~sh
poetry env use python3.13
poetry install --only main --no-interaction
export SCF_DCAT_PYTHON="$(poetry env info --executable)"
"$SCF_DCAT_PYTHON" -B ../../../dcat_migration.py --check-runtime
~~~

Use an already provisioned Python3.13+ host. Install the original lock there, or receive its complete compatible offline wheel/cache selection through the current source/dependency operator. Preserve the lock and all original source files.

Then run from this packet's root, choosing a new owned output directory:

~~~sh
"$SCF_DCAT_PYTHON" -B run_catalog_migration.py \
  --engine-root application/ckan \
  --legacy inputs/legacy-data.json \
  --current inputs/current-data.json \
  --output native-results
~~~

The driver runs the actual JSON process boundary for:
1. Complete legacy1.1 conversion with current3.0 comparison.
2. Exact-byte current3.0 preservation and direct original validation.
3. Explicit internal candidate correction for series identifiers that the actual IRI checker rejects, with exact per-record identity mappings and complete revalidation.

The third phase records proposed UUID URNs in its own candidate artifact. Every original source and converter output is retained. The driver independently compares the wrapper's automatic output with the unchanged original conversion function on the whole legacy catalog.

Retain native-results completely, including requests, outputs, candidate bytes, original exceptions, comparison changes, proposed corrections and run-manifest.json. Return the actual Python/dependency receipt and full output artifact. If additional candidate exceptions remain, deliver those exact source-backed paths for the same operation's next correction. The maintained Node application/archive receiving follows this domain run in the original coordinated operation.

## Operation status

The driver preserves complete engine review results with exit codes 0 and 2; code 2 reports catalog corrections to review. It returns nonzero for runtime/request/source failures, unexpected process exit codes, a missing JSON review contract, or a failed original-byte/conservation assertion. Every completed subprocess stdout/stderr and the final run manifest remain in the owned output directory, including `operation_ok` and `process_failures`.

## Explicit Python 3.12 profile

A complete portable Python 3.12 execution is available through `--runtime-profile portable-python312`. Use the full environment and original-case commands in `PORTABLE_RUNTIME.md`; the complete original converter, schemas and lock remain unchanged. The default profile keeps the original Python 3.13 requirement.
