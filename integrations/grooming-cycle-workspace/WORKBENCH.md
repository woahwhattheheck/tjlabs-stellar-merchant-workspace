# Grooming Cycle Workbench — complete operating guide

Token Junkie Labs built this independent workbench to compare original grooming records. The authoritative booking service, signed terms, observed messages and payment records stay separate. It retains full source editions, source-bound reviews, unfinished forms and original imported bytes in one complete working copy.

## Open and retain the working copy

Open Grooming_Cycle_Workbench.html for a blank study or Grooming_Cycle_Worked_Example.html for the authored example. Both are complete offline applications. The name field is an unfinished draft; Apply workspace name commits a valid nonempty name while retaining the previous full copy. A blank rename draft remains exportable.

Save complete working copy retains an immutable proposal and compares the current browser head before accepting it. A competing saved head preserves the whole proposal for recovery. A successful save updates the accepted head identity before any optional copy-list refresh. Open saved head restores that accepted copy; Open selected copy and Open full workspace adopt a visibly unsaved proposal.

Download full workspace JSON retains source editions, reviews, source drafts, selected edition, unfinished settings and reviews, original byte receipts, notes and native continuation. Download complete working HTML embeds the same complete state in the application. When browser storage fails, an explicitly confirmed exact JSON download can satisfy retention before replacement. Any later edit invalidates that confirmation.

Imported or saved copies are validated before replacing the current body. The old full working copy is retained first. A failed retain leaves the current work selected. Copy selected edition into a new draft preserves the original accepted edition while preparing a separate correction.

## Receive thirteen original source tables

Every source edition supplies resources, availability, booking_revisions, quoted_lines, completions, invoice_lines, payments, allocations, series, expected_visits, policy_versions, decisions and communications. A header-only table explicitly states no rows. Exact columns appear beside the source editor and in INTAKE_CONTRACT.json.

Choose the table and import its original UTF-8 CSV. Selection and file identity freeze before asynchronous reading. BOM, CRLF, filenames and complete original byte receipts survive. A malformed UTF-8 file is retained with its error; the preceding editable CSV remains selected. Editing the text prepares a new authored source body without changing the original imported bytes.

Each table is limited to 4 MiB and 20,000 parsed data rows. A complete working file is limited to 128 MiB. Keep large unrelated periods in separately named studies with their original sources. The app never truncates a source to fit a limit.

Set the edition ID, label, received-at time, notes, operating day start/end and as-of instant. Times require complete ISO calendar timestamps with seconds and an explicit UTC offset. One operating day may span midnight or an offset change, up to 36 hours. The as-of instant determines which recorded revisions and observations are current. Future-recorded sources remain visible separately.

Unfinished invalid CSV, settings and review fields remain recoverable in the working file. Receive all thirteen validates the complete edition, appends it and leaves all earlier editions intact. Selecting another accepted edition does not overwrite the unfinished source draft.

## Recurring series and explicit occurrences

A series retains its source-defined client, pet, service, cadence label, status and recorded time. The cadence label is descriptive. The workbench does not generate appointments from a four-week, six-week, calendar-month or other pattern.

Every expected visit is an explicit original occurrence with stable ID, series, sequence, start/end and recorded time. The original local offset remains intact. Current appointments link to that occurrence. A reschedule preserves its identity; missing, inactive-only or multiply active coverage remains visible. Start and duration differences are calculated from the retained instants.

Cycle tables show the whole supplied occurrence horizon. Expected-in-day and due distinguish the chosen day from later explicit occurrences. An unbooked future occurrence is an operational review item, not a claim that a customer has already missed an appointment.

A paused or ended series can still retain an original future booking. Keep the actual series decision and appointment decision separate and resolve them through authorized source corrections. If the business does not maintain recurring records, receive header-only series and expected_visits tables instead of inventing a cadence.

## Accepted policies and recorded decisions

Each service policy has a stable version ID, service, label, full terms, recorded time and explicit notice basis. elapsed_minutes admits the supplied integer notice threshold. business_hours and manual preserve the terms without inferring a business calendar or translating them into elapsed hours.

An appointment revision references the exact policy it accepted and the actual acceptance time. A newer policy version does not retroactively replace the earlier acceptance. A missing policy is visible as incomplete source context.

Original decisions bind the appointment and precise revision, event kind, decision time, optional notice-received time, written authorization and reference. For cancellation/reschedule, elapsed notice is compared with the start of that original revision and its accepted policy. Unknown notice, missing policy and manual notice remain distinct.

The comparison records what the sources say. It never calculates or executes a cancellation fee, takes payment, waives an obligation or changes the live calendar. Actual invoices, receipts, refunds and allocations remain independent evidence of the financial outcome. Business-specific exceptions and ambiguous public wording belong in the operator's attributed review.

## Communications and pickup

Each source message preserves its ID, exact appointment revision, kind, language, scheduled time, optional actual send time, observation time, outcome and recipient reference. Sent and delivered are distinct original observations. Queued records cannot assert a send. Future observations are separate at the selected as-of.

Language comparison uses the preference recorded on that exact appointment revision; missing language remains unknown. Failed, overdue queued, duplicated source identities and messages concerning an earlier changed/cancelled revision receive attention. A duplicate flag asks the operator to inspect the original delivery records; it does not assume which message was received by the client.

A ready-for-pickup notice can be sent before grooming is finished as part of the business's actual workflow. The workbench surfaces that timing or an unconfirmed completion so the reviewer can retain the intended handover explanation. It neither labels an intentional advance notice a service failure nor sends a replacement message.

## Appointment and resource time

An appointment's client, pet and currency remain stable across complete replacement revisions. Sequence and recorded time increase. The latest revision recorded by as-of is selected, with its original predecessor preserved. A different pet/client uses an appropriately distinct appointment identity.

