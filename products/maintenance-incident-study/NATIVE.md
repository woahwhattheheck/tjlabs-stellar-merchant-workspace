# Native command guide

Requires Node.js 18 or later. No npm dependency installation is needed. The complete source manifest must accompany the source tree.

Run:

```sh
node native/maintenance-desk.cjs
node operator/run-course.cjs
node native/maintenance-desk.cjs course --kind corrected --out work/course.json
node native/maintenance-desk.cjs inspect --in work/course.json
node native/maintenance-desk.cjs export-directory --in work/course.json --out work/exported
node native/maintenance-desk.cjs build-html --out work/Maintenance_Incident_Knowledge_Study_Desk.html
```

Use new output paths for changed results. Each output is written through an exclusive temporary file and final hard link. An existing byte-identical output is accepted; a different existing file is preserved with an error. Directory exports require a new directory; if interrupted, retain that partial directory and choose a new output directory.

## Whole-session operations

- `new --label "Plant maintenance study" --out work/new.json`
- `course --kind first|corrected --out work/course.json`
- `inspect --in work/session.json`
- `set-config --in ... --field label|data_class|source_scope|returned_scope|authority_notes --value "..." --out ...`
- `import-session --in current.json --file incoming.json --out successor.json`
- `restore-edition --in ... --index 0 --out ...`
- `open-branch --in ... --hash FULL_RETAINED_BRANCH_HASH --out ...`

The native path loads and preserves full ordinary sessions, including unfinished browser forms and retained history/branches. A plain study can also be imported into a new complete session. Emergency recovery envelopes containing memory-only forms are opened in the browser, where staged adoption and pending-input controls are available; they are not silently reduced to a study by the CLI.

## Exact source intake

`import-csv --in ... --kind incidents --side source --file original.csv --available-at 2026-10-14T18:00:00Z --out ...`

Optional `--mapping mapping.json` supplies a complete canonical-field-to-original-column object; blank maps an unavailable field. Without it, exact canonical header names are matched. Optional `--at` records actual desk capture time; availability remains a distinct required source instant.

`select --in ... --kind incidents --side returned --extract EXACT_EXTRACT_ID --out ...`

`crosswalk --in ... --kind incidents --file pairs.csv --out ...`

The crosswalk CSV requires source_id,target_id columns. `match-ids --in ... --kind incidents --out ...` adds only unique exact IDs and keeps previous explicit mappings.

## Originals and source availability

`add-document --in ... --file report.pdf --type application/pdf --available-at 2026-10-12T10:00:00Z --notes "Authorised source report" --out ...`

The actual capture time defaults to now; optional `--at` supplies it explicitly. Original bytes remain exact. Inspect the resulting document ID and SHA.

`link-document --in ... --side returned --kind diagnoses --record D1 --document DOCUMENT_ID --available-at 2026-10-12T10:00:00Z --out ...`

`unlink-document --in ... --side returned --kind diagnoses --record D1 --document DOCUMENT_ID --out ...`

`document-availability --in ... --document DOCUMENT_ID --digest DOCUMENT_BYTE_SHA --metadata-digest EXACT_CURRENT_DOCUMENT_METADATA_SHA --available-at 2026-10-12T09:55:00Z --reason "Source archive timestamp and locator" --out ...`

The metadata digest is `require('./core.cjs').hash(document)` for the complete current document object. This and the byte digest prevent an old correction from overwriting a new metadata edition. Prior source availability and reason remain in the document's retained history.

## Plan, record corrections and review

`maintenance-plan --in ... --file plan-fields.json --out ...`

The JSON object patches only known plan fields. Full plan fields are in DOMAIN_CONTRACT.md; the browser provides normal editing controls.

`record --in ... --file row-correction.json --reason "Actual source correction and locator" --at 2026-10-15T06:00:00Z --out ...`

The correction object is `{kind,side,row_index,value}`. A null row_index appends a new observed row. Value is the complete canonical row; an unmapped field stays null until an explicit source mapping observes it. The predecessor, before-value/source line and reason remain retained. The new derived edition is available at the actual correction time.

`review --in ... --digest COMPLETE_STUDY_SHA --role source_review --reviewer "Actual named reviewer" --decision accepted --notes "Actual review findings" --out ...`

Inspect the current comparison digest first. Each configured role binds that exact complete study. Repeat with maintenance_lead or the actual configured role. A later input/plan/source change makes old acceptance historical.

## Outputs

- `export --in ... --out complete-working.zip`: complete working session, readable reports, originals, selected CSVs and history.
- `export-directory --in ... --out new-directory`: the same complete working output as normal files.
- `build-html --out Maintenance_Incident_Knowledge_Study_Desk.html`: rebuilds the full offline application from manifest-verified source.
- `source-zip --out complete-source.zip`: exports the complete maintained dependency/source closure.

## Receiving and validation

The retained verification results distinguish maintained model execution, generated HTML handlers with injected DOM/IndexedDB services, and actual CLI source with injected filesystem/path/crypto services. The provided runner supports actual Node receiving. RECEIVING.md supplies the rendered-browser/OS course for the same complete package.

## Exact knowledge digest

`knowledge-digest --in work/session.json --side returned --id K1`

This read-only command returns the complete selected knowledge edition, its exact text digest and its edition/document digest. Retain the actual source review in knowledge_reviews; computing a digest does not create or infer approval. The browser supplies ordinary controls for the same preparation.
