# Import-to-host reconciliation: installed and portable workspace

The complete normal operator is now registered with Merchant Applications and the customer-agent lifecycle. Read [OPERATING.md](OPERATING.md) for installed startup, complete-session saves, original-request recovery and retained exports; [INSTALLED_RECEIVING.md](INSTALLED_RECEIVING.md) contains native and actual browser receiving.

# Import-to-host reconciliation workspace

A complete offline operator application for retaining imported data, preparing an explicit host plan, and comparing the host's original receipt and stored values. It includes the pure domain engine, browser application, host-owned bridge, native receiver, full editable examples and source history.

The workbench keeps these states separate: a successful importer callback; a reviewed create/update/skip plan; the actual host outcome; the selected-record readback; and a named review decision. It does not make a callback stand for persistence or infer a whole-database result from selected records.

## Open and use

Materialize the complete source using the supplied opener, then use Node 22.13 or later:

```sh
node native/build-desk.mjs /absolute/Import_Host_Desk.html
```

Open that HTML locally. Begin with a blank workspace or explicitly load the authored example. Follow the screens for originals, captured import, mapping, host plan, reconciliation, comparison and named review. Full working JSON and editable HTML retain unfinished forms and prior sessions; the domain-only export retains immutable source records and operations.

Original admission supports valid UTF-8 CSV, TSV, JSON and text. Binary Excel is not parsed by this offline workbench; an installed importer may provide its actual callback serialization. Exact JSON numeric tokens remain available in original source and typed displays. Precision already lost in a JavaScript Number before callback serialization cannot be reconstructed.

The source engine admits at most 10,000 selected import rows, 32 MiB per original and 96 MiB complete domain history. Browser delivery additionally checks the complete source/working/report/original archive against 128 MiB and 2,000 members. These are admission bounds, not a promise of instant processing at the maximum.

## Native receive and continuation

```sh
node tools/import-host.mjs example --out /absolute/authored-course
node tools/import-host.mjs receive --working /absolute/Import_Host_Working.json --out /absolute/reopened
node tools/import-host.mjs apply --working /absolute/Import_Host_Working.json --request /absolute/request.json --out /absolute/successor
```

Use a new output directory or repeat the identical command to resume its exact plan. Files publish create-only; changed existing bytes are preserved and rejected. The receiver verifies the complete application manifest, retains the original input/request, and emits the complete domain working state, selected report/CSV, every source original and the whole application. Browser input also produces a current browser-readable carrier and retains the prior complete session before a native domain operation.

An optional `--selection SELECTION.json` selects one saved reconciliation or comparison. See [native receiving](commissioning/RECEIVING.md) for commands and source formats.

## Host integration

[The executable bridge](src/host-bridge.js) normalizes actual callback/webhook captures and executes a selected reviewed plan through host-owned functions. The host must supply its actual authorization, write/read functions and an atomic durable journal. Known settled outcomes replay without another write; an unfinished claim stays uncertain and is not automatically retried. Readback remains separate from acceptance.

The browser has no send or database-write control. The bridge is an installation module, not a built-in connection to a customer system. The full authored bridge course uses in-memory host/journal functions and says so explicitly.

Filio's published React callback/webhook shape is supported as a source contract. The selected released SDK must settle the documented credential-prop discrepancy and actual webhook verification/retry rules before live integration. No package version, signature algorithm or live SDK execution is invented. The general host-result/readback schemas are authored integration contracts, not vendor API claims.

## Evidence and review semantics

- Explicit source-key tuples and one action per original row; updates require selected host IDs.
- Typed, exact-decimal or text comparison chosen per mapped field.
- JSON object member order is immaterial; array order and scalar types remain significant.
- Rejected, uncertain, unobserved, skipped, matched and divergent outcomes remain separate.
- Distinct active rows accepted to one host ID remain divergent even when fields match.
- A deliberate skip can leave one active unique key while retaining duplicate source observations.
- Corrected editions retain their predecessors. Comparisons use explicit one-to-one pairs and retain unmatched rows, changed expectations and reselected targets.
- Named review decisions append history and never rewrite observed outcomes.
- Imported workspaces replay the complete original operation history. Verified domain trees are deeply frozen before their identities can be reused.

The original authored twenty-operation journey and complete host-identity and bridge journeys are included. Executions recorded in source used the production JavaScript factories; filesystem adapters are explicitly identified where used. Native Node/browser and any installed-host results remain distinct execution evidence.

## Source guide

- [Frozen domain API](integration/CORE_API.md)
- [Operator guide](docs/OPERATOR.md)
- [Installation boundary](integration/INSTALLATION_BOUNDARY.md)
- [Native receiving](commissioning/RECEIVING.md)
- [Whole browser receiving](docs/BROWSER_RECEIVING.md)

The complete source manifest includes the technical ancestors and exact preimages. Private buyer qualification, commercial terms, recipient data and correspondence are outside this reusable package.

## Direct source unpacking

The ordinary pickup includes the exact standalone helper. Run `python3 materialize-source.py COMPLETE_SOURCE.json NEW_DIRECTORY` before the commands above. Complete files, binary artifacts and original bank identity are retained. The helper is also included at native/materialize-source.py.