Active work declares one groomer and an optional station with independent before/after buffers. These are source-provided preparation, turnaround or mobile allowances. Cancelled and postponed appointments reserve no planned time while retaining their money history.

Adjacent available windows can cover a continuous interval. A blocked window takes precedence. Planned occupancy and independently observed occupancy are separate. A buffer crossing into the owned day remains visible even when the service itself starts outside it. The whole interval is retained and out-of-day/out-of-shift portions receive attention.

A completed observation has actual start, finish and observation time. An in-progress observation has no fabricated finish: its observed interval ends at observed_at. A later as-of does not prove continued grooming.

The resource filter affects displayed windows, occupancy and conflicts. Appointment, cycle, policy, communication and money views remain complete. Original source time strings retain offsets; calculated occupancy uses UTC.

## Exact money and allocation

All amounts are canonical integer minor units in explicit currencies. Currencies are never converted. Quotes belong to the exact appointment revision; missing quote rows mean unknown rather than zero. Signed invoice/quote credits retain their original amounts.

Each invoice line belongs to an invoice and appointment. A quote/invoice difference raises a review question without editing either. Received transactions and refunds are separate positive originals; a refund names an earlier received transaction in the same currency.

Current allocation snapshots explicitly link a transaction to an appointment and, optionally, an invoice. A deposit without invoice attribution is unapplied appointment credit. It does not automatically pay one or several invoices. Invoice-linked balance, all allocated funds and net position remain distinct.

Refunds reduce available receipt credit. The allocation of a refund must reconcile to the original receipt's appointment allocations; mismatched allocation cannot manufacture new available credit. Excesses and unallocated balances stay visible. An authorized transfer is a new complete allocation source edition referring to the actual receipt and written authority, never a second invented receipt.

## Review and correction

Choose any actual appointment, resource, invoice, transaction, allocation, series, occurrence, policy, decision or communication. The complete selected row and related attention appear with its current review basis.

Investigate and Accept as expected append a reviewer, reason and evidence reference. They change no original quantity, time, policy or observed outcome. Corrections name the previous review for that exact edition/type/subject. A stale form cannot overwrite a newer review. Drafts remain keyed to their original source and subject across selection changes.

New source editions require their own review. Previous approvals remain with their original source edition. Full working JSON and working HTML preserve every review and unfinished form; ordinary reports retain accepted core history and selected-edition originals.

## Native continuation and ordinary output

Run the dependency-free native tool with a full exported desk or core file:

```sh
node groom-cycle-native.mjs --workspace complete-desk.json --command receive.command.json --out NEW_DIRECTORY
```

A receive command can include all thirteen complete source bodies or a sourceFiles map whose paths are resolved relative to the command file. A review command supplies the exact source-bound review arguments. Output directories and files are create-only.

workspace.json retains the full incoming browser wrapper and unchanged session with updated accepted core. core-workspace.json is also supplied. The exact original input, command bytes, every readable source receipt and rejected operation remain recoverable. Native continuation retains prior attempts in order.

Open the emitted workspace.json in the browser, inspect Native continuation and explicitly select the newly appended edition. The old selected edition and unfinished forms are preserved deliberately. Read-only native reporting preserves the whole current wrapper. Retain-and-clear saves the complete predecessor before clearing the visible continuation.

The CSV selector exports all thirteen comparison views, including series, expected visits, policies, decisions and communications. Spreadsheet formula-like derived strings are protected. Exact original CSV downloads stay unchanged. The HTML report contains the selected comparison, all original edition sources and full core workspace; use complete workspace JSON or working HTML for unfinished forms.

## Authored example

The worked example has three series, four explicit expected visits, one unbooked later occurrence and one postponed occurrence. VISIT-A moves from 09:00 to 10:00 while keeping O-A2. It retains accepted POL-24 despite the later POL-48 edition. The recorded 21-hour notice is inside the original 24-hour threshold; the operator's no-new-charge authorization remains unchanged. A business-hours decision stays manual.

Original communication records illustrate mismatched language, duplicate earlier-revision messages, an overdue queued message and an advance pickup notice. These are authored operating cases.

VISIT-A has a 9,000-minor-unit quote and 9,500 invoice; 2,500 applied leaves 7,000 invoice balance. Postponed VISIT-C retains 4,000 unapplied credit and no planned occupancy. Planned and observed overlap are separate. None of these records represent a real business's outcomes.

## Existing equipped receiving chapter

Use the original shared receiving course and exact current package. Open the blank and worked apps at desktop and 390px. Inspect actual layout, table overflow, empty state, source selection, cycle horizon, policy/decision/message details, review controls and native continuation. View the actual screenshots and patch any visible defects.

Receive all thirteen authored originals. Review the moved occurrence, future unbooked visit, old accepted policy versus new version, manual notice, actual message language/outcome and separate money balances. Review an occurrence and a communication, append a correction, and verify original values remain unchanged.

Leave invalid CSV, an unfinished as-of, an empty name draft and a partial review. Download full JSON and complete working HTML; reopen each and continue the same selections. Import BOM/CRLF and malformed UTF-8 originals and recover their exact bytes. In separate real browser tabs, save competing full proposals and reopen both.

Carry the actual exported wrapper through native receive, review and rejected-source operations into a new directory. Reopen current workspace.json, inspect its full original command/receipts and unchanged browser drafts, then select the appended source edition. Download/view the full HTML report and each new cycle CSV. Return actual screenshots, downloaded outputs and any concrete fixes in the same original receiving thread.

The maintained source/controller/native courses exercise production functions through explicit adapters. Actual rendered-browser observations are returned by the existing equipped receiving owner.
