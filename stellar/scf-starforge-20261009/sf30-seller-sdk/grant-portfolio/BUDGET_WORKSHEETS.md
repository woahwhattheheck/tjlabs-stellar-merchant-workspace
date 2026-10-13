# Budget worksheets

Use **Budget worksheet** in **Budget and forecast** to prepare a scenario for spreadsheet review and return the reviewed rows to the same saved portfolio. The complete original export, returned source, mapping, row exclusions and conflict decisions are saved as a program document with the budget revision.

The worksheet uses the existing planning records, draft and **Save complete draft** operation. Its amounts are exact decimal text. The original native budget and cash reports calculate the position after the draft is saved.

## Prepare a complete scenario

Open the original portfolio, choose its latest revision and select a saved active scenario. Enter **Recorded by** before applying a returned worksheet.

Choose **Budget worksheet**, then **Prepare selected scenario worksheet**. Download both:

- **Original worksheet CSV**, containing every active line in this scenario.
- **Original basis JSON**, containing the complete original lines, saved identities, selected scenario and portfolio basis.

Keep the pair together. The browser also retains the current worksheet review when browser storage is available. **Download complete review JSON** saves the entire working review, including the raw returned source and decisions.

The export includes staged line values if the current planning draft already contains them. Its original saved line revisions remain explicit. Save a newly created scenario before preparing a worksheet for it.

A worksheet prepared at an earlier saved portfolio revision keeps that original basis. Apply its return against the latest portfolio after reviewing the changes. The existing planning draft itself must first be reviewed against the current saved revision.

## Edit the spreadsheet

Import the CSV as UTF-8 and keep its columns as text. Spreadsheet applications can otherwise change long decimal values, leading zeroes or annual/monthly period labels.

Keep the original **id** and **revision** on existing rows. The revision identifies the exported basis; do not replace it with a later revision number. The application compares the original export, returned cells and current draft independently.

For an additional line, leave **id** and **revision** blank. A stable new ID is retained when the source review opens. Complete its actual required fields. The selected scenario and its root node are available as defaults; review the actual project scope before applying them.

The supported actions are:

| Action | Effect |
| --- | --- |
| `upsert` | Add a new line or review changed cells of an original line. |
| `archive` | Explicitly archive a saved original line, with a complete `archive_reason`. Its earlier editions remain in history. |
| `skip` | Retain the source row while excluding it from this application. |

Removing a row from the returned spreadsheet does not remove or archive a saved budget line. The review never treats an omitted row as a deletion.

### Amounts and periods

A blank amount means **unknown**. The text `0` is a recorded zero. Amounts retain their original plain decimal strings, up to 64 characters and 18 fractional digits. The application does not round worksheet cells, evaluate spreadsheet formulas, convert currencies or infer monthly allocation.

Use `YYYY` for a complete annual budget period and `YYYY-MM` for a month. A complete annual period must fit inside the scenario horizon. An annual amount remains annual in native reports; the application does not spread it over months.

The cash date is a separate actual expected date, `YYYY-MM-DD`, or blank when unprovided. A budget period and cash date may differ. Each must fit the selected scenario.

Use the actual three-letter currency and keep different currencies separate. The worksheet preview reports changed records, not invented monetary totals.

### Scope and evidence

The original scenario ID stays fixed for a returned worksheet. Use the ordinary line editor when a line must move to another scenario.

The project, grant, milestone and document references remain original IDs. **Original reference IDs** opens their complete current registers with pagination. Native save checks that:

- The project falls within the selected scenario.
- A selected grant belongs to the line's project.
- A milestone covers that project and, where applicable, grant.
- Supporting documents cover the selected project/grant.
- A commitment has its actual agreement, order or other commitment reference.
- Every source reference selects the exact original source edition, entity and hash.

The `documentIds` column is a JSON array of original document IDs. `sourceRefs` is a JSON array of complete `sourceId`, `entityKey` and `sha256` objects. Keep those references unchanged unless the corresponding original source selection is known. The ordinary application source picker remains available for selecting original records.

## Open a returned CSV or TSV

Reopen the same workspace and portfolio. If necessary, use **Receive original basis or complete review JSON** to open the original basis or the entire saved review.

Choose the actual source delimiter—comma, tab, semicolon or pipe—then select the complete returned UTF-8 file. A return accepts up to 2 MiB and 1,999 source rows. One additional scenario change retains the complete source document; the existing complete planning save supports up to 2,000 changed or archived records.

The parser retains the original source text, including its BOM, line endings, quoted commas, quoted multiline cells and columns that are not mapped. Invalid UTF-8, broken quotation and inconsistent row widths produce an explicit source error. The complete source file remains the input for review.

