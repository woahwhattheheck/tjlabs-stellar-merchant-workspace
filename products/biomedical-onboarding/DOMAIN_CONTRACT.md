# Biomed onboarding comparison — full-chain successor

Schema biomed.onboarding-study/v2 extends the exact retained first edition in prior-first-edition/. The current whole-chain model has customers, facilities, assets, approved_pm, workorders, events, reports and billing. These canonical comparison fields are an independent onboarding working model; confirm the actual the supplying system import/export schema separately.

Each source and returned table is an exact selected original CSV plus a complete explicit column mapping. Unknown/unobserved columns remain null; observed blanks remain empty strings. selected/availability.json accompanies ordinary canonical CSVs and identifies every available column, selected extract, original digest and row span.

Every identity is explicit. Unique exact IDs may be paired by a deliberate command; existing manually selected pairs remain. Names, tags, serial numbers and fuzzy similarity never produce identity assignments. Parent crosswalks follow the recorded customer/site/asset/PM/workorder/event/report chain. Optional PM/report/event references may be source-observed blanks; required missing links remain findings.

An event/report's historical facility is compared independently from the asset's current facility. Moving a device does not rewrite earlier service locations. PM due dates, intervals, procedure versions and approval references remain exact source literals. Different work types, reports, requests and invoice references remain separate. No new schedule, reading, signature or equipment-release decision is calculated.

Original report/workbook/PDF bytes can be retained in documents with filename, media type, byte count and SHA-256. Explicit source/returned report-ID links retain their relationship. This preserves a file; it does not authenticate its signature or certify its contents. All exact documents, indexes and link records export with the full study.

Reviews bind the entire current study digest. The latest chronological same-digest review controls the displayed review decision; a later revise cannot be hidden by an earlier accepted record. Findings remain visible after acceptance.

The expanded authored course has one customer, two facilities, three assets, two approved-source PM records, three workorders/events/reports and two billing references. Its initial return has equal counts but nine exact field/link differences; the corrected return has zero differences. All 24 CSV originals and three report documents remain. Two assets share a printed tag across different facilities, one serial is blank, and an asset's historical service site differs from its current site. Matching uses stable IDs, preserving those facts. The fixtures contain no actual physical measurement or authentic signature.

## API

core.cjs: empty, validate, digest, inspectCSV, importExtract, selected, rows, choose, crosswalk, matchIds, addDocument, linkDocument, availability, analyze, review, report, exports. Immutable successors retain all source editions. exports returns path/content for UTF-8 and path/bytes for exact documents.

session.cjs retains the same compact record-level archive, complete draft forms, selected views, branch history and 40 MiB complete-session guard. Browser successor selection must finish validation before clearing pending emergency input.

Binary CSV extraction is explicit: retain an original workbook/PDF, then import its authorised CSV derivative and record its relationship in source/extract notes. There is no automatic OCR or signature conversion.

## Complete operating delivery

The calculation model, authored course, industrial browser interface, native CLI and complete source/session exports are included. Browser and command-line paths use the same canonical model and retain the same complete working state.

The comparison dictionary is an independent study format. Confirm the exact export and import contract with each supplying system.


## Final receiving additions

Mapped report attachments are compared as exact retained SHA sets. Missing and additional bytes remain review findings; neither-side bytes is explicitly unobserved. A mistaken current link can be removed through a retained edition without deleting its file. The v1 migration retains the exact prior envelope, every previous study with its original history metadata, complete branches and unfinished forms; added kinds and fields remain unselected/unobserved. Current browser/native instructions are in OPEN_AND_EDIT.md and NATIVE.md.
