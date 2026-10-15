# Maker Production Workbench

A complete installed production desk for the eight supplied product, resource, calendar, route, order, stock, batch and observation tables. It preserves the original production engine and standalone workbench, and adds Applications create/open/resume, a single private writer, complete editable sessions, native receiving and the Merchant MCP interface.

## Open the installed application

Select **Maker Production Workbench** in Applications, enter a physical private workspace directory, and enter a new workspace label when creating an unused directory. Reopening an existing directory resumes its selected complete session. The application owns the writer until it closes.

Native equivalent:

```sh
node products/maker-production-workbench/managed.mjs --workspace /absolute/private/maker-production --new-label "Production review"
```

A distribution containing this product exposes `makerproduction-managed` and `makerproduction-workspace`. Use the source selection `stellar/scf-starforge-20261009/distribution/selections/maker-production-workbench.json`.

## Complete working course

Receive all eight CSV originals together. Select the source edition and review date; inspect resource-day capacity, batch stages, ready-stock allocation and unresolved attention. Record observed stage counts in a new source edition. Record or correct maker decisions against the exact selected source, date and target. Return to prior editors, keep unfinished source/count/decision forms, and export the complete working session or full source handover.

The installed desk keeps each complete prior editor before a source, observation, decision or context transition. A rejected transition restores the selected state and visible selection while retaining the input being edited. Browser recovery retains pending requests and competing browser branches; adopting a branch preserves the displaced complete state.

Read [INSTALLED_OPERATION.md](INSTALLED_OPERATION.md) for the shared browser/native/MCP contracts and [INSTALLED_RECEIVING.md](INSTALLED_RECEIVING.md) for receiving the maintained source. Original production arithmetic and source contracts remain in [OPERATE_MAKER_PRODUCTION.md](OPERATE_MAKER_PRODUCTION.md), [INTAKE_CONTRACT.json](INTAKE_CONTRACT.json), [WORKBENCH.md](WORKBENCH.md), and [RECEIVING.md](RECEIVING.md). The original README is retained at [history/before-installed/README.md](history/before-installed/README.md).