Select **Columns and complete source** to inspect the original rows. Exact header matches are initially mapped to their declared fields. Map a source column to at most one field.

For an existing row, an unmapped field remains at its original exported value and does not overwrite a later current change. A blank *mapped* amount means unknown; a blank mapped optional reference clears that selection. New rows require their complete necessary fields.

The source grid displays every column and pages the rows. Pages change only what is visible. All source rows participate in the complete review and stage operation.

## Review changed rows

Return to **Changed rows and decisions**. The overview lists additions, edits, explicit archives, excluded rows, unchanged rows, source errors and unresolved conflicts.

Open **Review row** to inspect all current and reviewed fields.

The comparison uses three complete values:

1. The value in the original exported worksheet.
2. The value in the returned source.
3. The value in the current saved or staged record.

An unchanged returned cell preserves a later current edit. A returned change can be accepted directly when the current value still matches the original basis. If both sides changed the same field differently, choose **Keep current draft value** or **Use returned value** explicitly.

A decision belongs to that exact source, mapping and three-way comparison. If its basis changes, the earlier choice is displayed as obsolete and is not silently applied. Review the new current conflict.

An archive of a record that changed after export also requires explicit review. Save a line's other existing staged edits before archiving it; the same native record cannot be both edited and archived in one planning batch.

You can exclude an individual source record with an explicit reason. A reason still being typed is retained in the complete review separately from its saved exclusion; returning to the row restores it. Choose **Save exclusion or clear its reason** to apply that decision. Its full original cells and the reason remain retained. Fixing or excluding one invalid row does not discard the rest of the file.

Use **Download complete review result** for the full machine-readable projection or **Download printable review** for the complete human-readable review. Both include every relevant row; neither is limited to the currently visible page.

## Stage and save together

After resolving errors and conflicts, choose **Stage complete reviewed worksheet**.

The application prepares the whole batch before changing the planning draft. It preserves existing independent draft changes, stable line identities and original record bases. The scenario gains a reference to one complete `workplan-budget` document containing:

- The original worksheet export and full basis.
- Exact returned source text and its identity.
- Complete column mapping and excluded rows.
- Reviewed conflict choices.
- All staged additions, edits and explicit archives.
- The original staging selection, operator and time.

The batch remains **staged** until **Save complete draft** succeeds.

Close the worksheet dialog and inspect **Review all staged changes**. Then choose **Save complete draft**. The original application uploads the complete source object, retains its exact descriptor and submits one original `portfolio.save` containing the source document and planning changes together.

The native writer rechecks the portfolio, program, planning and individual record revisions; references; scenario scope; exact amounts; and full action size. Existing Finance review behavior remains in effect. Save budget edits before recording a separate Finance clearance. The earlier reviewed scenario remains available in portfolio history.

After the save, use the ordinary budget and cash position, native JSON/CSV/HTML reports and revision history. Open the linked program document to download the complete worksheet source. The ordinary full portfolio handoff includes that document and its original uploaded bytes.

## Interrupted work and complete receiving

The original source upload and save each preserve their original identities.

If the save response is interrupted, use **Receive original save** or **Saved operations**. The draft keeps the original operation; do not create a replacement request merely because a response was interrupted.

If the portfolio advances before an unsent draft is saved, use its existing **Review against current revision** function. Source documents remain attached to their original worksheet staging basis. A safe later draft rebase does not rewrite the source's original recorded selection.

Download **Complete review JSON** to continue spreadsheet mapping or decisions elsewhere in the same original workspace. Download the complete planning draft JSON to retain already staged changes and all source bytes. Receive each through its corresponding original control.

If a previously stored browser review cannot be opened, the original stored text remains available through **Download earlier retained text**. Preparing or receiving a replacement is an explicit action.

To replace a current source or original worksheet, first download the complete review if it is needed. The interface asks you to choose the replacement explicitly. Saved portfolio revisions and their document editions remain unchanged.

## Published SPC annual table

The bundled published SPC table contains 21 original program rows, three funding categories and two published annual editions: 126 budget lines. The complete published original source retains the `2025R` revised-year label, `2026` label, all blank cells and separate published aggregate controls.

Open the actual imported published-budget scenario and prepare its worksheet. Its existing three source documents remain selected; a later reviewed return adds its own complete source document. Use an actual operator-supplied correction or forecast when editing the plan. The original published figures remain in their prior portfolio revision and original source documents.

Annual values remain annual. Blank cells remain unknown until a reviewer explicitly provides a value. No monthly cash forecast, funding receipt or customer pilot activity is inferred from that published table.
