# Biomedical service onboarding study — complete current source

The study compares an explicitly selected original export with a returned trial export. It preserves the original UTF-8 text (including BOM and line endings), column mapping, exact source line ranges, selected extract editions, explicit identity maps, all prior study editions and editable session drafts.

## Current completed model

Three linked record kinds: facilities, assets and service events. Facility fields: id/name/address. Assets: id/facility_id/tag/serial/manufacturer/model/status/next_due/procedure_ref. Events: id/asset_id/event_type/performed_at/recorded_due/status/report_ref/procedure_ref/findings_text/technician_ref. These are the study's comparison fields, not a claimed the supplying system import schema. The owner supplies the actual current export and deliberately maps its real columns.

No ID is inferred from a name or serial. A source ID maps explicitly to a returned ID, including facility and asset references. Unique exact same IDs can be deliberately paired with matchIds; renamed IDs need the explicit map. Null mapping means unobserved; mapped blank string is an actual observed blank. Unknown fields stay visible as FIELD_UNMAPPED. Duplicates, missing parents, dangling maps, many-to-one maps, unexpected returned identities and exact selected-field changes remain findings. Equal row counts alone do not pass a comparison.

Source record values are compared exactly. A date value is retained, not interpreted as a new maintenance instruction. The selected original procedure/report reference remains a literal reference; file existence, signature authenticity and device suitability require the operating company's actual systems and review. Signed report binaries can remain at an approved original locator with a retained checksum in a later operator extension; current text comparison does not claim to authenticate a signature.

The data class is operational or authored_course. Current review records bind the whole selected study digest. A review records the named operator's decision and can acknowledge differences; it does not silently remove them or certify equipment safety. Earlier reviews stay historical after a selected-source/configuration/map change.

## Completed receiving exercise

examples/course.cjs constructs two fictional facilities, three fictional assets and three fictional service events. The initial returned extract has the same row counts but five deliberate differences: asset facility, serial, event's linked asset, recorded service date and report reference. The actual core returns five VALUE_CHANGED findings. A corrected returned edition returns zero findings; all nine source/first/corrected original CSV files remain available. UTF-8 BOM exists in original input and is preserved. Fixture dates and statuses are administrative examples, with no invented physical test readings.

## API and source

core.cjs: empty/validate/digest/inspectCSV/importExtract/selected/rows/choose/crosswalk/matchIds/analyze/review/report/exports. Every mutation returns a new full study. Exports contain full study, comparison, Markdown report, selected canonical tables, crosswalks and every original with a source index.

session.cjs: the maintained compact content-addressed browser-session model adapted from the reviewed pilot-measurement operator. create/validate/normalize/retain/checkpoint/draft/use/takeSession/historyStudy/branchSession/branchInfo/reviewDraft/recordReview. Complete draft state is distinct from committed domain study. Forty-MiB validation applies to complete retained session; browser must stage the full successor and only then discard an emergency form.

csv.cjs: exact quoted CSV parser with CR, LF and CRLF line accounting; no source trimming or silent row-width repair. sha256.cjs is the existing maintained dependency. No npm installation is required for these CommonJS modules.

## Receiving work now assigned

Revenue delivery owns complete ordinary browser form/UI, native CLI, portable recovery/export, exact source handover and meaningful model/handler/native course. Continue this complete current source rather than authoring another parallel core. Add any useful customer/company, billing reference, report attachment or approved-PM document linkage to this contract deliberately, while preserving this original complete edition.

The UI should start with source selection/mapping, then explicit crosswalks, comparison and review. Keep imported originals, initial/corrected returned editions and all unfinished forms through save/reopen, conflict adoption and export. A saved review must reject a changed selected digest. Source columns may be omitted explicitly and then appear as unobserved, not silently equal.

This retained first edition defines an independent offline receiving model. Actual source and destination owners supply their production schema and authorised administrative records.
