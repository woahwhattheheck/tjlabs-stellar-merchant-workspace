# Customer operating plans

An operating plan gives a customer procedure a name, useful result, owner and ordered work. It carries the selected toolkit registrations with each step, keeps saved revisions, and records the operator's progress and results.

Open **Operating plans** from Command finder. Use it for grant reporting, recurring customer deliveries, source-table preparation and monthly operating work. Each step can select an existing command, provider, runtime group or package export, or contain a manual task. Product installation continues through the original Runtime product plans; operating plans describe the work performed with that installed toolkit.

## Prepare and run a customer procedure

Start Command finder with a consistent local port so the browser reopens its saved plans on subsequent visits:

~~~sh
starforge discover serve --host 127.0.0.1 --port 8846
~~~

Open the printed address and choose **Operating plans**.

1. Create a named plan. Enter its customer, useful result, operating owner and period or recurrence. Use **Receiving and continuation** for the destination, receiving person and instructions for the next operator.
2. Search the selected toolkit and choose **Add step**. A Command finder registration also has an **Add to operating plan** link, which opens the plan workspace with that registration selected for addition.
3. Write the work to perform, inputs and locations, expected result, step owner and due date. Move steps into their operating order. Add manual steps for work performed outside a registered command.
4. Set the exact argument array when the step uses a command. A selected command initially opens its maintained native help. After reviewing that command's usage, replace the array with the intended operation and actual input paths. The display quotes each argument for a POSIX terminal.
5. Choose **Save revision**. Perform each operation in the original toolkit, then enter its recorded status, result and continuation in the plan. Save another revision when those changes are ready to hand over.

The editor stores working drafts while typing, including an unfinished command argument array. **Save revision** validates the complete edited content. A saved revision changes only when its content changes. Earlier revisions stay in **Saved history**. Choose **Continue from this revision** to prepare a new revision from historical content while retaining the later history.

The registration snapshot includes the package identity, selected entry, owning source records and all runtime groups declared by those sources, with the package versions and read state supplied by Command finder. Entered command arguments remain separate from that snapshot.

## Reopen, recover and transfer

Saved plans and drafts use IndexedDB at the listener's browser origin. Use the same host spelling and port to reopen them. A different computer, browser, profile, host spelling or port has separate storage. Browser site-data removal also removes that origin's local plans. Keep the complete JSON with the customer's normal working files for transfer and backup.

| Control | What it retains |
| --- | --- |
| Complete editable JSON | Original identity and every saved revision, including full step selections |
| Import complete plan | A new plan or later revisions extending an identical saved history |
| Keep incoming as a copy | A divergent incoming history under its own new identity |
| Save as a copy | The complete original history plus selected edited content under a new identity |
| Markdown / HTML handover | The selected saved revision, with work, results, arguments and registration details |
| Working draft JSON | A valid editable draft for the CLI edit operation, retaining its original base revision |
| Current source comparison | Per-step comparison between the selected saved revision and loaded catalog |
| Retained working drafts | Earlier local work from another editor tab or a recovery checkpoint |

Imports compare every shared revision. Reimporting the same file reuses the current plan. Importing an older prefix keeps the newer saved history. Different shared revisions remain separate through **Keep incoming as a copy**. Copies retain their source plan identity as their origin.

Each editor session saves its own draft. When another tab advances the saved plan, saving an older draft reports the conflict and retains that work. **Save as a copy** keeps its edits. **Open current saved revision** prepares the latest saved content and retains the prior draft in the recovery selector. Removing a step or continuing historical content also retains the previous draft.

Readable handovers use saved revisions; save the current work first when it belongs in the handover. The HTML export is a standalone printable document with a monochrome layout and escaped customer text. Complete JSON is the editable transfer format.

## Compare the current toolkit

**Refresh source** reads the selected package again while preserving each step's original snapshot. Opening a step shows whether the registration is unchanged, changed or absent, and identifies changed fields, source records and runtime groups. A package identity change is shown separately.

Choose **Use current registration in this draft** when the current entry is the intended replacement. Entered work, arguments, owners, progress and results stay in place. Save a revision to retain that choice; earlier revisions continue carrying the previous selection.

