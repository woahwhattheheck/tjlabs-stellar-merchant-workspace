# Saved Grant intake work

The application keeps a named local working library for each native workspace and portfolio. A complete working file contains the original CSV and its unfinished intake state, so a second browser can inspect and reopen the work without asking for the CSV again.

## Start and continue

Open the intended portfolio and choose **Import application CSV**. Select the original CSV, funding round, actor and intended application status. Source selection retains the exact original bytes before mapping. Work through **Map CSV columns**, **Review original source rows**, and the existing programme-record matching and reviewed-batch controls.

The **Saved intake work** panel remains available throughout the intake. Give the copy a **Working-copy label**. Edits are saved after a short pause; the status identifies the retained local revision. **Save working checkpoint** also preserves the preceding complete working state as an immutable checkpoint. **Keep as separate working copy** creates a separately named record and retains the prior record, all its checkpoints and any imported original record.

The saved state includes the original CSV, mappings, programme identities, all original row dispositions and reasons, active literal corrections, inactive correction drafts, actor/status/round fields, original request and document IDs, current session and reviewed batch, batch-size text, row filter/search/page, and open row/column position. Temporarily incomplete text remains editable. The original row-review and native application validators still decide whether a later preparation or write is valid.

**Download complete working file** produces one `.working.json` file. It includes all retained checkpoints and the complete original CSV. Keep this file with the ordinary application source when moving work to another browser.

## Reopen from this browser

Choose **Saved intake work** from the Awards screen. Select the intended record in **Retained intake working copy**, then choose **Inspect retained intake work**. The inspection displays its native workspace, portfolio, original revision, source byte count and SHA-256, complete state and checkpoints.

Select **Current working state** or an explicit **Retained checkpoint**, then choose **Restore inspected working state**. The application checks the current native selection and original saved session before replacing any live field. It saves the displaced complete intake first. A changed local record must be inspected again; a stale tab cannot overwrite a newer saved revision.

The list is scoped to the selected native workspace and portfolio, with search and pages of 25 records. Each original CSV is stored once by its full SHA-256; records and checkpoints retain their own state and source identity.

## Open a portable file

Use **Open complete intake working file** to inspect a downloaded file. Opening it only reads and verifies data. Choose **Restore inspected working state** to adopt it explicitly.

Portable adoption creates a separate local record, even if the original record ID already exists in this browser. Its full imported record and checkpoint history remain attached. This supports ordinary download → reopen in the same browser, older checkpoints, and independent browser receiving while retaining newer live work.

The native workspace and portfolio must match. Unfinished reviews require the original portfolio revision and snapshot. Saved sessions can be reconciled against a later revision of the same workspace and portfolio by the existing original-operation engine. Historical or foreign copies remain available for inspection and complete download; selecting a different native portfolio is an explicit operator action.

A pending native operation does not prevent reading its original CSV or opening a saved session through **Saved intake work**. Starting a new mapped import or dispatching a new write still uses the existing current-revision and pending-operation guards. **Review original saved import** and **Inspect original operations** remain the continuation controls for the original request.

## Close, storage failures and concurrent tabs

Normal **Close**, Escape and switching the parent detail screen first finish the complete local save. A failed save leaves the current intake open and displays the actual storage or conflict error. Current work remains editable and downloadable.

When browser storage is unavailable or full, choose **Download complete working file** and then **Close**. The application permits that fallback only while the downloaded work, source and label still exactly match the current state. An edit after the download requires another complete download before leaving. An older download never counts as retaining newer text.

For a stale-tab conflict, **Keep as separate working copy** preserves the current tab under a new ID. The original newer record remains intact. No records or checkpoints are automatically deleted.

Local browser retention is independent of the native portfolio archive. Only explicitly saved applications and programme evidence enter the native archive; unfinished work travels in the complete working file. Keep both when handing over an in-progress intake.

## Original bytes and compatibility

Original CSV limits remain 64 MiB and 25,000 rows. Sources above 2,000 rows use the existing 50-column bound; legacy source admission remains unchanged. Complete working files admit up to 512 MiB and validate their whole-file seal and original CSV bytes. A large file may require substantial browser memory; failed storage or validation does not replace current work.

The existing single-import v1 plans, session v1/v2, browser-session wrappers and unfinished row-review files retain their original formats. The new working-file format is additive:

- `stellar-forge.awards-intake-working-file.v1`: whole sealed file and original CSV.
- `stellar-forge.awards-intake-working-record.v1`: local copy, original context and immutable checkpoints.

Open/import/inspect/restore never replays an imported request. Existing **Review batch N**, **Save reviewed batch**, and **Inspect original operations** retain explicit operator control over native writes.

## Source and native receiving

The complete source includes `awards-intake-working.mjs`, its typed interface, the original controller/parent hooks, the server route, this guide, and the supplied-page chapter `examples/awards/intake-working-receiving.mjs`. The chapter joins the existing Awards receiving operation and its already-authenticated browser. It uses original source and identities and performs no new native application save.

The producing worker must open, run and look at the exact outgoing application at desktop and 390-pixel width; operate the live controls; open every downloaded attachment and complete working file; and independently reopen the portable work. The same original course continues to native reviewed writes, complete archive export, independent receive and cold reopen. Repair any observed fault in the current source. Source-level execution with explicit adapters is useful engineering evidence and is labelled separately from native/browser acceptance.

Customer source and handover remain in the original private Slack case. Existing admitted operations and their retained files remain authoritative when resuming.

## Saved exception continuations

After inspecting a completed mixed intake, choose **Resolve remaining original rows** on the latest original portfolio. The saved-intake library creates a separate current working record after retaining the displaced whole working state. The continuation keeps the full prior session, native outcome bindings and the preceding working state, including inactive correction text and original positions.

Previously accepted rows remain visible under **All original rows** and **Accepted applications**, with their disposition, reason and correction controls read-only. The original accepted application IDs and programme bindings are not reassigned. Remaining exceptions and non-applications can receive an explicit correction and reviewed disposition. **Match accepted programme records** shows only newly accepted application actions. **Prepare reviewed batches** excludes the carried rows from writes.

**Download complete working file** includes the unchanged complete CSV, current correction drafts, preceding inactive drafts, complete continuation, allocated IDs, current position and selected session/batch. Same-browser open/restore and a fresh browser both preserve that context. Restoring an unfinished continuation rereads its actual original native operations before adoption; new preparation still requires the exact current selected portfolio. Existing local compare-and-swap, displaced-state retention and complete-download recovery apply.

The complete session download retains the new v3 session and reviewed batch. Its view distinguishes previously recorded rows from newly accepted rows. Opening a prior session or working file does not submit anything; **Save reviewed batch** is the explicit original native action. A completed original row remains accepted in the source accounting even when its current application has subsequently been withdrawn or otherwise legitimately advanced.
