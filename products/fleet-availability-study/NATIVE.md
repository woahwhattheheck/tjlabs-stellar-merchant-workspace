# Native operating guide

Use a local Node runtime and the complete maintained source directory. Every command receives options as `--key value`. Each output must be a new path or already contain identical bytes.

```sh
node native/fleet-desk.cjs course --kind complete --out course-session.json
node native/fleet-desk.cjs inspect --in course-session.json
node native/fleet-desk.cjs export --in course-session.json --out complete-study.zip
node native/fleet-desk.cjs build-html --out Fleet_Availability_Study_Desk.html
node native/fleet-desk.cjs source-zip --out fleet-maintained-source.zip
```

## Complete workflow

| Command | Required inputs and outcome |
| --- | --- |
| new | --out; optional --label. Creates an empty full session. |
| course | --kind complete --out. Opens the fictional complete operating course. |
| inspect | --in. Prints the full actual source comparison and fleet analysis. |
| set-config | --in --field --value --out. Updates label, source class, source/returned scope or authority notes. |
| fleet-plan | --in --file --out. Reads the complete fleet plan object from JSON. |
| import-csv | --in --file --kind --side --available-at --out; optional --mapping JSON. Retains original bytes and explicit canonical mapping. |
| select | --in --kind --side --extract --out. Selects an exact retained extract. |
| crosswalk | --in --kind --file --out. Imports CSV with source_id and target_id. |
| match-ids | --in --kind --out. Adds unambiguous exact-ID mappings. |
| add-document | --in --file --available-at --out; optional --type, --notes. Retains arbitrary original bytes. |
| link-document | --in --side --kind --record --document --available-at --out; optional --notes. Links one retained exact original to its typed source record. |
| unlink-document | --in --side --kind --record --document --out. Removes one exact link, retaining the original and history. |
| document-availability | --in --document --digest --metadata-digest --available-at --reason --out. Records the sourced availability correction against exact byte and metadata hashes. |
| prepare-record | --in --kind --side --out; optional --index. Creates the complete source-edition-bound editable record. |
| bind-record | --in --file --out. Fills the exact row hash for a release input or complete basis hash for a release review. |
| record | --in --file --reason --out; optional --at. Records the prepared correction and retains the prior study. |
| review | --in --digest --role --reviewer --decision --out; optional --at, --notes. Records source-bound study review. |
| import-session | --in --file --out. Retains both complete sessions and unfinished forms. |
| restore-edition | --in --index --out. Restores a retained prior study while preserving complete history. |
| open-branch | --in --hash --out. Opens one retained complete competing branch. |
| export | --in --out. Writes the complete session, originals and readable analysis as ZIP. |
| export-directory | --in --out. Writes the same complete members to a new directory. |
| build-html | --out. Verifies every source-manifest member and builds the offline application. |
| source-zip | --out. Exports every maintained source member and exact manifest. |

The CLI uses the same source model and domain engine as the browser app. Complete source history and unfinished forms are preserved across command changes. Review digest binds the whole current study. Field mappings cannot silently convert unobserved cells into known empty strings.
