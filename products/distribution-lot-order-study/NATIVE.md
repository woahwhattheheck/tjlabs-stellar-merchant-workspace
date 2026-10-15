# Native command

Use Node 18 or later. The source is standalone CommonJS; no installation or network call is required.

    node native/distribution-desk.cjs help
    node native/distribution-desk.cjs new --label "Warehouse study" --out new-session.json
    node native/distribution-desk.cjs course --kind complete --out authored-session.json
    node native/distribution-desk.cjs inspect --in authored-session.json

The CLI writes new destinations and refuses to replace a different existing file. Supply a new --out for each revision. JSON, CSV and text use UTF-8. All timestamps are actual UTC ISO instants.

## Source and scope

- set-config --in SESSION --field label|data_class|source_scope|returned_scope|authority_notes --value TEXT --out SESSION
- distribution-plan --in SESSION --file PLAN.json --out SESSION
- import-csv --in SESSION --file INPUT.csv --kind FAMILY --side source|returned --available-at ISO --out SESSION [--mapping MAPPING.json] [--at ISO]
- select --in SESSION --kind FAMILY --side SIDE --extract EXTRACT_ID --out SESSION
- source-selection --in SESSION --side SIDE --out SELECTION.json
- crosswalk --in SESSION --kind FAMILY --file MAPPINGS.csv --out SESSION
- match-ids --in SESSION --kind FAMILY --out SESSION

PLAN.json contains only fields from config.distribution. Keep expected_counts for all 39 families, explicit source_population_complete and population_complete, expected_members, source cutoff, operator and physical period. The ordinary browser plan edits the same structure. A crosswalk CSV has source_id,target_id columns.

## Original documents

- add-document --in SESSION --file ORIGINAL --available-at ISO --out SESSION [--type MIME] [--notes TEXT] [--at ISO]
- link-document --in SESSION --side SIDE --kind FAMILY --record RECORD_ID --document DOCUMENT_ID --available-at ISO --out SESSION
- unlink-document --in SESSION --side SIDE --kind FAMILY --record RECORD_ID --document DOCUMENT_ID --out SESSION
- document-availability --in SESSION --document DOCUMENT_ID --digest ORIGINAL_SHA256 --metadata-digest CURRENT_METADATA_SHA256 --available-at ISO --reason TEXT --out SESSION

Original bytes are retained without text conversion. An availability correction binds both original bytes and the exact previous metadata. Inspect the current study before preparing that correction.

## Source-bound editing

    node native/distribution-desk.cjs prepare-record --in study.json --kind order_lines --side returned --index 0 --out prepared.json

Edit the complete value in prepared.json while preserving study_id and expected_extract_id. Omit --index to prepare a new row. Unmapped fields remain null until explicitly mapped.

    node native/distribution-desk.cjs record --in study.json --file prepared.json --reason "Exact corrected original" --at 2026-10-15T17:00:00Z --out corrected.json

For lot_state_inputs, decision_inputs, certificate_reviews or decision_reviews, prepare the record, enter its original parent IDs, and run:

    node native/distribution-desk.cjs bind-record --in study.json --file prepared.json --out bound.json

The helper fills the exact current source, document or complete decision-basis hash. The record command separately commits that prepared observation. A different study or changed selected extract rejects the operation.

## Review and recovery

- review --in SESSION --digest CURRENT_STUDY_SHA256 --role qa|operations --reviewer NAME --decision accepted|revise --out SESSION [--at ISO] [--notes TEXT]
- import-session --in SESSION --file INCOMING_SESSION_OR_STUDY --out SESSION
- restore-edition --in SESSION --index HISTORY_INDEX --out SESSION
- open-branch --in SESSION --hash RETAINED_BRANCH_HASH --out SESSION

inspect supplies the current study digest and full analysis. Configured review roles may differ when the operator explicitly records them. Session files preserve unfinished forms, retained editions, branch history and source-byte identity.

## Complete delivery

- export --in SESSION --out STUDY.zip
- export-directory --in SESSION --out NEW_DIRECTORY
- build-html --out Distribution_Lot_and_Order_Study_Desk.html
- source-zip --out Distribution_Lot_and_Order_Study_Desk_source.zip

build-html and source-zip verify every member against SOURCE_MANIFEST.json. Building from the same complete members reproduces the same HTML regardless of input member order. The study export contains the full editable session, historical editions, originals, canonical data and readable operational reports.
