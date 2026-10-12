# Starforge source monitoring

Receive original OpenSanctions data editions, reconcile complete source changes, operate the customer's native screening requests and continue customer decisions in one retained workspace.

This selected package includes:

- The original seven-view source-monitoring console and SF30 NDJSON query/storage engine.
- Complete edition, delta, statement, counterparty, case and native response receiving.
- Managed Applications review, save, start, open, stop and reopening.
- The typed `MonitoringClient` and `source-monitoring-client` command for the same authenticated console.
- Original source installation, runtime transfer and complete customer workspace export/import.

## Open the complete guide

The [installation, operation and customer receiving guide](../../../../products/source-monitoring/OPERATING.md) is the primary workflow. In an installed archive it is retained at:

~~~text
source/products/source-monitoring/OPERATING.md
~~~

Its complete native source and [Applications guide](../../sf30-seller-sdk/ndjson/opensanctions/MANAGED_APPLICATIONS.md) are included in this same archive.

## Source and installation

Build this exact recipe from a selected original Git commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace \
  --ref COMMIT_SHA --selection source-monitoring \
  --out /absolute/private/releases/source-monitoring
~~~

Retain the returned archive, full manifest and SHA-256. The package's original source revision and selection are immutable inputs to the existing build continuation.

Install the original archive in a new source application with package scripts disabled, or prepare it through the original runtime installer. Monitoring uses Node 22.16+ and Python 3.11+ standard libraries. Managed operation uses Linux and `flock`; native screening uses the customer's selected yente deployment.

~~~sh
starforge runtime-install prepare --dir /absolute/private/runtimes/source-monitoring \
  --archive /absolute/source-monitoring.tgz --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --operator
starforge runtime-install install --dir /absolute/private/runtimes/source-monitoring
starforge runtime-install inspect --dir /absolute/private/runtimes/source-monitoring --load --source
~~~

The complete operating guide gives source-only installation, actual workspace initialization/import, original JSON startup and private connection, Applications selection, the complete native API client, original provider response receiving, export and same-workspace reopen.

## Installed command catalog

`source-monitoring`, `source-monitoring-client`, `dataset-ndjson`, `dataset-ndjson-merchant`, `dataset-ndjson-customer`, `dataset-ndjson-job`, `installation`, `runtime-profile`, `runtime-install`, `runtime-workspace` and `runtime-transfer` retain their original command implementations.

Inspect the selected registrations with `starforge registrations --source ndjson` and `starforge registrations --source source-monitoring-product`.

The typed client export is:

~~~js
import { MonitoringClient } from
  '@tokenjunkielabs/starforge-merchant/source-monitoring/client';
~~~

Customer data, original native responses and case histories travel in their complete customer workspace archive. Select its actual delivery audience and existing data entitlement when handing it to another operator.
