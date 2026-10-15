# Hardware revision review desk

This directory is the complete installed Merchant application. Start with [OPERATING.md](OPERATING.md) for Applications, private managed sessions, native commands and customer-agent tools. [INSTALLED_RECEIVING.md](INSTALLED_RECEIVING.md) carries the installed native/browser receiving procedure. The original standalone source and documentation below remain available.

This complete offline application retains original KiCad XML, BOM and declared firmware pin-contract sources; freezes named source editions; compares revisions; and records comparison-bound electrical engineering, firmware and manufacturing reviews.

## Open or build

Open `output/Hardware_Desk.html` for a blank workspace or `output/Authored_Hardware_Example.html` for the separate fictional example when using the full delivery. The editable example includes its exact original sources and complete application.

To extract an application source envelope, use the supplied standalone opener:

```sh
python3 materialize-source.py Hardware_Application_Source.json NEW_SOURCE_DIRECTORY
cd NEW_SOURCE_DIRECTORY
node native/build-desk.mjs NEW_Desk.html
node native/build-desk.mjs NEW_Editable.html Hardware_Working.json
```

Use new output filenames. The native publisher preserves existing files.

## Source layout and operating course

`source-manifest.json` lists the exact current application closure, excluding itself. `hardware/` contains the complete domain, authored source generator, reports and receiving course. `operator/` contains the industrial standalone UI, retained editable session, codec and deterministic builder. `native/` contains the CLI, build and receiving entrypoints, source reader and atomic output publisher.

Read `docs/OPERATOR.md` for original intake, explicit mappings, editions, proposals, review and full working/source/HTML/ZIP transfer. Read `docs/CONTRACT.md` for the source and calculation contract and `docs/NATIVE_RECEIVING.md` for CLI commands. `docs/BROWSER_RECEIVING.md` supplies the complete actual-browser receiving procedure.

```sh
node native/receive-operator.mjs NEW_RECEIVING_DIRECTORY
node native/receive-capacity-transport.mjs EXISTING_WORKSPACE.json NEW_CAPACITY_DIRECTORY
```

The controller course executes the production source with explicit DOM, storage and download adapters. The capacity transport receives an existing exact workspace, measures the complete handover, verifies every ZIP member and reopens its full working state. Installed browser observations and native runtime timings are recorded separately from source execution.

## Retention and delivery

Every original remains byte-for-byte available. Frozen source editions and named comparison reviews are separate from unfinished input, mapping, proposal and review drafts. Successful replacement retains the preceding complete session; malformed input leaves current work available.

Complete working JSON and compressed editable HTML preserve the same state. The handover admits at most 128 MiB and 2,000 files across working state, editable HTML, full application source and exact originals. The current large receiving source and actual results are retained in the full delivery; the large generated workspace has its own exact source index.

`history/` retains complete technical predecessors. The complete private delivery also retains research, generated outputs and execution records, which are excluded from the standalone application source. The owning engineering workflow applies the reviewed sources in its CAD/PLM tools and controls physical release.

See `NOTICE.md` for source provenance and license.
