# Delivery Slot Workbench

An offline operator for eight complete supplier-declared CSV sources: delivery slots, products, units and packs, buyers, product-specific cut-offs and capacity, whole-line order revisions, production snapshots and buyer picking snapshots.

Open **Delivery_Slot_Workbench.html** for a blank study or **Delivery_Slot_Worked_Example.html** for the complete authored amendment/cancellation example. Original cut-off demand remains visible beside an explicitly reviewed late revision. Exact decimal quantities retain their product and base unit. Unknown capacity or production remains unknown; positive-demand picking coverage does not require a fictional pick for a cancelled line.

- [Browser operation, recovery and rendered receiving](WORKBENCH.md)
- [Source semantics and native continuation](DELIVERY_STUDY.md)
- [Exact CSV and API contract](INTAKE_CONTRACT.json)

Regenerate the two applications with `node build.mjs NEW_DIRECTORY`. Continue a complete exported browser workspace with `node delivery-slot-native.mjs --workspace complete-desk.json --command receive-command.json --out NEW_DIRECTORY`. The native guide defines the command and eight source paths; output directories are create-only.

A complete working JSON or HTML retains all original sources, malformed file bytes, unfinished names/source/review drafts, source-bound review corrections and native attempts. Saved browser heads compare the accepted version atomically; competing proposals remain complete. Native continuation preserves the entire browser session and requires explicitly selecting a newly appended source edition.

The existing source, native and controller courses exercise production functions with complete authored source histories. Controller and native adapters identify their runtime explicitly. Use the receiving chapter for actual desktop/narrow viewing, source imports, complete downloads, native continuation and reopened exports.

The workbench uses built-in browser and Node capabilities with no package dependencies. Original order, invoice, payment, production and dispatch authorities remain with the existing operating systems.
