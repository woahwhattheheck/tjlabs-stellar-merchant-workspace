# Open and continue the SCF planning workspace

This package delivers the complete native grant-planning application and an
editable workspace with two saved plans, their consecutive revision histories,
the original scenario attachments and the recorded native requests. The
application uses its original Decimal calculator and is pinned to
`fae53095a8f31467f6916378320acd02f28bdcc4`.

The delivered baseline **Current SCF delivery plan** requests **$38,000** and
retains revision 1. **Independent original-source restore programme** retains
four revisions and currently requests **$38,760**. The package's exact plan
IDs, current revisions, source digests and native record counts are in
`HANDOVER.json` and `results/current-plans.json`.

Use Linux, Python 3.10 or newer and a current browser. The native application
uses Python's standard library, SQLite and an operating-system workspace lock.
Extract the archive into a private folder and open a terminal in that folder.

## Restore the delivered workspace and open it

```bash
python3 restore_workspace.py --destination customer-workspace
python3 application/stellar/scf_2026/sf47_budget_model/workspace/server.py \
  --workspace "$PWD/customer-workspace" \
  --scenario "$PWD/application/stellar/scf_2026/sf47_budget_model/sf10_current_candidate.json" \
  --port 0
```

The restore command verifies every packaged file's length and SHA-256, checks
the native SQLite backup, and creates a new private workspace containing
`planning.sqlite3`. It preserves the two plan IDs, all five saved revision
rows, the five recorded native requests and both original scenario BLOBs.
An existing destination is preserved; use a new name for another independent
copy.

The server prints a local URL and the absolute path of
`customer-workspace/open-workspace.html`. Open that private HTML file and
follow **Open the retained local workspace**. The application's sign-in screen
also accepts the workspace access key from the private access file. Keep the
server running while using the browser.

Choose either delivered plan in **Saved plan**. The baseline and independent
plan names above identify the current delivered records. The application
shows the selected plan's saved revision, source-bound scenario, native
calculations and complete planning sections.

Press Ctrl+C in the terminal to close the server and release its workspace
lease. Reopen later with the same server command and `customer-workspace`.
The existing native database keeps subsequent edits and histories; its private
access file is regenerated for the selected local port. One server or native
CLI operation owns each workspace directory at a time.

## Review and edit a saved plan

Use the planning sections to inspect the award request, individual future
costs, timeline, deliverables and payout calculations. Edit the chosen plan,
then select **Calculate draft** to calculate the proposed change with the
original model. Enter a **Revision note** and choose **Save revision** to retain
the complete new scenario, planning inputs and native report.

The retained sections are **Overview**, **Source tables**, **Work packages**,
**Milestones**, **Staffing**, **Payment timing**, **Delivery plan**,
**Saved versions**, **Compare saved plans** and **Delivery operations**.
Start with Overview and Source tables to review the budget, Work packages to
review the original delivery items, and Saved versions to inspect the complete
revision sequence. Compare saved plans uses explicitly selected saved editions.

The original model requires total future costs to equal the requested award.
When changing the total request, adjust the relevant cost items to that same
total before calculating and saving. The delivered independent edit changed
both sides together; its original $38,000 source attachment remains retained.

The native programme changed the original
`T1-merchant-resource-integration` work package at its retained **$95 per hour**
rate. Its complete saved sequence is:

| Saved plan edition | Work-package hours | Work-package cost | Award request |
| --- | ---: | ---: | ---: |
| Baseline revision 1 | 80 | $7,600 | $38,000 |
| Independent revision 1 | 80 | $7,600 | $38,000 |
| Independent revision 2 | 84 | $7,980 | $38,380 |
| Independent revision 3, historical restore | 80 | $7,600 | $38,000 |
| Independent revision 4, restored-customer edit | 88 | $8,360 | $38,760 |

To continue that same budget item, select the independent plan, review the
work package and its current eight-hour increase, and change both its cost and
the award total together. Calculate the draft before retaining a new revision.

**Reopen saved** reloads the selected saved revision. **Copy saved plan**
creates a named alternative from the reviewed current plan. The native history
retains earlier revisions; restoring an earlier saved revision appends it as a
new current revision. Use **Export planning workspace** to preserve the
selected plan's complete consecutive history and original source attachment.
**Import planning scenario or workspace** receives a complete native scenario
or plan ZIP through the original importer.

`results/current-plans.json` records the current delivered editions. The two
retained programme exports and their independent native request replay are
recorded in `receiving/planning-result.json`. The independent plan remains
editable after restoration, and new saves retain their own revision notes and
request identities.

## Use the complete native files

- `native/planning-workspace.sqlite3` is the full database backup used by the
  restore command, including original source attachments and request records.
- `results/all-plans.zip` contains both current plans as complete original
  native ZIPs, each with its consecutive history and original source.
- `results/current-plans.json` contains the plan names, IDs, current revisions,
  award requests and source identities for the delivered workspace.
- `results/original-plan-history.zip` retains the native programme's complete
  original plan history export.
- `results/independent-customer-plan.zip` retains its independently edited
  customer plan export.
