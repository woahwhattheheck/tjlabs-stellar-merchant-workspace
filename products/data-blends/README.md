# Saved data blending

Turn several retained CSVs into a reviewed, reusable dataset. The operator chooses
the join keys and output columns, retains duplicate matches and unmatched rows
according to the selected join, and delivers the complete result as CSV and
SQLite. Original inputs, recipe versions, result provenance and private reviews
stay in a separately transferable workspace.

## Open the product

The maintained distribution source selection is `data-blends`. It registers the
`starforge data-blend` command, the **Saved data blending** Applications entry,
typed Node interfaces and eleven original merchant tools. Python 3.10+ with
SQLite 3.39+ supplies the disk-backed engine; the Node entrypoints use Node 22+.

Read the complete [operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/data-blends/README.md)
for initialization, browser operation, composite/multi-source join semantics,
complete downloads, native client use, merchant configuration and editable
workspace receiving.

The browser has four work areas: Inputs, Join recipe, Editions and review, and
Delivery and restore. It uses the same saved source and operations as the CLI.
The `seller` command opens an output-only result in the existing SQLite merchant
workbench, preserving its original query, release and payment configuration.

The [complete example](../../stellar/scf-starforge-20261009/sf30-seller-sdk/data-blends/examples/operate.py)
creates a new constructed order-allocation workspace, full customer delivery and
independently reopened private copy. A million-order option exercises the same
engine without a separate simulation implementation.
