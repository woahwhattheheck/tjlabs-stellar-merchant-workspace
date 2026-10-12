# Open and continue the SCF delivery calendar

This package contains the complete original grant-planning application, the received operating case, the calendar walkthrough, the full workspace database backup, complete calendar downloads and the prepared tranche form. The application source is pinned to `fae53095a8f31467f6916378320acd02f28bdcc4` and preserves its original repository layout and native calculator.

Use Linux with Python 3.10 or newer and a current browser. The application uses Python's standard library, SQLite and an operating-system file lock. Extract this ZIP into a private folder, open a terminal in that folder, and use the following commands.

## Restore the delivered workspace and open it

```bash
python3 restore_workspace.py --destination customer-workspace
python3 application/stellar/scf_2026/sf47_budget_model/workspace/server.py \
  --workspace "$PWD/customer-workspace" \
  --scenario "$PWD/application/stellar/scf_2026/sf47_budget_model/sf10_current_candidate.json" \
  --port 0
```

The restore command verifies the complete package manifest and the SQLite backup, then creates a new private workspace with `planning.sqlite3`. It preserves the received case IDs, plan revisions, saved forecasts, portfolios, original attachments and recorded operations. Use a new destination name when restoring an additional independent copy.

The server prints a local URL and the absolute path of `customer-workspace/open-workspace.html`. Open that private HTML file and follow **Open the retained local workspace**. The sign-in page also accepts the key from the private access file. Keep the server running while using the browser. Press Ctrl+C in its terminal to close the application and release the workspace lease.

To reopen later, run the same server command with the retained `customer-workspace`. Its existing database keeps your changes, and the access file is regenerated for the selected local port. One running server owns each workspace directory.

## Select the case and calendar

Use the saved-plan selector to choose the plan associated with the desired case, open **Operations**, then choose the case in its case selector. The receiving record at `receiving/native-result.json` records both plan IDs and case IDs, the calendar anchor and the demonstrated status date. The case names are:

- **SCF retained grant case - calendar receiving**: the received original operating case, with its saved forecasts and portfolios.
- **SCF delivery calendar walkthrough - original grant plan**: the complete calendar operation over that same original plan, retaining all three tranche assignments, payment-derived completion clocks, a recorded extension and the prepared/submitted tranche form.

Open **Delivery calendar**. Set **Status as of** to the recorded `asOfDate` in `receiving/native-result.json` to reopen the delivered view. Agenda and Month retain their own view controls. Date, owner, tranche and event filters select the screen view; the download controls export the complete selected case calendar.

Selecting an event opens its retained details. **Open tranche** follows the event's original tranche, payment receipt, selected calendar date, prepared form and work-package identity into **Completion**. Saved assignments and entered form drafts remain joined to that case. Use the normal Completion controls to review assignments, retain supporting sources, prepare a form and record its submission or issuer response.

The calendar walkthrough reuses the original plan's cost identities and native Decimal payout amounts. Its authored walkthrough dates and record basis are retained as an original source attachment inside the operated case. The selected status date classifies the retained payment and submission dates alongside the current saved case version.

## Use the complete downloads

- `results/calendar.json` retains the native calendar entries, undated assignments, source plan and clock basis.
- `results/browser-calendar.ics` contains the complete dated all-day events for a dedicated calendar.
- `results/browser-calendar.csv` and `results/browser-calendar.json` contain every dated and undated row from the browser download.
- `results/saved-assignments.json` retains the full original tranche assignments.
- `native/prepared-completion.zip` contains the original prepared tranche form and its selected sources.

The received payment for T0, T1 or T2 starts the following tranche form's 90-calendar-day deadline. A retained issuer confirmation supplies the extension date, while the original deadline remains visible. The current [SCF budget and deliverable guidelines](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines#tranche-submission-deadlines) provide the governing payment and deadline context; these were checked on October 12, 2026.

## Continue editing or transfer a case

Use the original planning and Operations controls to save new assignments, source attachments, cash records and case operations. The native application retains versioned commands, the selected source plan and its full revision history.

The files in `native/` provide both complete-case receiving and full-workspace recovery:

- `retained-original-case.zip` preserves the original version-36 case archive at SHA-256 `c9205af40840c324222b47fc53b4dc83c2f55891c54b50b3a4b77e8af3266275`.
- `received-original-case.zip` preserves the case after original import into the operated workspace.
- `calendar-walkthrough-case.zip` preserves the complete operated calendar case for the original Operations importer.
- `calendar-workspace.sqlite3` is the whole database backup used by the restore command above.

Import a complete case ZIP through **Operations** when adding it to an existing workspace. The full database restore creates an independent workspace with all delivered local IDs together. To back up subsequent work, stop its server, copy its closed `planning.sqlite3` into private backup custody, and retain this matching application source. For case exchange, use the application's complete original case export.

`application/SOURCE_SELECTION.json` identifies every retained original application source file, its Git blob and its SHA-256 at the operated revision. `application/FULFILLMENT_SOURCE.json` identifies the maintained customer guide, restore helper and builder at their separately pinned fulfillment revision; `HANDOVER.json` joins that revision in `fulfillmentSource`. `MANIFEST.json` identifies every packaged file. `receiving/` retains the original native inputs, versioned request receipts and final browser/customer operation details; `HANDOVER.json` provides the joined customer index.

## Rebuild or resume the complete fulfillment on a receiving host

The maintained builder receives the complete original source, the same completed native/browser operation, a distinct customer-output parent and the exact published fulfillment revision. It checks the source selection, original case identity and native backup before assembling the customer package.

The extracted handover includes these original assembly inputs. To rebuild from it, prepare one flat, private operation directory once:

```bash
python3 - <<'PY'
from pathlib import Path
import os, shutil
root = Path.cwd()
operation = root / 'rebuild-operation'
operation.mkdir(mode=0o700)
for folder in ('native', 'results', 'receiving'):
    for source in (root / folder).iterdir():
        if source.is_file():
            with source.open('rb') as incoming, (operation / source.name).open('xb') as outgoing:
                os.fchmod(outgoing.fileno(), 0o600)
                shutil.copyfileobj(incoming, outgoing)
PY
```

Then invoke the maintained builder with the packaged application and its recorded fulfillment revision:

```bash
SCF_CALENDAR_SOURCE="$PWD/application"
SCF_CALENDAR_OPERATION="$PWD/rebuild-operation"
SCF_CALENDAR_OUTPUT="$PWD/rebuilt-customer-handover"
SCF_CALENDAR_FULFILLMENT=$(python3 -c 'import json; print(json.load(open("HANDOVER.json"))["fulfillmentSource"]["commit"])')
python3 "$SCF_CALENDAR_SOURCE/operations/scf-grant-calendar-cedar-8047-20261012/build_customer_handover.py" \
  --source "$SCF_CALENDAR_SOURCE" \
  --operation "$SCF_CALENDAR_OPERATION" \
  --output "$SCF_CALENDAR_OUTPUT" \
  --fulfillment-commit "$SCF_CALENDAR_FULFILLMENT"
```

An original receiving host can instead set `SCF_CALENDAR_OPERATION` to its retained completed operation directory. Use a fresh customer-output parent for the first assembly. If assembly is interrupted, repeat the same builder command and all four arguments. The retained assembly identity, file lease and staged copies continue those same inputs; a previously completed archive is verified and reopened with its existing digest. Its result record is `customer-handover-result.json`, and its complete delivered ZIP is `SCF_Grant_Calendar_Customer_Handover.zip` in the selected output parent.