- `receiving/planning-result.json` records the original native backup,
  independent restore, complete exports and same-request edit replay.

The whole database restore opens the delivered local IDs together. A complete
plan or collection import adds native receiving records to the chosen
workspace and retains their original consecutive histories and attachments.

After stopping the server, the packaged native CLI can read all current plans:

```bash
python3 application/stellar/scf_2026/sf47_budget_model/workspace/cli.py \
  list --workspace "$PWD/customer-workspace"
```

Export every current plan to a new private collection filename:

```bash
python3 application/stellar/scf_2026/sf47_budget_model/workspace/cli.py \
  export-all --workspace "$PWD/customer-workspace" \
  --output "$PWD/SCF_Current_Plans.zip"
```

The CLI provides `show`, `history`, `compare`, `estimate`, `save`, `restore`,
`clone`, `export`, `import-bundle` and `import-all`. Each command's `--help`
describes its complete native inputs. Writes use an explicitly reviewed
revision and a stable request ID; repeating an identical recorded request
recovers its original saved result.

To preserve subsequent full-workspace changes, close the server and copy the
closed `planning.sqlite3` into private backup custody with its matching
application source. Retain full native ZIP exports for plan exchange.

## Source and package identities

`application/SOURCE_SELECTION.json` identifies all 318 original application,
runtime, schema/data and type source files by Git blob, length and SHA-256 at
the operated application revision. The original repository hierarchy and
MIT license are included.

`application/FULFILLMENT_SOURCE.json` identifies the separately published
planning handover tools and guides. `HANDOVER.json` joins that exact
`fulfillmentSource.commit`, the complete native backup and the delivered plan
index. `MANIFEST.json` identifies every packaged file and its role.

The original application source and the maintained fulfillment source retain
their separate revisions. The matching source is packaged for offline
opening, independent restoration and future customer delivery assembly.

## Rebuild or resume this complete handover

Restore a new copy of the delivered native workspace for assembly:

```bash
python3 restore_workspace.py --destination rebuild-workspace
```

Prepare the retained native programme and its two exact sibling exports once
in a private directory:

```bash
python3 - <<'PY'
from pathlib import Path
import os, shutil
root = Path.cwd()
programme = root / 'rebuild-programme'
programme.mkdir(mode=0o700)
sources = (
    root / 'receiving/planning-result.json',
    root / 'results/original-plan-history.zip',
    root / 'results/independent-customer-plan.zip',
)
for source in sources:
    with source.open('rb') as incoming, (programme / source.name).open('xb') as outgoing:
        os.fchmod(outgoing.fileno(), 0o600)
        shutil.copyfileobj(incoming, outgoing)
PY
```

Then invoke the maintained builder with the packaged source, restored
workspace, retained programme, a new output parent and the exact recorded
fulfillment revision:

```bash
SCF_PLAN_FULFILLMENT=$(python3 -c 'import json; print(json.load(open("HANDOVER.json"))["fulfillmentSource"]["commit"])')
python3 application/operations/scf-grant-calendar-cedar-8047-20261012/build_plan_handover.py \
  --source "$PWD/application" \
  --workspace "$PWD/rebuild-workspace" \
  --programme "$PWD/rebuild-programme/planning-result.json" \
  --output "$PWD/rebuilt-scf-planning-handover" \
  --fulfillment-commit "$SCF_PLAN_FULFILLMENT"
```

The builder verifies the complete original source, all six published planning
fulfillment leaves, retained programme exports, SQLite integrity and the
original plan BLOBs. It packages a complete native backup and reopens each
nested current plan export to verify its full history and member digests.

After interruption, repeat the same builder command with all five arguments.
The retained assembly identity and file lease resume identical source and
native inputs. A completed customer ZIP is verified member by member and
reopened with its existing digest. The output parent contains
`SCF_Editable_Planning_Customer_Handover.zip` and
`customer-handover-result.json`.

### Receive the exact source from Git on another host

The maintained selector's planning profile receives the same operated
application and its complete dependency closure, plus all six separately
published fulfillment leaves:

```bash
git clone --filter=blob:none \
  https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace.git \
  original-merchant-checkout
SCF_PLAN_FULFILLMENT=$(python3 -c 'import json; print(json.load(open("HANDOVER.json"))["fulfillmentSource"]["commit"])')
git -C original-merchant-checkout fetch origin \
  fae53095a8f31467f6916378320acd02f28bdcc4 "$SCF_PLAN_FULFILLMENT"
python3 application/operations/scf-grant-calendar-cedar-8047-20261012/select_source.py \
  --repo "$PWD/original-merchant-checkout" \
  --ref fae53095a8f31467f6916378320acd02f28bdcc4 \
  --fulfillment-ref "$SCF_PLAN_FULFILLMENT" \
  --profile planning \
  --output "$PWD/prepared-planning-source"
```

Repeat the same selection command and inputs to resume an interrupted source
receiving. The selector verifies every original Git blob and preserves a
differing existing snapshot. Use `prepared-planning-source` as the builder's
`--source` while retaining the same restored workspace, programme and recorded
fulfillment revision. The selector's default calendar profile retains its
original four-leaf source contract.
