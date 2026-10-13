# Humanitarian source selection, operation and handover

This guide connects configuration work to the saved objects in the humanitarian application and the dataset-humanitarian command. Keep the selected full source edition and its original returned identifiers beside each step. The same workflow supports an initial reporting edition, a later edition and a complete transfer to a receiving analyst.

## 1. Select complete inputs

Retain the original table bytes before transformation. Record the file name, size, hash, acquisition URL or source owner, retrieval date, reporting period, permitted use and schema information. For spreadsheets, identify the actual sheet and header rows. For delimited input, retain the encoding and delimiter. Keep identifiers and administrative codes as strings.

Use source --file FILE --label LABEL for the complete supplied files. Record each returned source ID. A source label is useful for people; the actual retained source ID identifies the edition used by a mapping or review.

Choose the reference edition independently. Record the exact reference publisher, file, source identity, geographical extent, administrative levels, issue/effective date, licence and attribution. A later reference must not silently replace the one used for an earlier review. A current URL alone does not identify the bytes used in a completed reporting cycle.

## 2. Save the administrative reference

Use save-reference to select the retained reference source and its ordered administrative levels, with an explicit code/name column or constant at each level. Examine duplicate code/level combinations, missing parents and records outside the intended extent. Retain exceptions and the selected interpretation.

Distinguish administrative code matching from geographic display. A code/name/parent table can support reference matching without supplying geometry. Geometry, coordinate transformations and boundary editions need their own actual source and interpretation when a selected output requires them.

## 3. Save a mapping and review aliases

Use save-mapping to bind source columns and output fields. Retain the selected identifier, period, measure, unit, location code/name/level/parent, missing-value representation and aggregation grain. Describe each chosen transform and any source rows it excludes. An output total is meaningful only with its grain, measure and membership rules.

A local variant of a name can correspond to multiple administrative records. Use the issue view to inspect its source context and candidate reference records. save-alias retains the named resolution. Keep the source spelling, reference edition, selected code/level/parent, reviewer and rationale. An unresolved issue remains visible in the review and export choices.

For HXL CSV, retain the exact selected tag for each output column. Local HXL compatibility should be reproducible from the saved mapping. Hosted services are not required by this process.

## 4. Save and inspect a review

Use save-review to select the actual source, mapping, reporting period and reviewed alias decisions. Record the returned review ID and revision. Changes belong to a new saved revision; earlier views remain available through history.

Use rows to inspect complete source-related records, its issues filter to inspect unresolved or inconsistent values, and report to inspect the selected reporting result. Check the following together:

| Check | Receiving interpretation |
| --- | --- |
| Source row census | Explain each retained, excluded or aggregated row |
| Row identifiers | Preserve source keys and disclose duplicates |
| Measures and units | Keep unlike measures separate unless the mapping defines a conversion |
| Missing and zero | Preserve their different meanings |
| Memberships | Identify overlapping sector, organisation or location memberships |
| Reporting period | Distinguish observation date, reporting period and publication date |
| Administrative edition | Keep code, level and parent context from the selected reference |
| Alias decisions | Reproduce named decisions and retain unresolved issues |
| Output grain | State the entity and period represented by each output row |

For a later edition, select that edition explicitly and save its own review or revision using the model's actual supported request contract. Compare retained source definitions, periods, aliases and layouts before interpreting changes in totals. A revised indicator definition or reference edition can change a result without representing a change in the underlying situation.

## 5. Choose outputs from the saved mapping

Agree the required outputs before implementation. Retain a complete recipient template and its edition or instructions. Select exact field order, required values, units, administrative level, sort order, date format, missing-value representation and audience.

The reporting export provides complete agreed donor/cluster layouts as ordinary CSV, Excel import CSV, HXL CSV when tags are selected, Kobo cascading choices and XLSForm source tables, complete normalized JSONL, SQLite with an edition view per table, and an offline report. Select the families and fields needed for the current handback. A choice list's label can differ from its stored code; preserve both and their parent relationship.

Use export --id REVIEW --output ZIP for the selected review and revision. Record every returned artifact identity. Read and inspect the actual produced outputs with the receiving analyst. The Kobo handover includes complete survey, choices and settings CSV tables for the owner's XLSForm workflow, with a reversible code lookup when form identifiers require a different spelling.

## 6. Receive the complete portable work

Export the full review package, then use receive --file ZIP in a separate destination. Preserve the complete original sources, reference metadata, mapping, alias decisions, review history and output selections within their actual portable contract.

After receiving, reopen the returned review and its earlier history. Check the retained source/reference identities, mapping choices, named decisions, periods and output results. Keep the original export descriptor and the actual receiving result. Do not recreate missing history by copying the latest view into older revisions.

The receiving record should contain the selected product source version, environment, original request/result records, package identity, receiving destination, returned review/revision, checks performed, issue disposition and named analyst. A completed report accompanies the complete editable portable work.

## 7. Practice the next cycle

Session one covers source/reference selection and a named alias review. The analyst locates the source record, explains the reference level and parent, records the decision and inspects the saved review.

Session two covers the next edition and independent receiving. The analyst imports the selected later source, reuses the reviewed configuration where it applies, investigates remaining issues, saves the new review, produces the chosen outputs and reopens the package elsewhere.

Retain a concise operating log with the next source owner, reference owner, reporting definition owner, analyst, output recipient, update cadence and support contact. Write down the point at which a new schema, administrative reference edition, output layout or transform requires a new selection.

## Completion record

Complete handover means the selected inputs and output definitions are present, the named analyst has repeated the workflow, actual receiving has reopened the full saved work, and unresolved matters have a recorded owner and disposition. The full source-bound configuration and practice record equip the team to continue its reporting cycle and assess future changes.
