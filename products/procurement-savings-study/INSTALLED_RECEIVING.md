# Installed receiving

Use the exact prepared source and complete root AGENTS.md rendered-product instruction. Open the final HTML at normal presentation width and narrow width, inspect the actual display, and use the populated and empty workflows, input controls, export and reopened contents.

The source courses exercise actual production modules with explicitly supplied services:
- `receiving/portable-course.cjs`: assembled HTML handlers and atomic IndexedDB.
- `receiving/host-course.cjs`: Merchant dispatch, exact source ingest, all declared paged readers, immutable operations and saved request recovery.
- `native/receive-installed.mjs`: actual Node private directories, sole listener, export byte ranges and reopened request history.

Host-course results retain the next step and complete original state/request/edition history for interrupted continuation. Continue from that saved checkpoint; source inputs and operation IDs remain unchanged.

Keep hosted Actions disabled and use the existing native receiving operation.

For a complete prepared export, `receiving/resumable-archive.cjs` advances whole source groups and returns a complete checkpoint; its default leaves final output streaming to the receiver. Preserve the compact original workload and each prepared checkpoint before continuation. `receiving/checkpoint-storage.cjs` caches exact immutable payload text; publish every returned referenced object before publishing its index, and acknowledge durable object writes only after the provider succeeds.

The complete prepared index can be finished without gathering the entire ZIP in memory:

```
node native/finish-prepared.mjs --checkpoint /absolute/checkpoint.json --manifest-sha256 EXACT_SHA256 --output /absolute/Procurement_Complete_Export.zip
```

The checkpoint directory contains the original `objects/*.part` references. The native receiver verifies exact index bytes, all retained fragments, all original member SHA-256/CRC values and the export manifest. It writes a provisional file, independently hashes the written archive and publishes the completed ZIP atomically. Existing exact output is reusable. This preserves every source file, saved working session, historical study, request and managed edition.

## Standalone source and host integration

The complete source handover includes the maintained shared writer, Applications helper and storage, Merchant provider contract, and default ZIP codec. From the extracted product directory, `node native/receive-installed.mjs` runs with Node builtins and the included product files. The native CLI and private listener use the same local source closure.

`setup.mjs` installs this product into the complete Applications/Merchant host. That host operation uses the maintained repository's `stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs` and `stellar-forge/mcp-merchant-operator/config.mjs`; run it through the installed `procurement-savings-study` source selection. The standalone receiving command uses the local included helpers directly.
