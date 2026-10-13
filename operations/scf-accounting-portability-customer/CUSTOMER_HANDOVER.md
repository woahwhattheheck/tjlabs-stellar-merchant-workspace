# Open the complete accounting account

Extract the complete handover into a private directory and open a terminal there.
`HANDOVER.json` identifies the current account, delivered source revision,
reconciliation history and receiving backup. `SOURCE.json` records the exact
application and delivery-tool files. `MANIFEST.json` records every delivered file.
The current receiving backup and the original account archive have separate
identities and remain together in `native/`.

Use Linux with Python 3, Node 22 or later, `flock` and `tar`. The application uses
the Node standard library and the original bundled recovery engine; opening the
account requires no npm installation. The exercised host uses Node 24.19.0.
The browser operator programme records the actual Chrome version used in its
result. Ordinary customer opening uses your local browser.

## First opening

From the extracted handover directory:

```sh
python3 tools/receive_customer.py --handover "$PWD" --destination customer-workspace
node tools/serve_customer.mjs --handover "$PWD" --instance "$PWD/customer-workspace"
```

The receiver checks the delivered source files, current encrypted backup and
separately retained recovery key, then creates a new private instance. Its
original native backup is placed in `customer-workspace/backups/retained-account`.
The instance keeps its input identity. Repeating the same receive command reuses
that instance; different delivery inputs require another directory.

Open the printed `http://127.0.0.1` address in your browser. The initial
**Backup & recovery** desk shows **Recovery required** and **Receive the original
account** because this new location has no account yet. Enter your operator name,
select **retained-account**, and use **Verify encrypted files**. The host reads its
private recovery key; the browser shows its availability.

Choose **This host's new receiving location**. If using the optional recorded
identity fields, the two exact values are `HANDOVER.json` → `binding.workspaceId`
and `binding.sourcesSha256`. Confirm the displayed receiving location and stopped
source writers, then select **Restore selected backup**. Its complete result
stays in Operating history. Select that saved operation to read the original
account binding and received-source locations. Reloading the page retains the
same receipt.

After the restore finishes, select **Reopen accounting workspace**. The original
reconciliations, captured sources, imported proof and terms files, recovered
responses, exception notes, periods, closes and accountant exchanges open from
the received account. The `nativeState` index in `HANDOVER.json` describes this
delivered edition; the application shows its current saved state after subsequent
operator changes.

## Close, reopen and continue the same account

Keep the terminal that owns the server open while using the application. Press
Ctrl-C there to drain accepted operations and close its original source owners.
The command prints `CLOSED` when shutdown finishes. Reopen the same private
instance:

```sh
node tools/serve_customer.mjs --handover "$PWD" --instance "$PWD/customer-workspace" --open
```

The original workspace lease prevents another process from opening that same
account concurrently. The application and its sources stay beneath the selected
private instance; the current encrypted backup stays outside the active account.

If a restore was interrupted, open the desk without `--open`, select the same
retained backup and receiving location, and continue the original recovery.
Matching recovered files are reused. The original controller retains interrupted
operations and gives a continued operation its own native request identity.
Existing changed files are reported by the original recovery engine. Preserve
those files and the retained outcome while resolving the reported difference.

## Review and deliver current accounting work

Enter the operator name before saving work. **Sources & imports** shows the
original configured journals, verification directory, selected merchant terms
and recovered collection. The existing imports retain exact source bytes and
their original classifications.

**Reconcile & review** captures those current sources as another named original
reconciliation. Earlier completed editions remain available. Open the full event
ledger, payment options, exceptions, verification files and recovered sources;
each supports native pagination and record inspection. Exception review notes,
assignees and statuses remain alongside the original transfer classification.
Use **Compare & export** for before/after comparisons and a new retained review
archive. Select **Include private captured source files** for a complete
source-bearing accountant handoff. The six original report downloads retain the
full report JSON, ledger CSV, payment options CSV, exceptions CSV, offline HTML
and original source manifest.

