# IATI customer operating procedures

Create a customer procedure from an actual saved document-evidence case. The existing Operating Plans editor retains its ordered work, customer and receiving details, entered commands, saved revisions and readable handover.

The complete IATI procedure package adds the original case material: the selected organisation record, every evidence revision through the selection, all selected document rows and observations, the original comparisons and the exact correction draft. The package contains the actual selected toolkit catalog. Each registered step carries its original command, source records and declared runtime groups.

## Use the applications

1. Open **IATI → Document evidence** and select the saved case and exact revision.
2. In **Publisher handoff**, choose **Download operating source**.
3. Open **Command finder → Operating plans** at its normal fixed browser address. Choose **Import complete plan** and select that operating-source JSON.
4. The application creates the procedure in its existing saved-plan store and downloads its complete IATI package. Enter the customer, reporting period, operating owner and receiving destination. Edit the ordered work and save a revision.
5. Perform the document and publisher actions in their original applications. Record the actual results in the procedure and save its next revision.
6. Download the complete editable plan and the readable Markdown or HTML handover. **Update IATI package** asks for the original complete package and joins the current saved plan history to it. Keep this updated package with the original document-evidence ZIP and the customer reports.
7. The receiving operator imports the complete IATI package using the same **Import complete plan** control. Original plan identity and revision-history comparisons use the existing Operating Plans receiver.

The source case is a selected saved edition. A new observation, changed publisher candidate or a later native case revision stays in the original IATI workflow. The retained package always identifies the exact edition from which this procedure was prepared.

The first two steps record the already-retained source selection and history. Document rows carry their actual observation outcomes and named review decisions. A usable decision is completed work; an explicit exclusion is skipped; correction and deferred work remain visible. The transfer and following-period steps are ready for the operator's actual delivery and continuation results.

The operating plan's complete JSON retains every saved plan revision. The larger IATI package retains that plan and its original source. Keep the package with normal customer files when transferring browsers or machines. Updating a package uses a saved plan revision; save current edits first.

## Prepare the complete package through the installed CLI

Use the original private IATI console connection file and exact saved evidence revision. The actual selected toolkit must contain the maintained `iati-document-evidence` command.

~~~sh
starforge iati-document-procedure create \
  --connection-file /absolute/private/iati-console.json \
  --evidence-id ORIGINAL_EVIDENCE_SHA256 \
  --evidence-revision 6 \
  --customer "Customer name" \
  --owner "Operating owner" \
  --period "Reporting period" \
  --receiving "Original customer workspace and receiving person" \
  --packet-file /absolute/customer/document-evidence.zip \
  --out /absolute/customer/document-procedure.json
~~~

The command reads the complete selected case through the original SDK and loads the installed catalog through the maintained Command finder loader. It writes one complete new JSON file. The connection file's path can appear in command arguments; its contents stay in the private console file.

To prepare from an existing complete operating source:

~~~sh
starforge iati-document-procedure create \
  --source /absolute/customer/iati-operating-source.json \
  --catalog /absolute/customer/starforge-toolkit-catalog.json \
  --customer "Customer name" \
  --owner "Operating owner" \
  --period "Reporting period" \
  --out /absolute/customer/document-procedure.json
~~~

Export the actual catalog using **Operating plans → Toolkit catalog JSON** or `starforge discover plan catalog --out NEW.json`. A repository source selection can instead use `--source-root DIRECTORY --selection PRODUCT`.

A separate capture retains the complete case input for another installed receiver:

~~~sh
starforge iati-document-procedure capture \
  --connection-file /absolute/private/iati-console.json \
  --evidence-id ORIGINAL_EVIDENCE_SHA256 \
  --evidence-revision 6 \
  --out /absolute/customer/iati-operating-source.json
~~~

The existing document CLI also exposes `operating-source --id SHA --revision N` for a complete JSON response.

## Edit, receive and hand over

The package's plan is the original Operating Plans format:

~~~sh
starforge iati-document-procedure show \
  --file /absolute/customer/document-procedure.json \
  --format plan \
  --out /absolute/customer/operating-plan.json

starforge discover plan draft \
  --file /absolute/customer/operating-plan.json \
  --out /absolute/customer/working-draft.json
~~~

Edit the working draft, then append it using the existing plan command:

~~~sh
starforge discover plan edit \
  --file /absolute/customer/operating-plan.json \
  --draft /absolute/customer/working-draft.json \
  --out /absolute/customer/operating-plan-r2.json

starforge iati-document-procedure receive \
  --file /absolute/customer/document-procedure.json \
  --plan /absolute/customer/operating-plan-r2.json \
  --out /absolute/customer/document-procedure-r2.json

starforge iati-document-procedure show \
  --file /absolute/customer/document-procedure-r2.json \
  --format html \
  --out /absolute/customer/document-handover.html
~~~

`show` also exports the complete source, catalog, Markdown or original package. Every output uses the existing create-only exporter. Repeated receiving retains the later identical history. Divergent histories stay available as distinct original plan copies through the existing Operating Plans controls.

The procedure package contains complete JSON metadata and original body descriptors. The original document-evidence ZIP carries the retained body bytes and full native workspace. Use the original evidence `export` and `receive` commands for that complete workspace transfer.

## SDK

~~~js
import {
  createDocumentOperatingProcedure,
  receiveDocumentOperatingProcedure,
  renderDocumentOperatingProcedure,
} from '@tokenjunkielabs/starforge-merchant/seller/iati/document-operating-procedure';

const source = await client.documentEvidence.operatingSource(evidenceId, { revision: 6 });
const procedure = createDocumentOperatingProcedure(source, catalog, {
  id: crypto.randomUUID(),
  customer: 'Customer name',
  owner: 'Operating owner',
  receiving: 'Original customer workspace and receiving person',
});
const updated = receiveDocumentOperatingProcedure(procedure, laterCompleteOperatingPlan);
const handover = renderDocumentOperatingProcedure(updated, 'html');
~~~

The native source reader holds the existing workspace mutex while reading one selected immutable edition. It uses the original organisation and evidence methods for records, observations, comparisons and correction. All acquisition, named review, publisher editing and receiving continue through their original APIs. The pure adapter validates complete cross-record identity and calls the original Operating Plans model and renderer.

The maintained source-owned IATI contribution registers the command and typed export. Command finder's browser asset map carries the same pure module and original core model. JSON source and package transfers accept complete files up to 64 MiB; the editable plan keeps the existing 32 MiB browser transfer capacity.
