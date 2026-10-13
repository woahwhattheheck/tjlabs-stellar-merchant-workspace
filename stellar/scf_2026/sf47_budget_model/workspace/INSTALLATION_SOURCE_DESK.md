# Prepare original source workshares in Grant Operations

The Source Preparation Desk turns complete original customer documents into the maintained Installation receiving package. Open an existing Grant Operations case, choose **Installations**, then **Prepare original source workshares**.

The desk retains the complete uploaded files, editable source selections, every saved revision, the native preparation outputs and the original request receipts. The last step opens a separate draft in the existing Installation editor. Save and receive that Installation through its original workflow.

A prepared or attached source package describes proposed work. It does not record a customer acceptance, payment, funded award, configured deployment or completed commissioning.

## What to have ready

Use the existing authorized operating case and its recording operator. In a managed workspace, sign in with the original owner link or a delivery-lead staff profile that includes that case. An enrolled lead's stable actor is recorded with every request. The existing staff case restrictions and read permissions also apply to source history, inspection and complete downloads. Bring the full original Workshare receiving packet and every complete document that supplies effort or other selected source context. Each packet must preserve the original `prepared_case.id` and `workshare_input.source.case_id`, with its complete `dealscout.workshare-plan.v1` plan. The native reader validates the plan and its original commercial currency.

For each phase, identify the exact JSON pointer that supplies its assigned effort, the original unit (hours or minutes), and an explanation of the mapping. Identify the original complete effort total as well. The total must equal every selected phase together. The desk never divides a price by an assumed rate to invent hours.

All source files are selected explicitly. A file's receiving filename, complete byte length, SHA-256, media type, source reference and observed time travel together. If the original filename contains characters outside the native receiving format, choose a distinct receiving filename with letters, numbers, dots, underscores or hyphens; the file's original content stays unchanged.

## 1. Retain the complete original files

Name the source preparation and select **Create source preparation**. In **Original files**, choose a complete file, review its receiving filename and provenance, and select **Retain complete file**.

The browser saves the full request and upload bytes before the first network request. When the save succeeds, the server appends a source-draft revision. Each original file remains downloadable from every revision that selected it.

Use **Inspect JSON** to read the complete original JSON and the native selected plan. The numeric-value table is a navigation aid: it shows up to 2,000 exact values with their JSON pointers, while the complete original JSON remains available. Enter any supported pointer manually when the table does not include it.

Removing a file changes the next draft edition. Earlier editions retain their complete original bytes. To replace a receiving filename with a different edition, remove its current selection, retain the complete replacement, then reconcile any mappings that still name the earlier byte identity.

## 2. Map the whole customer scope

Open **Source mapping** and choose **Add original customer**. Select the retained packet and the installed receiving profile, then choose **Review complete packet and phases**.

The desk shows every native phase, its owner, dependencies, description and acceptance terms. For each phase:

1. Enter its exact assigned hours as decimal text.
2. Choose whether the value belongs to the selected plan or to a complete supporting file.
3. Enter its exact JSON pointer and original hours/minutes unit.
4. Explain why that original value is assigned to the phase.

A pointer into the selected plan starts at that plan's root. A pointer into a supporting file starts at the whole file's root. Include every supporting file named by an effort pointer in **Whole supporting documents**.

Map the original complete effort total. Choose **Apply complete mapping to selection** when every phase is accounted for. Repeat for the remaining original customer cases. One preparation can select one to twenty complete cases, with their independently selected profiles.

The complete native selection is always available as editable JSON below the guided fields. This includes all original source metadata, phase effort selections and optional profile bindings. Changes in either editor are retained in the browser; **Save complete selection** commits a new native revision.

### Explicit phase-ID amendments

Some original packets require an already reviewed phase-ID/dependency amendment before the maintained native Workshare reader can accept them. Expand **Explicit original phase-ID amendment** and supply the complete `phaseIdAmendment` object:

