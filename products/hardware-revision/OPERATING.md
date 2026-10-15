# Hardware revision workspace

The installed application keeps original KiCad XML, BOM and declared firmware pin-contract files together with explicit mappings, frozen editions, complete revision comparisons and named EE, FW and manufacturing decisions.

## Open through Applications

Choose **Hardware revision** in Applications. Select an absolute physical owner-private workspace directory and provide a new workspace label for an unused directory. Start creates the original installation and opens its private browser connection. Existing directories reopen their saved complete session. Stop drains the existing writer. Customer-agent clients attach to that same writer.

The ordinary operator retains its complete input, source-mapping, proposal, review, page and selection drafts. Use **Save complete session** to select a new managed edition. Each prior edition and its original request remains recoverable. A pending save retains its exact request until **Recover original request** resolves it. **Open newest saved edition** preserves the entire displaced local branch. When two browser openings changed their saved copy, explicitly select the current branch using **Keep this browser branch; retain saved copy**; both complete preimages remain downloadable.

## Source and review workflow

1. Retain each complete original in **Original source intake**. Inspect KiCad XML, delimited BOM or declared JSON table using its exact source identity. Files with the same name retain separate content-addressed identities.
2. Set product, revision, owner, netlist and explicit BOM/firmware field mappings. Declare the required engineering disciplines. Original bytes remain immutable.
3. Preview source reconciliation, resolve findings and freeze an edition. Corrections become successor editions; earlier results remain available.
4. Select baseline and candidate. Read the complete comparison and connectivity endpoint cohorts. Prepare a named proposal with the reason for the change.
5. Record separate EE, FW and MFG decisions against the exact proposal comparison SHA. Earlier decisions remain in history. The latest decision for each required discipline determines source-review status.
6. Save the complete managed session, then download **Save retained handover ZIP**. It contains every application source file, editable HTML, working/domain JSON, original bytes, edition reports, complete proposal handoffs, comparisons and managed request/edition history.

Source review and physical production release are separate responsibilities. The owning engineers apply the reviewed sources in their CAD/PLM workflow and perform the appropriate physical checks.

## Native commands

From the complete repository:

```sh
node products/hardware-revision/cli.mjs init /physical/private/hardware "Revision review"
node products/hardware-revision/managed.mjs --workspace /physical/private/hardware
```

Applications manages the second command normally. To receive a complete portable session into an unused directory:

```sh
node products/hardware-revision/cli.mjs receive /physical/private/received /physical/private/Hardware_Working.json
```

The CLI also provides `course`, `inspect`, `session`, `request`, `request-status`, `connected`, `connected-status`, `export` and `desk`. Standalone writer commands require Applications to be closed. Connected commands use its existing listener. Output files use absolute physical owner-private paths and preserve existing different content.

The original hardware-native CLI remains available at `native/hardware-cli.mjs` for source-native intake, analysis, reconciliation, proposals, reviews and handoff. Read `docs/NATIVE_RECEIVING.md` for its exact commands.

## Customer-agent tools

Declare a `stellar-forge.hardware-host.v1` configuration with 1–32 workspace aliases. Each workspace names its physical private directory, optional installation ID and any declared original input files with exact SHA-256 values. Add the file through Merchant's `hardwareConnection` configuration or the provider initializer.

Use `merchant_hardware_status`, `connect` and `browser` to select the existing installation. `inspect` pages exact originals, source tables, netlist collections, editions, proposals, comparison changes, full endpoint cohorts, discipline reviews, unfinished-session backups and original managed request history. Keep the selected state SHA fixed across all pages. `preview` supports analysis, explicit mapping, netlist inspection, comparison and proposal status.

`action` accepts original `add-source`, `save-edition`, `propose` or `review` operations. Retain request ID, actor, timestamp, exact managed base SHA and original domain root before sending. `ingest` takes an exact declared original. `receive` adopts a complete working carrier or reconciles an original request file. Exact retry returns the selected original outcome without discarding later editor work. A transport error keeps the original request pending.

`export` retains the complete selected edition. `file` receives the ZIP in byte ranges, including after the application stops. Continue until nextOffset is null and verify the complete byte count and SHA.

## Complete source and receiving

`source-manifest.json` lists the entire application closure. Original domain and technical history remain present. The distribution contribution and source selection are both `hardware-revision`; they add Applications and Merchant providers without editing another installed product.

Run the focused source/native course and actual browser procedure in `INSTALLED_RECEIVING.md`. GitHub Actions remain disabled.
