# Native operator — Node 18+

Use the complete source folder. No package installation or network dependency is required.

```sh
node native/quote-desk.cjs new --label "Field quote study" --out work/new.json
node native/quote-desk.cjs course --kind complete --out work/example.json
node native/quote-desk.cjs inspect --in work/example.json
node native/quote-desk.cjs export --in work/example.json --out work/example.zip
node native/quote-desk.cjs export-directory --in work/example.json --out work/example-files
node native/quote-desk.cjs build-html --out work/desk.html
node native/quote-desk.cjs source-zip --out work/source.zip
node operator/run-course.cjs
```

Outputs must be new or contain exactly the requested bytes. A different existing file is refused. Every state-changing command preserves complete session drafts, original records and recovery history.

## Source and selection commands

import-csv requires --in, --kind, --side, --file, --available-at and --out. Optional --mapping supplies a JSON map from every canonical field to an actual source column or empty string for unavailable fields. Optional --at records capture time.

select takes --kind, --side and --extract. crosswalk takes --kind and a source_id,target_id CSV file. match-ids adds unique identical-ID pairs without replacing existing maps.

record takes --file with kind, side, row_index (null for a new row) and the complete canonical value object, plus --reason and --at. It records a later sourced edition with the exact preceding row retained. quote-plan merges a --file containing only declared plan fields. set-config accepts --field and --value for label, data_class, source_scope, returned_scope or authority_notes.

## Originals and review

add-document preserves --file bytes with optional --type, --notes, --available-at and --at. link-document takes --kind, --side, --record, --document and --available-at. unlink-document removes only the exact typed link while retaining bytes and prior history.

document-availability requires --document, --digest of exact bytes, --metadata-digest of the complete current document object, --available-at, --reason and --at. A stale metadata binding is refused.

review takes --digest of the complete current study, --role, --reviewer, --decision accepted or revise, optional --notes and --at. This is a review of the study, not an operational quote approval or send.

import-session preserves an imported complete session or supplied study while retaining the previous session. restore-edition takes --index from session history. open-branch takes a retained branch --hash. Full session exports preserve unfinished browser forms.

## Build and reproduce

The source builder reads SOURCE_MANIFEST.json once, verifies every source member and embeds that same captured text. Renderer input order is canonical, so normal and reversed source-member lists produce identical standalone HTML.

operator/run-course.cjs executes the actual maintained model, generated HTML-handler and native-command courses. Browser and filesystem services in those in-process courses are injected. Record the separate actual OS and rendered-browser receiving course in RECEIVING.md when running on equipped hardware.
