# Production run workspace

The installed application keeps original run, standard, downtime, labor, output and charge records together with explicit mappings, frozen editions, complete comparisons and named operations/finance decisions.

## Open through Applications

Choose **Production run** in Applications. Select an absolute physical owner-private workspace directory and provide a new workspace label for an unused directory. Start creates the original installation and opens its private browser connection. Existing directories reopen their saved complete session. Stop drains the existing writer. Customer-agent clients attach to that same writer.

The ordinary operator retains its complete input, source-mapping, proposal, review, page and selection drafts. Use **Save complete session** to select a new managed edition. Each prior edition and its original request remains recoverable. A pending save retains its exact request until **Recover original request** resolves it. **Open newest saved edition** preserves the entire displaced local branch. When two browser openings changed their saved copy, explicitly select the current branch using **Keep this browser branch; retain saved copy**; both complete preimages remain downloadable.

## Source and review workflow

1. Retain complete CSV, TSV or JSON originals in **Original source intake**. Inspect exact rows and source identities before mapping.
2. Declare site, observation cutoff and explicit clock convention. Map the six source tables: runs, standards, stops, labor, output and charges. Keep units, currency, counter resets, standards and cost completeness explicit.
3. Preview the complete production analysis. The operator can retain named row corrections as new source versions with original row references, preparer and reason. Freeze a source edition; earlier originals and calculations remain available.
4. Compare baseline and candidate. Inspect changes alongside the complete run basis, denominator, standard, cutoff and cost coverage. Corrections of incomplete source records retain their comparison caveats.
5. Record separate operations and finance decisions against the exact proposal comparison SHA. The latest decision for each required discipline governs source-review status; all earlier decisions remain.
6. Save the complete managed session and download **Save retained handover ZIP**. It contains every application source file, editable HTML, working/domain JSON, original bytes, every edition report, proposal handoff/comparison and managed request/edition history.

The calculations preserve downtime unions, allocated labor, declared counter resets, exact known costs and the distinction between known-cost and complete contribution. Owning staff control production, payroll, accounting and machine operations.

## Native commands

From the complete repository:

```sh
node products/production-run/cli.mjs init /physical/private/production "Revision review"
node products/production-run/managed.mjs --workspace /physical/private/production
```

Applications manages the second command normally. To receive a complete portable session into an unused directory:

```sh
node products/production-run/cli.mjs receive /physical/private/received /physical/private/Production_Working.json
```

The CLI also provides `course`, `inspect`, `session`, `request`, `request-status`, `connected`, `connected-status`, `export` and `desk`. Standalone writer commands require Applications to be closed. Connected commands use its existing listener. Output files use absolute physical owner-private paths and preserve existing different content.

The original production-native CLI remains available at `native/production-cli.mjs` for source-native intake, run analysis, reconciliation, proposals, operations/finance reviews and handoff. Read `docs/NATIVE_RECEIVING.md` for its exact commands.

## Customer-agent tools

Declare a `stellar-forge.production-host.v1` configuration with 1–32 workspace aliases. Each workspace names its physical private directory, optional installation ID and any declared original input files with exact SHA-256 values. Add the file through Merchant's `productionConnection` configuration or the provider initializer.

Use `merchant_production_status`, `connect` and `browser` to select the existing installation. `inspect` pages exact originals, source tables, editions, proposals, comparison changes, full metric pairs and run details, discipline reviews, unfinished-session backups and original managed request history. Keep the selected state SHA fixed across all pages. `preview` supports analysis, explicit mapping, mapped source rows, comparison and proposal status.

`action` accepts original `add-source`, `save-edition`, `propose` or `review` operations. Retain request ID, actor, timestamp, exact managed base SHA and original domain root before sending. `ingest` takes an exact declared original. `receive` adopts a complete working carrier or reconciles an original request file. Exact retry returns the selected original outcome without discarding later editor work. A transport error keeps the original request pending.

`export` retains the complete selected edition. `file` receives the ZIP in byte ranges, including after the application stops. Continue until nextOffset is null and verify the complete byte count and SHA.

## Complete source and receiving

`source-manifest.json` lists the entire application closure. Original domain and technical history remain present. The distribution contribution and source selection are both `production-run`; they add Applications and Merchant providers without editing another installed product.

Run the focused source/native course and actual browser procedure in `INSTALLED_RECEIVING.md`. GitHub Actions remain disabled.
