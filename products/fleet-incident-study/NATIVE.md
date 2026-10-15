# Native commands — Node 18+

Extract the complete source tree. No package installation or external service is required. Run commands from its directory. Complete session JSON is accepted wherever --in is used; a bare study is wrapped in a complete session.

Every output is written to a new path. An already identical file is accepted; a different existing file is refused. Keep successive session filenames so the preceding checkpoint remains available.

## First complete course

```sh
node native/fleet-desk.cjs course --kind complete --out run/01-course.session.json
node native/fleet-desk.cjs inspect --in run/01-course.session.json
node native/fleet-desk.cjs export --in run/01-course.session.json --out run/01-study.zip
node native/fleet-desk.cjs export-directory --in run/01-course.session.json --out run/01-study
node native/fleet-desk.cjs build-html --out run/Fleet_Incident_Study_Desk.html
node native/fleet-desk.cjs source-zip --out run/application-source.zip
```

For real work, use new --label "Actual study name" --out run/01-empty.session.json.

## Bring in a family and select an edition

```sh
node native/fleet-desk.cjs import-csv --in run/01-empty.session.json --kind assets --side source --file actual/assets.csv --available-at 2026-10-12T08:00:00Z --out run/02-assets.session.json
```

Canonical headings map automatically when present. --mapping mapping.json supplies a canonical-field-to-source-heading object; an empty mapping value leaves that field unobserved. --label and --at may describe the import and actual acquisition instant. Original availability remains separately required.

select uses --kind, --side and --extract. crosswalk imports --file with source_id,target_id columns for --kind. match-ids adds unique exact-ID pairs without replacing existing mappings.

## Prepare and apply a correction

```sh
node native/fleet-desk.cjs prepare-record --in run/01-course.session.json --kind cost_entries --side returned --index 0 --out run/cost-correction.json
node native/fleet-desk.cjs record --in run/01-course.session.json --file run/cost-correction.json --reason "Actual source correction" --out run/02-corrected.session.json
```

Edit the complete value in the prepared request. It carries study_id, expected_extract_id, kind, side and row_index. If the selected source changed, prepare a new request; the old row index cannot overwrite a different source row. Omit --index to prepare a new row. Retain the original request and source when a correction is rejected.

source-selection --in SESSION --side returned --out selections.json emits the exact current family/extract map for historical source-selection fields. fleet-plan --in SESSION --file plan.json --out NEXT updates only actual plan keys. Inspect config.fleet in the complete session or use the ordinary plan form to prepare the values.

## Originals and reviews

add-document uses --file, optional --type and --notes, and the actual --available-at. link-document uses --side, --kind, --record, --document and --available-at. unlink-document removes that explicit link while preserving the bytes and prior study.

document-availability requires --document, --digest, --metadata-digest, --available-at and --reason. The expected metadata digest is Core.hash(currentDocument); the byte digest is the original document sha256. The ordinary form supplies these automatically.

review requires --digest (Core.digest(currentStudy)), --role, --reviewer, --decision accepted|revise, optional --notes and --at. It binds the current full study. Existing configured review roles are visible in config.fleet.required_review_roles.

## Full session recovery

import-session --in CURRENT --file SAVED --out NEXT retains the current complete session before selecting the imported one. restore-edition uses --index from session.history. open-branch uses --hash from retained backups. Pending forms and previous branches remain part of the portable session.

export includes complete session, source originals, documents, mapped CSVs, availability manifests, comparison and fleet results. build-html and source-zip verify source members against the same single captured SOURCE_MANIFEST.json. The renderer sorts source paths, so supplied file order does not change the HTML.

Run node operator/run-course.cjs to execute the maintained model, generated-handler and native-command courses. The generated-handler course supplies DOM/IndexedDB services; complete rendered-browser receiving is described separately in RECEIVING.md.
