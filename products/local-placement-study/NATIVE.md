# Native command guide

Use Node 18 or newer. The application has no runtime package dependencies and makes no network request. Run commands from the expanded source directory. Save each successor to a new path; a different existing output is refused. Complete sessions include unfinished browser forms, review history, originals and retained branches.

## Create, import and inspect

```sh
node native/placement-desk.cjs new --label "Actual placement trial" --out work/empty.json
node native/placement-desk.cjs course --kind complete --out work/authored.json
node native/placement-desk.cjs inspect --in work/authored.json
node native/placement-desk.cjs import-csv --in work/empty.json --kind organisations --side source --file supplied/organisations.csv --available-at 2026-10-12T08:00:00Z --out work/source-organisations.json

```

import-csv maps exact canonical headings automatically where present. For other headings, use --mapping mapping.json, an object containing every canonical field with the actual original column name or an empty string for unobserved optional fields. The id mapping must identify a real original column. Preserve the mapping and the original together. --available-at is source-edition availability, separate from actual application capture.

The exact25 input contracts are in DOMAIN_HEADERS.json and templates/. A selected source/returned pair is not a guessed external API.

## Source selection and identities

```sh
node native/placement-desk.cjs select --in work/source-organisations.json --kind organisations --side source --extract extract-ACTUAL_ID --out work/selected.json
node native/placement-desk.cjs match-ids --in work/selected.json --kind organisations --out work/matched.json
node native/placement-desk.cjs crosswalk --in work/matched.json --kind organisations --file supplied/organisation-map.csv --out work/mapped.json

```

The map CSV must have source_id and target_id headers. Use exact actual IDs from inspect. Unique exact-ID matching keeps existing maps; it does not resolve ambiguous or aliased names.

## Actual documents and chronology

```sh
node native/placement-desk.cjs add-document --in work/authored.json --file supplied/agreement.pdf --type application/pdf --available-at 2026-10-01T00:00:00Z --notes "Actual signed original" --out work/with-document.json
node native/placement-desk.cjs inspect --in work/with-document.json
node native/placement-desk.cjs link-document --in work/with-document.json --side returned --kind host_agreements --record ACTUAL_AGREEMENT_ID --document ACTUAL_DOCUMENT_ID --available-at 2026-10-01T00:00:00Z --out work/linked.json

```

document-availability requires --document, --digest, --metadata-digest, --available-at and --reason. The exact content SHA and current metadata hash bind the selected original. Use Core.hash(document) from the maintained core for the metadata value. A stale correction is refused. --at controls the study correction record time; it never substitutes for unknown source availability.

unlink-document uses the same side/kind/record/document identity. It removes the current link while retaining the original bytes and prior whole study.

## Plan and ordinary observed records

```sh
node native/placement-desk.cjs placement-plan --in work/authored.json --file supplied/actual-plan.json --out work/planned.json
node native/placement-desk.cjs record --in work/planned.json --file supplied/actual-record.json --reason "Source-backed correction" --at 2026-10-15T09:00:00Z --out work/corrected.json

```

The plan JSON contains only declared config.placement keys. Inspect the complete current plan or use Placement.empty() from placement.cjs for its shape. It includes actual as-of and population window, whole inventory, provider/campaign/format scope, approval/review roles, recurring phases/methods and currency_precision.

The record JSON contains kind, side, row_index and value. row_index is null for a new observation or the exact current row index for a correction. value contains every canonical field; unmapped fields remain null and cannot be converted silently into observed blanks. Preserve reason and source timestamps. The command creates a later retained extract with original before/after context.

set-config changes one ordinary top-level field: label, data_class, source_scope, returned_scope or authority_notes, using --field and --value.

## Exact review and complete recovery

```sh
node native/placement-desk.cjs inspect --in work/corrected.json
node native/placement-desk.cjs review --in work/corrected.json --digest ACTUAL_CURRENT_STUDY_SHA --role operations --reviewer "Actual reviewer" --decision accepted --notes "Actual findings" --out work/operations-reviewed.json
node native/placement-desk.cjs review --in work/operations-reviewed.json --digest ACTUAL_CURRENT_STUDY_SHA --role finance --reviewer "Actual finance reviewer" --decision accepted --out work/reviewed.json

```

The digest is the exact current whole study digest from inspect. A review for a different edition is refused. Earlier decisions remain historical.

import-session with --in current.json --file incoming.json --out successor.json retains the current complete branch before opening the validated incoming study/session. restore-edition takes --index from the history. open-branch takes --hash from the retained branch list. Complete sessions preserve browser drafts as well as applied domain data.

## Complete exports and reproducible build

```sh
node native/placement-desk.cjs export --in work/reviewed.json --out delivery/working-export.zip
node native/placement-desk.cjs export-directory --in work/reviewed.json --out delivery/working-export
node native/placement-desk.cjs build-html --out delivery/Local_Placement_Study_Desk.html
node native/placement-desk.cjs source-zip --out delivery/application-source.zip
node operator/run-course.cjs

```

Exports contain the complete editable session, study, comparison, placement report/results, canonical selected CSVs, explicit column availability, original text/files, document links and retained history. Application source exports include the whole declared dependency closure and manifest.

The native source builder reads the manifest once, verifies every original source member and emits that same captured manifest. Renderer source order is canonical, so ordinary and reversed member order yield the same HTML. Writes use a separate exclusive partial file and a hard-link selection; a different existing destination is never overwritten. If an earlier interruption left a partial file, retain it for investigation and choose a new output path.

operator/run-course.cjs runs the maintained authored domain, generated-handler and native-command-source courses. The injected-service courses remain explicitly distinct from an actual rendered-browser/OS receiving run.
