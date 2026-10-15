# Repair Queue Workbench: operate and continue

The Token Junkie Labs Repair Queue Workbench is an independent preparation tool for the selected one-way queue programme. It keeps a workshop's complete original CSV exports, explicit mappings and source authority together with its reviewed changes and actual application observations.

## Opening the complete package

Open Repair_Queue_Workbench.html for an empty workspace. Open Repair_Queue_Worked_Example.html for the authored controlled queue. Each is a complete offline application. The worked example is an operating example with reserved example.com contacts; its rows and outcome history are not a researched workshop's records.

Enter a workspace name. Nonblank edits update the current workspace and its saved-copy titles. An unfinished blank name stays in the working form. Save complete workspace keeps the current saved head and an independent proposed copy. Download complete workspace creates a portable full file, including earlier source editions, mappings, raw imported bytes, decision/observation histories and unfinished forms.

## Load and map the original sources

Choose whether this is an initial import, later source sync or manual application entry. Include a complete previous source for a later sync. Declare sheet-managed or application-managed authority from the actual shop operation. The product's connected Sheet is read-only to the application; application edits are not written back to it.

Load the complete current CSV and, where applicable, the complete previous CSV. The loader uses strict UTF-8 and retains the original byte stream separately. The display can normalize textarea line endings; the untouched stored source remains the exact original BOM/CRLF text. A newly selected file first preserves the complete prior edited working state. If storage cannot retain it, that prior draft stays current until its complete saved export is explicitly confirmed.

An undecodable file remains retained with its complete raw bytes and a visible decoding error. Correct the source in the authorized original process, or enter an explicitly corrected draft. Its prior imported bytes remain available in All original imported file bytes. The file limit is 256 MiB per source. Complete workspace JSON admission/export is limited to 768 MiB; browser quota is independent.

Map each canonical field to the literal source header. Current and previous files have separate mappings. The required fields are repair reference, customer name, customer email and item. Keep optional fields blank when absent. Do not derive repair identity from the customer's name. Preserve the shop's stable original reference across status changes.

The status map uses exactly two CSV headers: original_status,workflow_label. Enter every original spelling explicitly. The workflow label is an operator-reviewed comparison label, not an assumed internal application enum. Duplicate original status rows and malformed map CSV remain unfinished drafts until corrected. Do not repurpose a parts delay as a completed repair or treat a request as physical device receipt.

Keep customer-visible updates separate from internal notes. Exclude account passwords, device PINs and unrelated sensitive data from both the comparison source and outbound update. Preserve the shop's existing technical measurements, approvals, custody records, dispatch, payment and specialist systems.

## Receive an immutable source edition

Give the source edition a meaningful name, record source context and provide the actual source observation timestamp with an offset, for example 2026-10-15T09:30:00Z. Configure notification preference, email and any SMS settings explicitly. Receive immutable source edition validates the complete originals, mappings and settings together. A rejected receive leaves the existing workspace history and unfinished source drafts intact.

Each successful source edition retains both full texts, original filenames, byte identities, literal mappings, parsed row occurrences, status rules, settings and notes. Later corrections create new editions. Copy selected originals into new draft preserves the previous whole working state before copying a retained edition into editable fields.

The queue shows every distinct repair reference. It separately identifies new, changed, unchanged, missing and ambiguous references. Duplicate source occurrences remain complete. A missing current row does not establish completion or deletion. A changed customer name, email, phone, item or make/model needs identity review, preserving the connection between consent, recipient and job.

Search and filter help inspect the whole queue in pages of fifty references. The exact-reference selector includes source rows with a blank reference, so those rows can receive an investigation decision. The full selected-row view retains all original occurrences and source-pair identity. Download comparison JSON or CSV for the complete selected edition; the readable report includes the same changes, attention, decisions and observed results.

## Understand channel candidates and record actual outcomes

An initial import establishes the queue silently. A later new row or changed status can be a candidate for the configured notification. A customer-note-only edit does not establish a status transition. If different raw statuses map to the same reviewed stage, verify the actual application's behavior.

