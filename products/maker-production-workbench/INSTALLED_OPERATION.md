# Installed production operation

## Source and calculation

The original `maker-production-core.mjs` and browser core are unchanged. All eight source tables are received as one immutable edition with exact UTF-8 names and text, byte counts and SHA-256 identities. The observation action appends an exact CSV row to a copy of those originals and creates another complete edition. It uses the original parser and planner to validate stage lineage, observed counts, source dates, capacity and ready-stock effects.

Local dates use YYYY-MM-DD. Source settings contain `asOf` and `shippingCalendar` with open ISO weekdays 1–7 and explicitly closed local dates. A review date cannot precede its source edition. Shipping transit, integer yields, resource-open versus calendar day durations, future observations and ready stock retain the original domain rules.

## One writer and complete session

Applications starts `managed.mjs`; browser and Merchant MCP clients attach to that exact private listener. The installation identity, directory identity, listener instance and selected state SHA are verified. Stop Applications before standalone writer commands. Do not open a second writer around the same directory.

The installed carrier contains the original workspace plus the entire editor: selected source/date/target, all eight unfinished source forms, observation forms, decision forms, actor and complete retained prior editors. Import accepts the installed carrier, original domain workspace or original standalone desk. Complete recovery also carries the host base, pending original request, receipts, competing branches and displaced browser state.

A transition validates the entire successor including the retained preimage before selecting it. A capacity failure keeps the previous complete state and visible context. Source files are checked before installing their draft. Browser local copies and managed recovery are additional retained working copies; complete JSON and source handover remain exportable.

## Native entry

```sh
node products/maker-production-workbench/installed-cli.mjs --help
node products/maker-production-workbench/installed-cli.mjs course /absolute/private/authored-course
node products/maker-production-workbench/installed-cli.mjs inspect /absolute/private/authored-course
node products/maker-production-workbench/installed-cli.mjs desk /absolute/private/authored-course /absolute/private/Production.html
```

The `course` command receives the original complete worked example. `receive DIRECTORY WORKING.json` opens an original domain, standalone desk or complete installed working carrier in an unused installation. `session` exports the complete carrier. `export DIRECTORY EXPECTED_EDITION_SHA OUTPUT.zip` retains and copies a complete handover at the selected exact saved edition.

`request` and `request-status` operate through the standalone writer. `connected` and `connected-status` attach to the Applications writer. Keep the exact original request file until its outcome is known; recovery of an already committed request returns the current saved state without replacing later changes.

For eight-file native intake, use:
```
ingest DIRECTORY INTAKE_META.json PRODUCTS.csv RESOURCES.csv CALENDAR.csv ROUTES.csv ORDERS.csv STOCK.csv BATCHES.csv OBSERVATIONS.csv ORIGINAL_REQUEST_OUTPUT.json
```
Metadata is an original action request whose operation kind is `receive`. Each source declaration contains its original name and SHA-256 instead of text. The command verifies each actual UTF-8 file, expands the complete original request, writes that request to the supplied private output, then applies it.

## Requests and domain actions

Outer request fields: schema `stellar-forge.makerproduction-request.v1`, installationId, id, baseSha256, actor, at and kind. A save includes `carrier`. An action includes `operation`: id, kind, actor, at, expectedHead and payload. The selected saved-state SHA and domain workspace head bind different layers and are both required.

- `receive` payload: id, label, all eight sources `{name,text}`, settings and optional notes.
- `observation` payload: editionId, asOf, batchId, stageId, newEditionId, optional label, and event containing eventId, observedAt, localDate, status, inputQty, goodQty, rejectQty, heldQty and sourceRef. Input counts remain form strings until original core validation.
- `decision` payload: id, editionId, asOf, targetType, targetId, action, reviewer, reason and evidence. Corrections append to the original decision history and remain bound to the selected source/date fingerprint.

The native receiving entry exercises actual filesystem exclusivity, listener startup, shared action/save/recovery, complete export download and listener reopening.

## Merchant MCP

Use `setup.mjs initializeMerchant` with a separate private merchant directory and a supplied connection configuration. Configuration schema is `stellar-forge.makerproduction-host.v1`; `workspaces` maps aliases to directory, optional installationId and `inputs`. Each declared input maps an alias to its exact file path and SHA-256. Paths resolve relative to the connection file. Actual byte counts and identities are read before use.

Registered tools cover status/connect/disconnect/browser, inspect/preview/action, ingest/receive, export/file. Eight-source `ingest` uses declared input aliases and hashes; `receive` imports a declared original working carrier. Both attach to the same Applications writer and preserve the prior complete editor.

Pin `expectedSha256` for reads and page with offset/limit (1–50). Collections include original editions and tables, orders, batches/stages, resource-day capacity, observations/future observations, unallocated stock, attention, current decisions, decision history, drafts, backups and original requests. Exports remain accessible through the declared installation after its listener stops.

## Complete handover

The full ZIP includes every maintained application source, source manifest, complete working carrier, standalone-compatible workspace and desk, editable HTML, all edition originals, complete plans/reports/CSVs for relevant dates, full decision history, every retained prior editor, original host requests and retained host editions. The export manifest binds every member by length and SHA-256. The public source contains generic code and authored examples; supplied customer programmes remain in their private installations.