The same application opens its original pricing, collections, recovered payment,
period, accountant and adjustment areas. Connections, client runbooks, portfolio,
Cryptoworth, delivery notices, customer statements, QuickBooks, Xero, chart source
changes and Bitwave use their original operator pages. Their configured native
accounts and retained requests stay in the original application workflow.

The complete receiving and separate cold-opening results are named in
`HANDOVER.json`. Their `downloads` entries identify every collected original
report and review archive by length and SHA256. `receiving/operations/` preserves
the actual operating recovery requests; `receiving/controller-state.json`
preserves their original host context. New customer reception creates its own
native recovery history for the new location.

## Receive exact source again

The application source is selected from the operated source commit recorded in
`SOURCE.json`. The original 663-file selection remains identified separately.
The complete profile additionally receives the originally served statement and
delivery assets, original license and supporting documentation. The three
responsive/recovery-interface postimages and seven delivery tools are received
from the separately recorded `applicationCommit`.

With an existing source repository containing both commits, run the packaged
selector. This creates a new prepared source directory and can reopen an
identical interrupted source receive:

```sh
python3 tools/select_source.py \
  --repo /path/to/your/source-repository \
  --application-ref "$(python3 -c 'import json; print(json.load(open("SOURCE.json"))["applicationCommit"])')" \
  --output prepared-source
```

The selector reads Git objects directly, verifies each original blob, and receives
the exact published tools. It preserves the repository-relative application
hierarchy. `prepared-source/SOURCE.json` contains the resulting application and
fulfillment file inventory.

## Repeat the whole operated handover

`tools/operate_customer.mjs` operates one original native server and one browser
inside the same owner lifetime. It verifies the selected original encrypted
backup, receives the recorded account through its real restore form, reloads the
same saved receipt, resumes accounting, operates the complete desktop/phone
interface and collects the complete original report/export history. The second
process performs the cold opening and reads that same account. Browser images
are kept in the local operation directory for inspection.

The driver takes a JSON configuration with absolute `handover`, `instance`,
`output`, `chrome` and `playwright` paths, plus `operation` and `actor` labels.
Set `captureReconciliation` to `true` to capture the current original sources as
the retained **Received original account reconciliation** and export its complete
review packet. An identical named capture and source-bearing export are reused
on an ordinary repeat. `runName` selects another explicitly named capture for a
later edition. Keep each phase's output in its own directory. An unchanged
completed output reopens its retained result and verifies its downloads. Use
`cold: true` for the second process after the first reports both owners closed.

Run the configured complete programmes:

```sh
node --max-old-space-size=384 tools/operate_customer.mjs receive-config.json
node --max-old-space-size=384 tools/operate_customer.mjs cold-config.json
```

The 384 MiB setting is the JavaScript old-space limit; the browser and complete
native process use additional memory. Their results record the actual browser
version, every inspected view, downloads, source/account binding and close state.

After both programmes finish and close, build a new complete customer delivery:

```sh
python3 tools/build_customer_handover.py \
  --source "$PWD" \
  --instance "$PWD/customer-workspace" \
  --original-account "$PWD/native/original-account.zip" \
  --operator-result "$PWD/customer-receiving/operator-result.json" \
  --cold-result "$PWD/customer-cold-open/operator-result.json" \
  --output "$PWD/new-customer-handover"
```

The builder invokes the original quiesced native backup and authenticates it,
retains the full application, original archive, current receiving backup,
recovery key, report downloads and operating history, and publishes a complete
member manifest. Its current state index comes from the actual cold-open result.
Source and receiving identities are retained in the output input record; a
different delivery uses another output directory. Later original account work
is saved in that new handover's current backup while the original archive and
historical editions remain preserved.

The delivered application is covered by the original MIT license included in
`LICENSE`. The repository-relative source files retain their original copyright
notices.
