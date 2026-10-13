# Complete merchant handover

The merchant workspace can now travel with its business database, complete invoice history, provider responses, original paid files, retained fulfillment editions and executable application source. The handover opens in a browser without connecting to a payment provider.

## Export the current workspace

Stop its existing merchant server cleanly, then run the same application:

    node products/x402api-merchant-workspace/server.mjs export \
      --directory /absolute/private/merchant-workspace \
      --config /absolute/merchant.configuration.json \
      --output /absolute/private/merchant-handover

Choose an unused output directory beneath a directory owned by the operator. The export takes the merchant's existing kernel ownership lease, reads the current database and creates a SQLite backup. It leaves the original invoices, runtime history and provider records unchanged. A running merchant keeps the lease, so export asks the operator to stop that existing server first.

The final JSON identifies the original store, all table counts, the complete file inventory and the manifest SHA256. Retain that SHA256 with the handover. Repeating the same export into the same complete directory returns the existing handover when the original state, configuration and executable source still match.

This edition includes the maintained file-delivery fulfillment adapter. Its configured manifest must contain every fulfillment edition referenced by an existing invoice, including older editions. Export copies every selected delivery file and checks it against the original binding, byte count and SHA256.

The output contains:

- `workspace/merchant.sqlite3`: the complete SQLite snapshot, including original requests, authorizations, exchanges, events, fulfillment returns, runtime records and history.
- `workspace/results/`: all original files retained by the merchant.
- `original/`: unchanged configuration and original fulfillment manifest.
- `fulfillment/`: every retained delivery edition and a portable manifest.
- `configuration/merchant.json`: the same payment and resource settings, with local source and delivery paths made portable.
- `source/`: the complete merchant application, operator guides, receiving programmes and required shared source.
- `records/`: full invoice records and original request/response bodies for inspection.
- `index.html` and `operator/`: the offline invoice and history viewer.
- `MANIFEST.json`: every complete member's original length and SHA256.

Configuration retains credential environment-variable names. Supply their values on the receiving machine through the existing environment configuration. Keep this complete private workspace with its authorized operator.

## Receive an earlier complete directory copy

A complete earlier directory copy can retain absolute paths from its original machine. Export accepts `--original-root /original/recorded/root --retained-root /actual/complete/copy` together with its current `--directory` and `--config`. It reads the files at their retained locations while preserving all original database paths. Restore relocates the new working copy.

## Open and inspect

Open `index.html` to inspect invoices, histories and paid files directly. The included local server also provides consistent downloads in browsers that restrict local file navigation:

    node products/x402api-merchant-workspace/server.mjs serve-archive \
      --bundle /absolute/private/merchant-handover --port 8765

Open the printed loopback URL. The viewer lets the operator find an invoice, inspect its saved history and provider responses, and download the original delivery, invoice record or full database. This local server serves only the complete inventoried archive files. It checks the printed loopback authority and keeps the private invoice data from being embedded by a different website.

Verify the entire handover before moving it:

    node products/x402api-merchant-workspace/server.mjs inspect \
      --bundle /absolute/private/merchant-handover \
      --expected-sha256 MANIFEST_SHA256_FROM_EXPORT

The receiver checks every original file, the complete inventory, the SQLite schema and integrity, the original store identity and the business-state fingerprint. Copy or archive the entire directory together.

## Restore on the receiving machine

Use Node 24 on Linux with the existing `flock` utility. The original application also requires a supported Node version for its SQLite API. Run the included source from the received handover:

    node /absolute/private/merchant-handover/source/products/x402api-merchant-workspace/server.mjs restore \
      --bundle /absolute/private/merchant-handover \
      --expected-sha256 MANIFEST_SHA256_FROM_EXPORT \
      --directory /absolute/private/merchant-restored

Restore prepares a complete new directory, copies every original member, and rewrites the saved local result paths in the copied database to their new location. Invoice identifiers, payments, request bytes, signatures, provider responses, fulfillment returns, original timestamps and history stay attached to the same store. The source handover remains complete and unchanged.

`RESTORE.json` records the original manifest, receiving directory and each relocated result. Repeating this restore into the same completed receiving directory returns the existing restoration, including when the merchant has subsequently continued working there.

The copied `MANIFEST.json` is the original archive inventory. The restored database becomes the live workspace; produce a new export to capture later activity.

Configure the same credential environment references, retain the merchant's public origin, and open the received application:

    node /absolute/private/merchant-restored/source/products/x402api-merchant-workspace/server.mjs doctor \
      --config /absolute/private/merchant-restored/configuration/merchant.json

    node /absolute/private/merchant-restored/source/products/x402api-merchant-workspace/server.mjs serve \
      --config /absolute/private/merchant-restored/configuration/merchant.json \
      --directory /absolute/private/merchant-restored/workspace

The original public origin is part of existing payment requests and stays in the restored configuration. Use the normal deployment and DNS setup for that origin when bringing the merchant service back into production. The local operator remains available at the configured loopback address.

Completed invoices reopen their original retained outputs. An interrupted in-progress invoice keeps its original state and follows the existing reconciliation path when service resumes. A delivery can already be saved while its invoice's final status update is still pending; export and restore preserve that original state and retain the delivery for the same reconciliation path.

## Original five-invoice receiving

The complete native receiving programme for this feature is `portable-receiving.mjs`, with `receive-portable-native.py` restoring the original previously completed commissioning package at its recorded paths. It uses the complete original five-invoice case and its retained files, exports the whole merchant, opens every delivery in the offline browser, restores a fresh workspace, reopens the existing application and downloads all five original outputs again. Its result records the original and received identities and any provider invocation during reopening.

## Recover an interrupted retained delivery

The handover preserves both committed invoice results and a retained fulfillment that was saved before the invoice’s final status update. It includes the original returned body, its matching SF31 destination reservation, any written partial prefix, and any completed final file. Restore changes the destination paths in the copied reservation to the new workspace, keeps the original payment, reservation tag, process ID and returned bytes, and records each path change in `RESTORE.json`. Opening the restored merchant lets its existing reconciliation finish the retained delivery. The original archive stays available with its original paths and bytes.

Repeated export compares the current database, workspace files, configured adapter, delivery manifest, retained editions and complete source before reusing an existing handover. Repeated restore reopens the receiving database and checks its merchant identity and required paths, so a stale marker cannot stand in for a working workspace.
