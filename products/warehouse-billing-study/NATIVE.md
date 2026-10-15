# Native operator — Node 18+

Use the complete unpacked source directory. There are no package downloads or external runtime dependencies.

```sh
node native/billing-desk.cjs new --label "September warehouse study" --out work/new.json
node native/billing-desk.cjs course --kind corrected --out work/example.json
node native/billing-desk.cjs inspect --in work/example.json
node native/billing-desk.cjs export --in work/example.json --out work/example.zip
node native/billing-desk.cjs export-directory --in work/example.json --out work/example-files
node native/billing-desk.cjs build-html --out work/desk.html
node native/billing-desk.cjs source-zip --out work/source.zip
```

Every output path is new or already contains exactly the requested bytes. Different existing files are refused. Native commands preserve complete session drafts, history and branches; they use the same domain and session modules as the browser.

## Intake and state changes

import-csv requires --in, --kind, --side, --file, --available-at and --out. Optional --mapping is a JSON object from every canonical field to an actual source column or an empty string for unobserved fields. Optional --at records capture time.

import-activity requires --in, --file containing the complete import options, --csv pointing to the exact original CSV, and --out. The options are study_id, expected_sha256 (current complete study digest), source_id, month, warehouse_id, available_at, at, complete_month (boolean) and expected_import_id (empty only for first source/month import). The native command supplies name and content from --csv. Use the current selected source/month head; stale bindings are refused.

billing-plan takes --file containing only actual plan fields and merges them into the current plan. record takes --file with kind, side, row_index (null for new), and a complete canonical value object, plus --reason and --at. A correction retains its exact preimage.

select takes --kind, --side and --extract. crosswalk takes --kind and a two-column source_id,target_id CSV. match-ids adds only unique identical IDs and retains earlier explicit maps. set-config edits label, data_class, source_scope, returned_scope or authority_notes using --field and --value.

## Originals and review

add-document takes --file, optional --type/--notes/--available-at and --out. link-document takes --kind, --side, --record, --document and --available-at. unlink-document removes only that explicit link and retains its bytes/history.

document-availability requires --document, --digest of exact bytes, --metadata-digest of the complete current document record, --available-at, --reason and --at. It retains the previous metadata and refuses a stale draft.

review requires --digest of the complete current study, --role, --reviewer, --decision accepted or revise, optional --notes and --at. All configured roles must review the same current edition. import-session, restore-edition and open-branch preserve the previous complete state; see the command help and session recovery index for identities.

## Reproduce the source course

```sh
node operator/run-course.cjs
```

The runner executes the complete maintained domain, generated-handler and native-command courses. Generated handler/CLI courses inject browser and filesystem services to exercise the source in-process. RECEIVING.md describes the separate real browser and OS course.

The native build reads SOURCE_MANIFEST.json once, verifies each complete source member, and embeds that same captured manifest text. Renderer input order is canonical, so the source ZIP, normal build and direct renderer produce the same HTML.
