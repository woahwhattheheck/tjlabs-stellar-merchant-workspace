# Recurring customer installations

The installed Installation desk supports the complete `rumble-fish-prices` and `amberdata-spot-research` customer workflows. The same profile names work in source preparation, native seed preparation and whole-case receiving. The installed recurring composer adds a proposed operating calendar and a complete native task budget to the original Workshare-backed document.

## Operator outcome

| Profile | Whole customer result | Source meaning retained |
| --- | --- | --- |
| `rumble-fish-prices` | A complete approved asset-universe snapshot for one downstream consumer, with original response, field mapping, customer output and prior-edition comparison. | Native XLM, exact classic CODE:ISSUER or Soroban contract identity; decimal strings; observation and snapshot times; carried, unpriced and missing members; original history and source-quality fields. |
| `amberdata-spot-research` | Complete instrument availability and every selected OHLCV page for an explicit interval, the trusted Python summary, and the original Node/Python customer's saved result. | Exchange and instrument, provider version, start-inclusive/end-exclusive UTC bounds, source units, gaps, ordered pages and exact Decimal output. |

The customer selects its actual host, account/source rights, merchant, independent buyer, receiving operator, prices and task allowance in the existing operating case. The full original commercial plan remains attached to the Installation. Its phases, assignments, milestones, correction periods and current relationship state are retained by the native seed and receiver.

The generic profiles describe the repeatable technical outcome. The selected Workshare supplies the actual commercial terms. Keep private customer correspondence, account details and exact customer selections in their original private source/case surfaces.

## Complete original sources to saved installations

The installed tools accept both existing native source forms. For a complete receiving packet containing `prepared_case` and `workshare_input`, keep using `prepare.mjs sources` and its unchanged `source-inputs.py` implementation. For a saved Delivery handover containing `snapshot.version: "dealscout.delivery-handover.v1"`, use `handover-inputs.py`. Both formats produce the same native commissioning input and `SUPPLIER_RECEIVING.json` for `receive.mjs`. Profile selection uses the maintained installed catalogue; `prepare.mjs profiles` lists the current choices.

1. Retain the whole original handover JSON, including its saved Workshare, scope, delivery phases and revisions. Keep the full original commissioning source with the phase-effort table. The selection names every original file's relative `path`, receiving `filename`, exact `bytes` and `sha256`, actual `sourceUrl` and timezone-bearing `observedAt`. Every selected file is retained unchanged in the prepared output.

2. Prepare a complete handover selection with schema `stellar-forge.installation-handover-selection.v1`. Its top-level fields are `operationId`, `requestPrefix`, `receivingName`, `sourceUrl`, `observedAt` and `cases`. Each case contains `caseId`, installed `profile`, one `handover` file descriptor, the original canonical `planSha256`, all `productionEffort` rows, the complete `effortTotal`, additional original `files` and optional existing `bindings`.

Each effort row identifies `phaseId`, decimal-string `hours`, an exact `sourcePointer`, optional selected `sourceFile`, `unit` (`hours` or `minutes`) and the mapping `basis`. The total has the same fields except phase ID and mapping basis. A pointer without sourceFile selects the original saved plan; a pointer with sourceFile selects that complete retained JSON document. Select every original phase once and make the total equal the original complete planning allocation.

```sh
python3 stellar/scf_2026/sf49_data_commissioning/installation-workorders/handover-inputs.py \
  --selection /absolute/private/HANDOVER_SELECTION.json \
  --source-root /absolute/private/original-files \
  --out /absolute/private/prepared-sources
```

The command verifies the complete snapshot hash, original case/Workshare/scope/delivery linkage, original source-and-plan hash and every saved phase against its original Workshare phase. It then invokes the maintained `workshare_intake.load_workshares` on those unchanged source and plan objects, with the explicit original effort mapping. The saved handover's original phase outcomes remain in its full retained source.