```json
{
  "mapping": {"old-phase-id": "selected-phase-id"},
  "reason": "The actual reason for the selected phase-ID amendment",
  "sourceUrl": "The original amendment source reference",
  "selectedFilename": "Selected_Receiving_Packet.json"
}
```

Review the packet again after editing the amendment. The original helper changes only the declared phase IDs and matching dependency references, checks that reversing those changes reproduces the entire original object, and publishes a separately named selected packet. The original packet remains a distinct complete file. The desk displays the full amendment receipt and obtains the selected plan hash from that native inspection.

This control is not a general plan editor. Commercial terms, customer identity, phase content, effort and original source bytes remain those of the supplied documents.

### Concurrent draft changes

The complete customer mapping, raw selection and Installation binding fields retain the saved revision from which they were edited. If another operator advances that draft, the desk preserves both the current saved selection and the earlier edited fields. Review both before choosing **Keep edited mapping against this reviewed revision**. That explicit reconciliation is retained in the browser working download. A subsequent save still uses native revision comparison.

Opening another draft or saved revision asks before replacing unsaved forms. A pending original request must be recovered before its draft or revision can be replaced.

## 3. Prepare and download the complete package

Choose **Prepare complete native package** after saving the source mapping. The request pins the whole selection, the installed original helper and every selected profile SHA-256. The desk verifies the actual returned profile set against those same pins before accepting the native outputs.

The original `source-inputs.py` creates the receiving package. The output includes:

| File | Complete content |
|---|---|
| `SOURCE_SELECTION.json` | The complete selected source mapping |
| Every selected original file | Exact original bytes and original receiving filenames |
| Any selected amended packet | The separately named native phase-ID amendment and original receipt |
| `Supplier_Workshare_Commissioning.json` | All selected Workshares, original effort pointers and source identities |
| `Supplier_Complete_Receiving_Packets.json` | The whole selected native receiving packets |
| `SUPPLIER_RECEIVING.json` | The complete original Installation receiving input |
| `SOURCE_PREPARATION.json` | The native preparation report, source/profile pins and output receipts |

**Complete package** shows each full output, its byte count and SHA-256. Download individual files or **Download whole source and receiving ZIP**. The ZIP also contains the desk's complete preparation manifest. Browser downloads are published only after the actual received length and full SHA-256 match their selected receipts. An interrupted direct file writer is aborted; the same original file remains available for another verified download.

The native preparation directory is deterministic for the original draft and request. If a response or the enclosing database transaction is interrupted after files were written, retry the same request. The original frozen preparation time, source selection and create-only outputs are checked and reused.

## 4. Attach the whole cohort and prepare an Installation

Select **Attach complete cohort to this case**. The desk compares the current native Operations case version and preflights the complete source count and byte capacity. It records all needed original sources and the attachment receipt in one existing workspace transaction. Exact sources already present may be reused. If the complete cohort will not fit, no partial attachment is accepted.

Choose **Open native Installation preparation** or open the **Installation** step. Select an original Workshare from the complete attached inventory and an installed profile. **Read original profile binding template** uses the maintained Workshare seed and `bindingTemplate` implementation.

Enter actual known operating selections:

- The original merchant deployment and independent customer deployments, selected from the case's recorded deployments.
- The receiving host, operator, exact source reference and source-use authority.
- The selected payment network, asset, recipient and authority.
- Exact atomic price and budget values, and a whole task count when those are actually selected.

Use the complete binding JSON for the rest of the native profile fields. Missing deployment or operating information remains an explicit outstanding selection. Record any new actual deployment through the existing Operations editor.

Choose **Review complete native Installation**. The desk invokes the original profile preparation and native Installation preview, checking the complete document and source version. It lists the profile selections still required and exposes the full installed profile and native preview.

