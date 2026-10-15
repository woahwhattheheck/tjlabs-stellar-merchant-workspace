# Native commands — Node 18+

Extract the complete source ZIP. Run commands from its root. No package installation or network dependency is required. Each mutating command writes a new complete session with all browser drafts and retained branches. Choose a new output path; an existing identical file is accepted, and an existing different file is preserved.

## Open an example and inspect

    node native/onboarding-desk.cjs course --kind first --out first.session.json
    node native/onboarding-desk.cjs inspect --in first.session.json
    node native/onboarding-desk.cjs course --kind corrected --out corrected.session.json

## Create a study and import a source

    node native/onboarding-desk.cjs new --label "Authorised service-week transfer" --out empty.session.json
    node native/onboarding-desk.cjs set-config --in empty.session.json --field source_scope --value "Authorised source population and extraction date" --out scoped.session.json
    node native/onboarding-desk.cjs import-csv --in scoped.session.json --kind customers --side source --file customers.csv --out customers.session.json

Without --mapping, the importer selects exact same-named canonical columns; other columns remain unobserved. For an arbitrary export, create a JSON object mapping every canonical field to the chosen original header, with "" for unobserved fields, and pass --mapping mapping.json. The browser produces this mapping through ordinary controls.

Allowed kinds: customers, facilities, assets, approved_pm, workorders, events, reports, billing.
Allowed sides: source, returned.

## Choose an edition and map identities

    node native/onboarding-desk.cjs select --in customers.session.json --kind customers --side source --extract extract-ID --out selected.session.json
    node native/onboarding-desk.cjs crosswalk --in selected.session.json --kind customers --file customer-crosswalk.csv --out mapped.session.json
    node native/onboarding-desk.cjs match-ids --in mapped.session.json --kind assets --out exact-pairs.session.json

The crosswalk CSV requires source_id,target_id columns. Pairing exact same IDs is explicit and only adds unique unused counterparts.

## Retain and link report bytes

    node native/onboarding-desk.cjs add-document --in mapped.session.json --file approved-report.pdf --type application/pdf --notes "Original authorised report" --out document.session.json
    node native/onboarding-desk.cjs inspect --in document.session.json
    node native/onboarding-desk.cjs link-document --in document.session.json --side source --report REPORT-ID --document document-ID --out linked.session.json

Use the exact document ID from the saved study. The command reads binary bytes without decoding them as text. To correct a mistaken relationship, use unlink-document with the same --side, --report and --document arguments and a new --out. It removes only that explicit current link; the exact document and previous edition remain.

## Review the actual selected digest

    node native/onboarding-desk.cjs inspect --in linked.session.json
    node native/onboarding-desk.cjs review --in linked.session.json --digest ACTUAL-STUDY-SHA256 --reviewer "Named onboarding owner" --decision revise --notes "Correct the returned report relationship" --out reviewed.session.json

The digest is required. A stale digest fails without producing an applied successor. Decisions are accepted or revise; --at accepts an explicit real UTC timestamp.

## Complete replacement, migration and recovery

    node native/onboarding-desk.cjs import-session --in reviewed.session.json --file another.session.json --out combined.session.json
    node native/onboarding-desk.cjs migrate-v1 --file previous-v1.session.json --out migrated.session.json
    node native/onboarding-desk.cjs restore-edition --in combined.session.json --index 0 --out restored.session.json
    node native/onboarding-desk.cjs open-branch --in combined.session.json --hash RETAINED-BRANCH-HASH --out branch.session.json

The explicit v1 migration keeps the exact original JSON as a document, all prior studies/branches/forms and the old review hashes as historical. It does not mark added tables or fields as observed.

## Export ordinary files and rebuild the app

    node native/onboarding-desk.cjs export --in reviewed.session.json --out working-export.zip
    node native/onboarding-desk.cjs export-directory --in reviewed.session.json --out working-export
    node native/onboarding-desk.cjs build-html --out rebuilt-desk.html
    node native/onboarding-desk.cjs source-zip --out source-copy.zip

A directory export requires a new directory and creates each final file through an exclusive temporary file and hard link. If interrupted, the partial directory remains for inspection; export to another new directory to complete a fresh copy. The ZIP command writes a complete archive atomically at its final file name. The source builder verifies every source member against SOURCE_MANIFEST.json.

## Reproduce the maintained source courses

    node -e "console.log(JSON.stringify(require('./operator/complete-course.cjs')(),null,2))"

The browser-handler and native-command courses also ship as source-owned functions. They accept the complete source member list and exercise the actual entrypoints with injected DOM/IndexedDB or filesystem services. Actual OS and rendered-browser receiving is described separately in RECEIVING.md.
