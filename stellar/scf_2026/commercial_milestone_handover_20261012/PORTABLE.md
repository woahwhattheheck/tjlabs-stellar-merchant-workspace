# Portable SCF customer billing handover

The portable opener receives the original customer accounting workspace and both saved planning cases into a private Linux directory chosen by the recipient. It uses the native accounting backup and restore engine to retain the original logical workspace and source identities while installing physical paths for the new directory.

## Receive and open the complete workspace

Use Python 3.11 or later and Node.js 22 or later. Place `open-portable-commercial-handover.py`, its companion `open-commercial-handover.py`, and the complete portable ZIP in a private folder. The complete ZIP also contains both scripts.

```bash
python3 -B open-portable-commercial-handover.py inspect /absolute/private/SCF_Customer_Billing_Portable_Complete_20261012.zip
python3 -B open-portable-commercial-handover.py open /absolute/private/SCF_Customer_Billing_Portable_Complete_20261012.zip --root /absolute/private/customer-billing
```

The chosen root's parent must already exist. A new root is created with mode `0700`; an existing root must have that mode and belong to the current user. Choose a directory separate from the archived account's original state root.

Open the private access HTML printed by the launcher. In **Delivery operations → Customer billing**, choose the retained case and the saved **Freeform Solutions** schedule. The operating example contains two original USD 4,400 milestones. Its first invoice retains the allocated USD 4,400 payment and zero remaining balance.

Add `--case receiving` to open the separately received planning database. `--node` selects the Node executable, `--port` selects the planning service port, and `--sha256` checks the whole ZIP against its delivered digest. Ctrl+C closes the accounting and planning services.

The `restore` command performs the same receiving operation without opening services. Repeating `open` or `restore` with the retained ZIP continues the existing workspace after checking its source and account binding. Later planning and accounting changes stay in the chosen root.

## Save the current work and move it again

Close the running workspace, then create a new complete edition:

```bash
python3 -B open-portable-commercial-handover.py repack --root /absolute/private/customer-billing --out /absolute/private/SCF_Billing_Later.zip --quiesced
python3 -B open-portable-commercial-handover.py open /absolute/private/SCF_Billing_Later.zip --root /absolute/private/customer-billing-later
```

Repacking saves the current native accounting backup, both current planning databases, customer working files and the complete selected runtime. The next receive preserves the original logical accounting identity and installs the new physical paths. Use a fresh root for a different saved edition.

An interrupted initial receive retains its selected manifest and native receiving progress. File creation preserves different existing files. A workspace lock prevents two copies of this opener from using the same root at once. The native recovery driver owns and closes its child process group on completion, cancellation and failure.

## Build the portable edition from the original operated case

The original complete customer ZIP and a native backup of that same account are required. Install the 243 source files in `portable-source-selection.json` at their listed hashes, including the native relocation and workspace recovery modules.

```bash
python3 -B open-portable-commercial-handover.py build --legacy-archive /absolute/private/original-complete.zip --repo /absolute/private/selected-source --backup /absolute/private/original-paid-account --key /absolute/private/restore-key.txt --out /absolute/private/SCF_Customer_Billing_Portable_Complete_20261012.zip
```

The builder authenticates the native backup, selects both original planning cases and excludes account/source files already covered by that backup. Every product file must match the canonical source-selection digest:

`b41e5904c97f6ed071ba524c7a604bbd3878fe9f3aa5f164e89ec1cc8bf503ee`

The output includes both launchers, a guide, the complete file manifest, source selection, both planning databases and native encrypted account backup. Its private per-package restore key travels in the same ZIP and is passed privately to the recovery process. Treat the complete ZIP as private account material.

## Related source

- Original customer case: [PR #409](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/409), commit `5f4c92edc4278cb1b3da08d41fd11b6cacb9bc6f`.
- Original-root launcher: [PR #645](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/645).
- Native relocation engine and operator receiving controls: [PR #780](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/780).
- Operation: `SCF-COMMERCIAL-MILESTONE-BILLING-F8C1-20261012`.