**Open complete Installation draft** creates a separate original editor draft while keeping any earlier Installation draft. The new draft contains the entire selected Workshare, assignments, acceptance checks and operating bindings. Review and save it through the original Installation editor. The source desk checks browser draft persistence before treating the handoff as complete.

Download the whole prepared workorder JSON and human-readable Markdown from the source desk when a recipient needs the complete original scope before native receiving.

## Original request recovery

A source mutation has one original request ID and complete body. Keep them together throughout response loss, reconnection and replay.

| Desk state | Operator action |
|---|---|
| Original request retained, response unknown | **Read original request status** |
| Not recorded and no definite rejection | **Retry exact original request** |
| Recorded original receipt available | **Adopt recorded original receipt** |
| Definite validation/conflict rejection and an actual not-recorded read | **Keep rejected request and reconcile fields** |
| Saved result, later list/case read failed | Refresh the saved original case; the successful POST remains recorded |
| Browser persistence unavailable | Keep the open session and download the complete working fields; recover storage before leaving |

A retry uses the exact original actor, note, request ID, expected revision and payload, including full upload bytes. It never generates a replacement request to hide an uncertain outcome. Native request replay precedes current revision comparison, so a saved request returns its original receipt even after later edits.

The complete working download contains the selected saved edition, raw edited selection, whole customer form, profile bindings and original pending request. It is a recovery document for that original case; it is not a request to create a different case or overwrite a newer edition.

## Saved history and workspace ownership

**Saved history** opens an exact draft revision. Its source files and prepared packages keep their own identities. Current draft revisions, Operations case versions and native Installation revisions are separate concurrency controls.

The desk uses the existing SF47 workspace SQLite connection, mutex and transaction journal. It does not create another business database. Accepted server work keeps its original handler and workspace ownership even if the browser disconnects.

Stop the workspace's running server before using the terminal interface against the same directory. The original workspace lease prevents simultaneous independent server and CLI writers. A normal CLI result is reported only after the selected operation, complete output publication and original workspace close finish.

## Terminal operation

The installed distribution exposes `grant-installation-source-desk`. It launches the same Python entry point and forwards the original command arguments. Select Python with `SF47_PYTHON` or put `--python /absolute/python3` before the command's other arguments. Python 3 is required; no package installation or second workspace is created by this bridge.

```sh
starforge grant-installation-source-desk --python /absolute/python3 \
  --workspace /absolute/existing/workspace \
  --out /absolute/results/installed-profiles.json profiles
```

The complete source terminal entry point is beside the existing workspace server:

```text
stellar/scf_2026/sf47_budget_model/workspace/installation-source-desk.py
```

It requires an existing canonical workspace containing `planning.sqlite3`. Supply the original saved scenario path when the workspace was opened with a non-default scenario. Each command writes a full create-only result to an existing output directory.

```sh
python3 installation-source-desk.py \
  --workspace /absolute/existing/workspace \
  --case operation-ORIGINAL32LOWERHEX \
  --out /absolute/results/source-drafts.json list

python3 installation-source-desk.py \
  --workspace /absolute/existing/workspace \
  --out /absolute/results/installed-profiles.json profiles

python3 installation-source-desk.py \
  --workspace /absolute/existing/workspace \
  --case operation-ORIGINAL32LOWERHEX \
  --out /absolute/results/source-revision.json \
  read --draft source-desk-ORIGINAL32LOWERHEX --revision 3
```

Replace the displayed identity placeholders with the original IDs returned by your workspace. Keep each complete command request in a file before sending:

```sh
python3 installation-source-desk.py \
  --workspace /absolute/existing/workspace \
  --case operation-ORIGINAL32LOWERHEX \
  --out /absolute/results/original-command-result.json \
  command --draft source-desk-ORIGINAL32LOWERHEX \
  --request /absolute/requests/original-request.json
```

Supported actions use one envelope:

```json
{
  "requestId": "the-original-request-id",
  "expectedRevision": 3,
  "actor": "The recording operator",
  "note": "The actual reason for this change",
  "action": "selection.save",
  "data": {"selection": {}}
}
```