The output contains `SOURCE_SELECTION.json`, every complete selected original, `Supplier_Workshare_Commissioning.json`, `SUPPLIER_RECEIVING.json` and `SOURCE_PREPARATION.json`. Its source-preparation record includes the original handover IDs, commercial terms, phase population, complete effort, installed profiles and exact native intake source. The receiving input selects the commissioning file plus all complete original source files; the native reader supports this form directly. Reopening the same command with the same inputs preserves its original output bytes; a changed selection requires its own preparation directory.

For an existing receiving-packet source, use schema `stellar-forge.installation-source-selection.v1`, select its complete `packet` descriptor and run the original entrypoint:

```sh
node stellar/scf_2026/sf49_data_commissioning/installation-workorders/prepare.mjs sources \
  --selection /absolute/private/SOURCE_SELECTION.json \
  --source-root /absolute/private/original-files \
  --out /absolute/private/prepared-sources
```

That original format also retains its complete `Supplier_Complete_Receiving_Packets.json`. Keep whichever full source form the original customer operation actually produced.

3. Give the one current owner of the original Operations workspace the prepared source directory and exact current case/plan identifiers. Run the original receiving operation with that owner's actual identifiers:

```sh
node stellar/scf_2026/sf49_data_commissioning/installation-workorders/receive.mjs \
  --operations-cli /absolute/original/operations/cli.py \
  --workspace /absolute/original-workspace \
  --case ORIGINAL_OPERATION_ID \
  --plan ORIGINAL_PLAN_ID \
  --inputs /absolute/private/prepared-sources/SUPPLIER_RECEIVING.json \
  --source-root /absolute/private/prepared-sources \
  --out /absolute/private/recurring-installation-receiving \
  --receiving-workspace /absolute/private/received-workspace \
  --actor ORIGINAL_OPERATOR \
  --receiving-actor RECEIVING_OPERATOR
```

Choose the original CLI's real path; the example's uppercase IDs name required selections. The receiver reads the current case version itself, attaches the full original files by content identity, obtains the source-backed Installation seed, performs native preview/save and reads back the saved edition. It exports the complete case and reopens each same Installation ID/revision in the distinct receiving workspace.

An existing Installation for the same Workshare case is updated through its original seed. Its operated observations and later fields remain with that record. An unchanged document reuses the saved edition. Resume an interrupted operation using exactly the same input, paths and receiving directory; its original checkpoint retains the original archive/import intent.

The output contains each original seed, selected bindings, full document and readable Workorder, followed by the complete case archive and `RECEIVED.json`. Use the original desk to resolve any remaining host, source-rights, payment or receiving selections against the actual customer case.

## Proposed operating calendar

`recurring.mjs` uses the existing complete calendar/composition engine. It is installed beside the native preparation core and the profiles, so an operator needs one maintained checkout.

```sh
node stellar/scf_2026/sf49_data_commissioning/installation-workorders/recurring.mjs calendar \
  --input /absolute/private/calendar-input.json \
  --out /absolute/private/new-calendar
```

The input schema is `tjlabs.scf-purchase-calendar-input.v1`. Required fields are an explicit UTC `startDate`, `days` from 1 to 366, UTC `weekdays` numbered 0–6, and the complete `participants` array. Optional `blackoutDates` are explicit ISO dates. Every participant has a unique installed `profile`, an actual proposed `merchantRole` and `buyerRole`, `kind` set to `SNAPSHOT` or `CLOSED_WINDOW`, and distinct `sessionsUtc` in HH:MM form.

The result contains the original input, every dated proposed task, useful-task counts by profile and day, and every complete seven- and fourteen-day window within the requested period. `calendar.csv` includes all rows; `calendar.json` retains the full source bounds and summary.

For a snapshot, the task records its requested observation time. For a closed window, a later daily review begins at the previous review; the first review of a working day begins at the preceding working day's last review. Blackouts and weekends therefore remain inside the next closed source interval. A Monday 09:00 UTC review after Friday 17:00 UTC covers 64 hours. This calendar describes proposed useful work; actual customer completion and purchase counting comes from the existing native operating records.

