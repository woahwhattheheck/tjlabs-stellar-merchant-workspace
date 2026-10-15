# Native command line

Use Node 18 or later in the extracted source directory. Commands create a new output and refuse to overwrite a different existing file. Retained source files are verified against SOURCE_MANIFEST.json before application/source delivery.

```sh
node native/harvest-desk.cjs new --label "Grower study" --out study.json
node native/harvest-desk.cjs course --kind complete --out authored-session.json
node native/harvest-desk.cjs inspect --in authored-session.json
node native/harvest-desk.cjs build-html --out Harvest_Outcome_Study_Desk.html
node native/harvest-desk.cjs source-zip --out Harvest_Outcome_Study_Source.zip
node native/harvest-desk.cjs export --in authored-session.json --out full-study.zip
node native/harvest-desk.cjs export-directory --in authored-session.json --out full-study
```

Import a literal source file with import-csv --in SESSION --kind FAMILY --side source|returned --file FILE --available-at UTC --out NEW_SESSION. Supply --mapping JSON_FILE for explicit header mapping. select chooses an existing exact extract. match-ids adds only unique identical identities; crosswalk imports source_id,target_id pairs.

harvest-plan --in SESSION --file PLAN_JSON --out NEW_SESSION changes only known plan fields. source-selection writes the exact selected source IDs. prepare-record --in SESSION --kind FAMILY --side returned --index N --out DRAFT_JSON retains the study and expected extract identity. Omit --index for a new row. record --in SESSION --file DRAFT_JSON --reason ACTUAL_REASON --at UTC --out NEW_SESSION rejects a stale selected source edition.

add-document retains arbitrary original binary bytes and original availability. link-document, unlink-document and document-availability retain exact record/document identity and earlier editions. review requires the current study digest, role, named reviewer, actual decision and time. import-session, restore-edition and open-branch retain complete predecessor sessions and unfinished forms.

All 28 templates are in templates/. examples/complete.study.json and examples/complete.session.json retain the reproducible complete authored case. The existing browser application provides interactive source-binding helpers; the native record command accepts the same exact canonical rows.