The displayed empty selection is a schema illustration; provide the complete native selection produced by the desk or original source helper.

| Action | Complete `data` fields |
|---|---|
| `create` | `title`; expected revision is zero and a distinct source-draft ID is selected |
| `file.add` | `filename,mediaType,sourceUrl,observedAt,bytes,sha256,contentBase64` |
| `file.remove` | `fileId` from the current draft |
| `selection.save` | Complete `selection` object |
| `prepare` | `expectedEngineSha256,expectedSelectionSha256,expectedProfiles` |
| `attach` | `preparationId,expectedSelectionSha256,expectedVersion` |

The preparation request's selection hash is the canonical compact JSON hash used by the original workspace. The returned preparation's `selectionSha256` identifies its exact retained, formatted source-selection file; use that returned value for attachment. Do not exchange those two distinct identities.

Read original request status before retiring an uncertain request:

```sh
python3 installation-source-desk.py \
  --workspace /absolute/existing/workspace \
  --case operation-ORIGINAL32LOWERHEX \
  --out /absolute/results/original-request-status.json \
  status --draft source-desk-ORIGINAL32LOWERHEX \
  --request-id the-original-request-id
```

`inspect` reads a selected original JSON file; `--amendment` can select a complete explicit phase amendment file. `preparation` returns the whole preparation manifest. `file`, `output` and `export` require the original expected SHA-256 and write the full binary output. Existing byte-identical output paths reopen successfully; a different existing file is preserved and rejected.

```sh
python3 installation-source-desk.py \
  --workspace /absolute/existing/workspace \
  --case operation-ORIGINAL32LOWERHEX \
  --out /absolute/results/complete-preparation.zip \
  export --draft source-desk-ORIGINAL32LOWERHEX \
  --preparation preparation-ORIGINAL64LOWERHEX \
  --expected-sha256 ORIGINAL_COMPLETE_ARCHIVE_SHA256
```

Before a first terminal ZIP download, use `archive-description --draft SOURCE_DRAFT --preparation PREPARATION_ID` with the same global workspace/case options and a distinct `--out` JSON path. It derives the complete native ZIP identity without publishing the ZIP. Use that returned SHA with `export`. The HTTP archive descriptor or a prior complete ZIP receipt supplies the same identity. Terminal errors return an interrupted result and nonzero exit; any already-recorded original request remains recoverable with its unchanged request file.

## Maintained HTTP interface

The routes use the existing workspace's owner bearer or named staff session, CSRF protection, origin/host checks, body reader, error format and handler lifetime. Source preparation changes remain delivery-lead operations in the selected case. The global installed-profile catalogue and read-only packet inspection use the existing non-contributor read policy; the case selection is checked before any retained source is read. The browser passes its AbortSignal through the actual staff-session fetch, including complete response-body downloads. All IDs below are actual original IDs, and all file reads remain bound to complete receipts.

Base: `/api/operations/{caseId}/installation-sources`

| Method and suffix | Result |
|---|---|
| GET base | Complete source-draft list |
| GET `/{draftId}?revision=N` | Full selected draft revision |
| POST `/{draftId}` | One exact source command and complete receipt |
| GET `/{draftId}/requests/{requestId}` | Original request status and retained result |
| GET `/{draftId}/files/{fileId}?revision=N&expectedSha256=SHA` | Complete original bytes |
| GET `/{draftId}/files/{fileId}/inspect?revision=N` | Complete original JSON and native inspection |
| POST `/{draftId}/files/{fileId}/inspect` | Read-only inspection of `{revision,phaseIdAmendment}` |
| GET `/{draftId}/preparations/{preparationId}` | Complete preparation and all output receipts |
| GET `/{draftId}/preparations/{preparationId}/outputs/{filename}?expectedSha256=SHA` | One complete prepared output |
| GET `/{draftId}/preparations/{preparationId}/archive?describe=1` | Complete ZIP identity |
| GET `/{draftId}/preparations/{preparationId}/archive?expectedSha256=SHA` | Whole prepared ZIP |