Email eligibility requires the selected email configuration, preference and usable recipient address. SMS additionally requires an explicitly Canadian recipient, recorded consent, international phone, enabled configuration and confirmed separate credits. A +1 phone number alone does not establish Canada. Existing US SMS systems retain their own authority; this configured commissioning plan uses email for the US workshop cohort.

The calculated channel candidates guide a controlled application check. They are distinct from actual delivery observations. Use operator-controlled contacts for the first receiving operation, preserve the actual application/provider evidence, and record what happened in the source-bound outcome form.

## Reviews and corrections

Select the exact retained edition and repair reference. A decision can investigate, accept an explained difference, plan a corrected source or exclude a row from the trial. Supply the reviewer, reason and supporting source reference. The decision leaves the original discrepancy visible.

Choose New decision or an existing decision identity to append a correction. All earlier revisions stay in the workspace. A correction identity cannot migrate to another source edition or repair reference. Unfinished decision forms are keyed to the complete source pair, reference and selected correction.

Actual observations use their own identity and history. Record an offset timestamp, recorder, evidence, note and observed outcome. Correct an observation by selecting its existing identity and appending the corrected record. Invalid timestamps and incomplete evidence stay editable without changing source or history. Switching reference, edition or correction preserves all previous unfinished forms.

## Saved copies, adoption and recovery

The browser uses a dedicated IndexedDB store. Saving writes an independent complete proposal and compares the expected saved-head version in the same transaction. A different head keeps the proposal separate. Inspect Open saved head or a selected independent copy before choosing a continuation.

Opening a workspace first validates its entire core history, original file identities, selected reference and all source-bound forms. The current dirty state is retained before adoption. If local storage is unavailable, download the exact complete current workspace and confirm that its file was saved before retrying replacement. Any edit invalidates an earlier export confirmation.

The portable wrapper schema is tjlabs.repair-queue-desk.v1 with workspace and session. Session contains literal unfinished source/mapping/settings fields, raw imported files and their named receipts, reference selections and review/observation drafts. A bare core workspace can also open and receives a blank working session. The full wrapper is the preferred browser/native continuation format.

All original imported file bytes can be exported again by their receipt. Immutable edition source downloads preserve the selected previous/current source as received. Full history remains in the complete workspace even when the visible queue uses a later edition.

## Native continuation and rebuild

Node 20+ is sufficient for the native tools. The included materialize.mjs restores the complete source package into a new directory after checking its manifest. The maintained build-workbench.mjs creates both complete applications into a new directory; it uses the same full template, codec, core, storage and operator sources.

Use the original queue CLI with a complete workspace:
- node cli.mjs report --workspace Repair_Queue_Complete_Workspace.json --edition ACTUAL_EDITION_ID --out NEW_DIRECTORY
- node cli.mjs receive --workspace Repair_Queue_Complete_Workspace.json --input ACTUAL_INTAKE.json --out NEW_DIRECTORY
- node cli.mjs review --workspace Repair_Queue_Complete_Workspace.json --input ACTUAL_REVIEW.json --out NEW_DIRECTORY
- node cli.mjs observe --workspace Repair_Queue_Complete_Workspace.json --input ACTUAL_OBSERVATION.json --out NEW_DIRECTORY

Every output directory is create-only. workspace.json retains the complete incoming desk wrapper and its session with the updated core; core-workspace.json supplies the bare authoritative core separately. original-input-workspace.json preserves the complete once-read original input, including its BOM, unchanged. Preserve those files, all original CSVs, comparison outputs, report and manifest together. Open the updated complete workspace in this desk and continue its saved edition and unfinished forms. The native CLI's exact output contract travels in QUEUE_GUIDE.md and its current full source.


## Receiving the complete product

Open the exact outgoing blank and worked applications at desktop and around 390 pixels. Inspect loaded, empty, invalid-source and recovery states. Use the controlled example first; compare source mappings, status changes, missing/duplicate references and actual observation corrections. Retain and reopen distinct copies, export every source and the complete workspace, continue its full wrapper through the CLI and reopen the resulting current workspace. View the actual downloaded report, CSV and full files in the normal recipient applications. Keep the original operation and complete resulting source files together.