Keep this calendar with the original customer adoption/commissioning plan. Refine the real customer cadence, blackout dates and participant roles there before scheduling actual work. Reopening or recovering an existing result retains that same task.

## Compose a fresh original seed

The composer can prepare the entire native document and its calendar before the original desk saves it. Obtain a fresh `installation-workshare-seed` from the current original case with the complete commissioning and receiving-packet sources. Use the actual whole seed returned by that command.

```sh
node stellar/scf_2026/sf49_data_commissioning/installation-workorders/recurring.mjs bindings \
  --seed /absolute/private/ORIGINAL_SEED.json \
  --profile rumble-fish-prices \
  --out /absolute/private/new-bindings
```

The binding template retains the exact case/plan selection and Workshare identity. Fill the existing source IDs, source authority and reference, selected merchant and buyer deployments, payment terms and receiving host/operator from the original case. Empty template text retains the maintained technical instruction; it does not create an observation or choose a customer on the operator's behalf.

```sh
node stellar/scf_2026/sf49_data_commissioning/installation-workorders/recurring.mjs compose \
  --seed /absolute/private/ORIGINAL_SEED.json \
  --profile rumble-fish-prices \
  --bindings /absolute/private/SELECTED_BINDINGS.json \
  --calendar /absolute/private/calendar-input.json \
  --out /absolute/private/new-composition
```

Use `amberdata-spot-research` for the second workflow. The calendar must include the selected profile. Outputs are the complete `installation-document.json`, `installation-preview.json`, `composition.json`, readable `receiving.md`, full calendar JSON/CSV and a manifest of output byte lengths and hashes.

The composer verifies that native `workorder`, `assignments`, `checks`, `workshare`, `workflowPeriods` and `coordination` remain identical to the original seed. It delegates document semantics to the installed `prepare-core.mjs`. Save and reopen through the original Installation desk or complete receiver; the composer itself prepares files.

Fresh output directories use mode 0700, files mode 0600 and create-only writes. A fresh planned seed is required for this preparation command. Continue an already saved Installation through its current native draft or the complete receiver.

## Whole-task price allowance

For a task containing multiple native priced operations, pass `--task-budget /absolute/private/task-budget.json` to `compose`. The budget has:

- The actual original `network`, `asset` and `recipient`.
- `maximumAtomic`, an integer string matching the Installation's approved `taskBudgetAtomic`.
- `lines`, one per distinct priced operation, each with `operation`, the original integer-string `priceAtomic`, and the complete integer `quantity` of reads/pages/calculations.
- Optional `feeTreatment` describing the selected original network/facilitator charges.

The engine multiplies prices and quantities with exact integer arithmetic, sums the entire selected task and rejects a total over the original approved maximum. The original payment tuple and maximum must match the Installation document. The full reviewed lines, total and remaining allowance are retained in `task-budget.json`.

Use all required provider continuation pages and research operations when choosing quantities. A prepaid allowance retains the original settlement and its consumed capacity. Each separately purchased operation retains its native intent. The useful customer result, original settlement record and delivery/recovery identities stay available to the same operator.

## Source and adoption

`recurring-core.mjs` is the unchanged complete calendar, native composition and task-budget engine from the original recurring commissioning implementation. The installed CLI imports its local native core and the current `profiles.mjs` reader, and removes the second-checkout argument. Any complete installed profile may use its compatible proposed calendar. The generic profile edition keeps the complete source semantics and derives commercial/receiving commitments from the selected original Workshare.

The core is byte-identical to original Git blob `50ecf2804e736c1587723f034b245997e0603fb2`, SHA256 `a748c2b73f980ea28b196508142d8b778ccc91048fcc28349b8a656930057dbc`. Complete original customer selections and calendars remain in the original private commissioning source. The installed and original CLIs produced byte-identical complete JSON and CSV for the retained two-customer, forty-task calendar; its Monday closed interval remained 64 hours.
