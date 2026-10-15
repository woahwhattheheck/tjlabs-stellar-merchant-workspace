# Native command line

Use Node.js 18 or later. The maintained sources use the standard Node library and the included modules; there are no network calls or package installation steps.

Run commands from the extracted package directory. Every command that changes a session writes a new output path. If that path already contains different bytes, the command refuses to replace it. Identical output is idempotent. Each write uses an exclusive temporary file and a hard link into the final path.

## Complete course and real work

~~~sh
node native/construction-desk.cjs new --label "Actual site study" --out work/new.json
node native/construction-desk.cjs course --kind complete --out work/authored.json
node native/construction-desk.cjs inspect --in work/authored.json
node operator/run-course.cjs
~~~

The course command loads authored records explicitly. Keep its source class separate from real operational input.

The native commands accept a complete session or a bare valid study. A full session preserves unfinished browser forms, retained history and branches. An emergency recovery envelope with pending input outside the session should first be opened and reconciled through the ordinary browser recovery route; it is not silently reduced to a bare study.

## Import exact originals

~~~sh
node native/construction-desk.cjs import-csv --in work/new.json --kind projects --side source --file actual/projects.csv --available-at 2026-10-15T09:00:00Z --out work/with-projects.json
~~~

Canonical headers map automatically where present. For a different original header set, provide --mapping mapping.json containing every canonical field mapped to an original column name or an empty string for unobserved. The family's actual ID field must be mapped.

Use --side returned for the independent returned extract. Repeat for the actual complete scope. select requires --kind, --side and --extract. match-ids requires --kind and creates only unique equal-ID mappings. crosswalk accepts --file with source_id,target_id columns.

## Record changes and plan

construction-plan accepts a JSON object containing actual plan fields and merges it into the current plan. Unknown fields are refused.

~~~sh
node native/construction-desk.cjs construction-plan --in work/authored.json --file actual/plan.json --out work/planned.json
~~~

record accepts a JSON object with study_id, expected_extract_id, kind, side, row_index and value. The study ID and selected extract ID must match the current input exactly; use expected_extract_id:null only when that table has no selected extract. A stale correction is refused before any output is written. value contains every canonical field. Use row_index:null to record a new source observation. Supply --reason and an actual --at UTC timestamp. Fields absent from the selected source mapping remain null; explicitly remap before adding a previously unobserved field.

set-config edits only label, data_class, source_scope, returned_scope and authority_notes through --field and --value.

## Documents, reviews and recovery

add-document accepts --file, --type, --available-at and optional --notes. It preserves arbitrary bytes and the original filename. link-document requires --side, --kind, --record, --document and --available-at. unlink-document removes only the selected link and retains the document bytes and previous study.

document-availability requires --document, --digest, --metadata-digest, --available-at and --reason. The expected content and full metadata hashes bind the correction to the actual current document. A stale correction is refused.

review requires --digest, --role, --reviewer and --decision accepted or revise. Optional --notes and --at are retained. Each named role signs only the exact current study.

import-session retains the selected session before adopting --file. restore-edition uses a current --index from the session history; open-branch uses the retained branch --hash.

## Complete export and build

~~~sh
node native/construction-desk.cjs export --in work/planned.json --out work/study.zip
node native/construction-desk.cjs export-directory --in work/planned.json --out work/study-files
node native/construction-desk.cjs build-html --out work/Construction_Progress_Study_Desk.html
node native/construction-desk.cjs source-zip --out work/application-source.zip
~~~

Choose a new directory for export-directory. The output includes the complete session, all original text and document bytes, selected CSVs and availability manifest, exact comparison, readable construction report and plan.

The source builder reads SOURCE_MANIFEST.json once, verifies each listed member and emits that same captured manifest. The renderer sorts paths, so native and ordinary source order produce the same offline HTML.

## Execution evidence

verification/native-course.json records execution of the actual maintained command source with injected filesystem, path and crypto services in V8. verification/browser-course.json records actual generated HTML handlers with injected DOM and IndexedDB services. RECEIVING.md provides the separate actual Node and rendered-browser operating course.
