# Original SCF customer billing handover

This directory contains the complete launcher for the operated customer billing case introduced with merchant-workspace PR #409. It packages and opens the original accounting workspace together with both planning cases, the commercial inputs and the exact product source used for that delivery.

## Package the closed case

Use Linux, Python 3.11 or later and Node.js 22 or later. Select the 241 original source files listed in `source-selection.json`, at commit `5f4c92edc4278cb1b3da08d41fd11b6cacb9bc6f`. The launcher checks every source file and the canonical source-selection digest before creating a handover.

```bash
python3 -B open-commercial-handover.py pack --repo /absolute/path/to/selected-source --work /dev/f8c1-scf-commercial-vhiw4uxw/work --out /absolute/path/to/new-delivery
```

The closed original working directory contains the complete `source` and `receiving` planning databases, accounting state, outbox, proofs, original customer exports and completed native/browser journey records. The original terms file is `/dev/f8c1-scf-commercial-vhiw4uxw/private/terms.json`. The complete archive includes an operating guide and a copy of this launcher.

## Receive and open

Keep the ZIP intact. Inspect it before opening:

```bash
python3 -B open-commercial-handover.py inspect /absolute/path/to/SCF_Customer_Billing_Complete_Workflow_20261012.zip
python3 -B open-commercial-handover.py open /absolute/path/to/SCF_Customer_Billing_Complete_Workflow_20261012.zip
```

`--sha256` accepts the recorded whole-archive digest. `--node` selects the Node executable. `--case receiving` opens the separately received planning case; the default is the original source case.

The accounting workspace derives its identity from its original absolute directory. The launcher restores that private directory, checks the original account/source binding and reuses the original local API implementations. It reconnects the existing commercial endpoint to the current local service port. Open the private access HTML file printed by the launcher and use Delivery operations → Customer billing.

Missing files are created exclusively. `restore` compares any existing file before receiving. Repeating `open`, including with a later complete edition of this same handover, verifies the original operation, source commit, account binding and all 241 installed source files before continuing the retained workspace. Later accounting and planning edits remain in that workspace. Ctrl+C closes both services.

## Source and operating context

- Original product: [PR #409](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/409).
- Complete handover operation: `SCF-COMMERCIAL-MILESTONE-BILLING-F8C1-20261012`.
- Selected source digest: `a07defdc20af4b24766697e16f38f9b7df68b757c9c231497d69a51c126beaf4`.
- The retained operating example contains two original USD 4,400 milestone invoices and one allocated receipt. The saved browser workflow and native result in each delivered archive record its actual final state.