`GET /api/operations/installation-source-profiles` returns the installed helper identity and every currently installed profile's complete JSON and source hash. The catalogue is dynamic; this desk does not maintain a second hardcoded profile list.

## Bounds and complete receiving

The maintained limits are 8 MiB per original file, 64 MiB of selected draft inputs, 256 MiB of retained draft blobs, 192 MiB per full prepared ZIP, 100 preparations per draft, 10,000 saved draft revisions, and 200 source drafts per Operations case. A native case can retain at most 24 MiB and 200 complete sources. Larger work must select an appropriate complete original operation; the desk does not truncate documents or attach an arbitrary prefix.

The adjoining receiving programme accepts an explicitly selected original operating workspace, original source selection and complete source directory. It retains their identities, exercises the real Source Desk and Installation APIs, closes and reopens the original owners, verifies full downloads and saved history, and uses the same browser flow at desktop and phone widths when the actual declared browser runtime is supplied. Its report distinguishes source preparation from Installation receiving. A source review or successful package preparation alone is never reported as completed native commissioning.

### Run the complete original-case receiving programme

Use the existing case and the complete original source selection from its owner. Stop that workspace's managed server through its original control before starting the receiver. The programme holds its own private receiving lease and borrows the selected workspace through its existing exclusive lease. It does not bypass either owner.

```sh
python3 installation-source-desk-receiving.py \
  --directory /absolute/private/source-desk-receiving \
  --workspace /absolute/existing/workspace \
  --case operation-ORIGINAL32LOWERHEX \
  --expected-case-version ORIGINAL_CASE_VERSION \
  --selection /absolute/original/SOURCE_SELECTION.json \
  --source-root /absolute/original/complete-files \
  --scenario /absolute/original/sf10_current_candidate.json \
  --actor "The actual recording operator" \
  --operation-id SCF-INSTALLATION-SOURCE-DESK-2769-20261012 \
  --node /absolute/node \
  --browser-module /absolute/playwright/index.js \
  --browser-executable /absolute/chrome-headless-shell
```

Every placeholder must be replaced by the original selected identity or actual runtime path. Select a distinct private receiving directory outside the case and its original source input directory. A retry keeps that same directory, operation ID, starting case version, files, source mapping and runtime selection. It reconciles the original requests and completed phases before advancing. A source or runtime change requires explicit reconciliation of the original operation.

The 15 connected stages retain the actual original case, prepare the complete customer cohort, read and verify every native output, attach all sources atomically, replay the original request, use the terminal reader, prepare the selected native Installation, perform the actual browser flow, export the entire operating case, restore a full SQLite backup and reopen the original workspace. The browser retains exact draft/form and request state between attempts, keeps its original loopback origin, and captures the principal customer screens at 1440-pixel and 390-pixel widths. A multi-file workorder download must supply each expected filename once and the complete expected set.

`report.json` includes the original source/runtime selection, every completed phase, exact mutation requests, artifact lengths and SHA-256 values, and the actual lifetime outcome. The complete browser report is a separately bound artifact. The original API case ZIP and complete SQLite backup remain distinct outputs. Receiving success is reported only after all owned browser processes, HTTP handlers, SQLite connections and workspace leases have closed.

The managed launch source selection now covers this complete desk, its CLI and receiving programme, the unchanged native source helper and profile engine, and every profile present in the selected installed edition. Newer staff, accounting and commercial workflows stay part of the same original source selection. A changed installed profile or helper is a changed launch/source selection and must be reviewed through the existing launcher.

Keep actual receiving reports and private customer/workspace packages with the original operation's artifact delivery. The repository contains the generic implementation, guide and receiving programme.
