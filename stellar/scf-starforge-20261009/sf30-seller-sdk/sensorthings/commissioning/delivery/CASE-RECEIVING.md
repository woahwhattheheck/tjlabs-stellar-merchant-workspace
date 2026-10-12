# DataCove case, workshare and delivery receiving

This is the complete commercial continuation of the merged source-to-FROST commissioning product. It operates the existing Case Desk. The source packet includes the original company/source records, all seven delivery items, the complete six-phase workshare, proposed commercial terms, the exact `WORKSHARE.md` bytes, all 44 selected source pins and the original reference identity.

## Selected source and original case

- Application: `ff82f6268ef778d0401912076e229f03ba9a8a18`; all 44 source leaves read back exactly after PR248 merged.
- Case: `datacove-sensorthings-commissioning-20261012`.
- Case receiving operation: `datacove-complete-workshare-intake-0c7a-20261012`.
- Company delivery operation: `DATACOVE-SENSORTHINGS-COMMISSIONING-0C7A-20261012`.
- Prepared packet: `delivery/datacove-case-receiving.json`, 38,688 UTF-8 bytes, SHA-256 `bbe2b4884edbcbcdbdb7800fba13193c6db8c43974dbe4dab572bb206abf3f10`.
- Original case: https://tokenjunkielabs.slack.com/archives/C0BTTA66TK3/p1791815080790189?thread_ts=1791803620.539009

0C7A retains the existing company, case and sole sender. A favorable human reply moves subsequent relationship messages to Bryce. This receiving command preserves current mail and relationship state; it does not send an email or infer customer acceptance.

## Use the maintained Case Receiving CLI

The exact working predecessor is the original corrected Torchbox receiver at Commons commit `bd61f01182072bc0164772bd9eb3273e778ef33d`, file `opportunities/torchbox_wagtail_migration_2026/delivery/receive_case.mjs`, blob `3df88796db6f8d1faef43003eb98ec8654501de7`. This DataCove leaf changes the original case, full packet identity, six-phase fixed terms and the two native progress item IDs. It retains the original inspection, preview, writer, status and export APIs.

The existing installation is:

```text
console repository: /workspace/scratch/6f7c5af20f40/dealscout-adoption
canonical workspace: /workspace/scratch/6f7c5af20f40/dealscout-adoption/workspace
module within repository: tools/revenue_owner_console_20261010/case_receiving_cli.mjs
```

Use a private output directory on an available filesystem. The `--console-root` argument is the repository root; the receiver appends the module path above. Use the exact selected installed module with `main`, `applyReceivingRequest` and `exportReceivingRun` exports.

```bash
node stellar/scf-starforge-20261009/sf30-seller-sdk/sensorthings/commissioning/delivery/receive_case.mjs \
  --console-root /workspace/scratch/6f7c5af20f40/dealscout-adoption \
  --workspace /workspace/scratch/6f7c5af20f40/dealscout-adoption/workspace \
  --input /ABS/REPOSITORY/stellar/scf-starforge-20261009/sf30-seller-sdk/sensorthings/commissioning/delivery/datacove-case-receiving.json \
  --out /ABS/PRIVATE/datacove-case-receiving
```

The receiver first checks the exact packet bytes and SHA. It reads the existing stable operation and adopts an already saved matching result. Otherwise it retains the source packet, asks the current native CLI to inspect it, records explicit selected-case choices, previews the complete request, and requires the original `REVIEWED` result before calling the native writer. The writer owns the case transaction and its original operation replay. A fresh status read verifies the same source/case, then the native exporter retains the complete workshare and delivery handoff.

## Preserve existing work during receiving

New cases receive the prepared overview. Existing cases use their inspected current overview/defaults. The selected choices are delivery MERGE, scope KEEP, mail KEEP, source events IMPORT, workshare IMPORT, retained work KEEP and delivery board START.

The complete incoming engineering, guide and priced-scope items are selected. For item conflicts, `datacove-original-assets` and `datacove-original-native-receiving` keep CURRENT because their original operators own actual progress. An unknown item conflict stops the receiver with the concrete review. No customer send, current relationship or unrelated case is replaced.

The original native engine, authenticated operator, supported runtime and complete workshare source are READY. The original STAM asset build and full reference commissioning are IN_PROGRESS. The programme and implementation source do not assert a finished target run, customer approval or revenue.

## Same-operation recovery

Use the same command, source packet, operation ID and output directory after interruption. The receiver asks the original native status API for the saved operation before preparing a new inspection. It verifies that a returned operation refers to exactly this case and source SHA. Existing retained files are accepted only when their bytes match. Native transaction replay handles an interrupted save; a successful save is read back before final export.

Keep the original receiving directory and returned result paths. If a provider or filesystem fails, retain the actual error and current operation state. An uncertain saved operation must be reconciled through the same CLI before another apply. Do not create another case or resend a prepared first contact to compensate for a missing console receipt.

## First contact and actual receipt adoption

`delivery/first-contact.json` freezes the reviewed recipient, subject, complete plain-text body and body SHA. It cites the merged application and complete operating contract. The proposed fee is USD 7,800, split USD 3,900 at kickoff and accepted handoff; delivery is twelve business days after the agreed inputs and kickoff.

Use the existing connected First Contact workflow and its current account admission. Immediately before dispatch, reconcile this company in the canonical case and both existing mailbox histories, adopt any original draft/send, and obtain the exact current account admission. Preserve the original recipient/purpose lease, preview and complete body. A native send is complete only after its actual message/thread and SENT body readback. Adopt that receipt into the same case and shared memory; a local receipt write failure does not authorize another email.

The optional two-page PDF is generated from `delivery/workshare-input.json` with the source-pinned renderer below. Public source and the complete email are usable without a PDF attachment; no successful reference run is asserted while its original operations remain pending.

## Render the complete customer proposal

```bash
python delivery/render_workshare.py \
  --input delivery/workshare-input.json \
  --output /ABS/PRIVATE/DataCove_SensorThings_Commissioning_Workshare.pdf
```

The renderer embeds an available DejaVu Sans family, uses two explicit pages, and reports exact input/output hashes. Inspect both rendered pages before delivering the PDF. Keep the complete source, operating and receiving guides with the finished customer package.

## Product operation

See [OPERATOR.md](../OPERATOR.md), [RUNTIME.md](../RUNTIME.md) and [RECEIVING.md](../RECEIVING.md) for the actual source-to-target workflow. The original 5403 asset operation, original FROST target/runtime selection and the single full native/browser receiver remain their existing operations. The commercial receiving command does not create a target service or launch them.
