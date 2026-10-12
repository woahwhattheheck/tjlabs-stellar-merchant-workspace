# Complete GSA DCAT catalog migration

This directory contains the complete source and both actual 344-record GSA catalog editions for `DCAT-GSA-MIGRATION-20261012-390E`. It runs the original legacy conversion, compares the current catalog, preserves an already-current catalog byte for byte, reviews specific identifier corrections, and retains every complete request, result and candidate.

The application engine and all 37 upstream converter, schema, license and Poetry files are included. [SOURCE.json](SOURCE.json) records the exact original source packet and this portable edition. The converter and upstream files retain their original bytes.

## Run the complete operation

Use [RUN.md](RUN.md) for the original Python 3.13 environment. The declared Python 3.12 profile uses the same original locked packages; [PORTABLE_RUNTIME.md](PORTABLE_RUNTIME.md) gives its complete installation and integration contract.

For an existing Python 3.12 installation:

```bash
python3.12 -m venv /private/dcat-runtime
/private/dcat-runtime/bin/python -m pip install \
  --require-hashes --only-binary=:all: \
  -r portable-runtime-requirements.txt

/private/dcat-runtime/bin/python -B run_catalog_migration.py \
  --engine-root application/ckan \
  --legacy inputs/legacy-data.json \
  --current inputs/current-data.json \
  --runtime-profile portable-python312 \
  --output /private/dcat-native-results
```

Select an owned output directory. The complete driver retains full requests, candidate bytes, original converter output, all findings and reviewed identity mappings. Its final run manifest records the real interpreter and selected profile. The default `original` profile keeps the upstream Python 3.13 requirement; a caller using Python 3.12 selects `portable-python312` explicitly.

## Completed native operation

The original operation completed on Linux with Python **3.12.14**, after installing all 47 main packages from the unchanged lock with distribution hashes.

| Phase | Original records retained | Result |
| --- | ---: | --- |
| Legacy conversion and comparison | 344 of 344 | Output exactly matches the unchanged original converter; 11 series identifiers require correction. |
| Current 3.0 preservation | 344 of 344 | Candidate is byte-identical to the current source; validation succeeds. |
| Explicit reviewed identifier correction | 344 of 344 | Candidate validates, with zero added or missing records and all identity mappings retained. |

The automatic legacy conversion and direct original output share SHA-256 `dfd5360448b12c813daafdff087285b30be0577ccd9af7e06742d76e29225df9`. The reviewed candidate is `cc4792b65d3da562b597a6868de16b2333473c1c280ea1c33f885a52562431e9`. [NATIVE_OPERATION.json](NATIVE_OPERATION.json) contains the returned complete run manifest and artifact identities.

[Download the complete original native receiving](https://chatgpt.com/api/library/files/libfile_8bc231519a9c81918b377070c3cfd5ca/download). The 4,429,949-byte TAR includes the whole source, both source carriers, all native outputs, full runtime and dependency details, and complete controller. Its SHA-256 is `461bd4b86f07c711ee42f942f26e50a345ee91e1f40704b60c00c387d2f09e0a`.

## Continue the original application

The original CKAN/DCAT application owns the installed browser, Node, MCP and complete workspace receiving. Its engine interface is documented in [DCAT_ENGINE.md](application/ckan/DCAT_ENGINE.md). Carry the explicit runtime profile with the selected interpreter, and retain the complete candidate, source, comparison and identity mappings in that same application.

The original application/source coordination and native result are in [the existing 390E thread](https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791837791209079?thread_ts=1791730220.899469&cid=C0BTB4SUCP9).