The comparison export contains every step, with original and current selections where available. Manual steps remain explicit. Missing registrations stay visible so another operator can continue from their original source information.

## Use the same plan through the CLI

~~~sh
starforge discover plan --help

starforge discover plan create \
  --title "Customer grant reporting" \
  --customer "Customer name" \
  --purpose "Prepare the reporting period for the receiving team" \
  --period "Monthly" \
  --owner "Operating team" \
  --receiving "Customer's existing grant workspace and delivery location" \
  --step command:grant-workspace \
  --step command:grant-source-tables \
  --out /absolute/customer/grant-plan-r1.json

starforge discover plan draft \
  --file /absolute/customer/grant-plan-r1.json \
  --out /absolute/customer/grant-plan-working.json
~~~

Edit the draft's customer fields and ordered steps in the normal JSON editor. Each step has its own stable ID. Keep its complete selection when changing instructions, arguments or results. Append the edited revision to a new complete file:

~~~sh
starforge discover plan edit \
  --file /absolute/customer/grant-plan-r1.json \
  --draft /absolute/customer/grant-plan-working.json \
  --out /absolute/customer/grant-plan-r2.json

starforge discover plan compare \
  --file /absolute/customer/grant-plan-r2.json \
  --out /absolute/customer/grant-plan-current-source.json

starforge discover plan show \
  --file /absolute/customer/grant-plan-r2.json \
  --format html \
  --out /absolute/customer/grant-plan-handover.html
~~~

Create and add read the actual selected catalog. Repeated registration selections produce distinct task steps. Use its exact registration IDs. Add --source-root DIRECTORY and --selection PRODUCT to select a maintained source edition.

~~~sh
starforge discover plan add \
  --file /absolute/customer/grant-plan-r2.json \
  --step command:discover \
  --out /absolute/customer/grant-plan-r3.json

starforge discover plan receive \
  --file /absolute/incoming/complete-plan.json \
  --existing /absolute/customer/grant-plan-r3.json \
  --out /absolute/customer/received-plan.json

starforge discover plan copy \
  --file /absolute/customer/received-plan.json \
  --title "Next reporting period" \
  --out /absolute/customer/next-period-plan.json
~~~

Create, edit, add, receive and copy require a new output path. Exports use the existing create-only writer: a temporary file is synced and linked into its new destination. Existing files are preserved.

The show action emits the complete document by default. With --revision N it emits a summary and editable draft of that historical revision; draft --revision N prepares that content against the latest saved base. The markdown and html formats render the selected saved revision. Input files and browser transfers accept UTF-8 JSON documents up to 32 MiB.

## Application API

The pure model is exported with TypeScript declarations:

~~~js
import {
  createOperatingPlan, createOperatingStep, snapshotRegistration,
  operatingPlanDraft, saveOperatingPlanRevision,
  compareOperatingPlan, renderOperatingPlanHTML,
} from '@tokenjunkielabs/starforge-merchant/operator/operating-plans';
import { loadCommandCatalog } from
  '@tokenjunkielabs/starforge-merchant/operator/discovery/source';

const catalog = await loadCommandCatalog();
const plan = createOperatingPlan({
  id: crypto.randomUUID(),
  title: 'Customer reporting period',
  customer: 'Customer name',
  steps: [createOperatingStep({
    id: crypto.randomUUID(),
    selection: snapshotRegistration(catalog, 'command:grant-workspace'),
    instruction: 'Open the original customer grant workflow for this period.',
    expectedResult: 'Reporting work is prepared in its original workspace.',
  })],
});
const draft = operatingPlanDraft(plan);
draft.content.steps[0].owner = 'Operating team';
const revised = saveOperatingPlanRevision(plan, draft);
const currentSource = compareOperatingPlan(revised, catalog);
const handover = renderOperatingPlanHTML(revised);
~~~

The model returns independent values and validates the complete saved history. Persisting applications should read and save the original plan in one transaction. The browser uses an IndexedDB read/write transaction; the CLI writes a new complete file. The receiveOperatingPlan function supplies the same prefix-history import behavior for other receivers.

The maintained distribution/contributions/operator-discovery.json contribution registers the typed API, command, browser source and static assets with the original Command finder component. The original builder follows that component and its asset map into selected packages.
