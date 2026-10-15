# Native command-line workflow

Requires Node.js 18 or later. Run from the extracted complete source directory. There are no package-install or network steps. Every output command creates a new file and refuses to overwrite a different existing file.

```sh
node native/procurement-desk.cjs help
node native/procurement-desk.cjs new --label "October procurement reconciliation" --out study-01.json
node native/procurement-desk.cjs course --kind complete --out course-01.json
node native/procurement-desk.cjs inspect --in course-01.json
```

## Configuration and original source

```sh
node native/procurement-desk.cjs set-config --in study-01.json --field source_scope --value "Complete approved tracker and AP source boundary" --out study-02.json
node native/procurement-desk.cjs procurement-plan --in study-02.json --file plan.json --out study-03.json
node native/procurement-desk.cjs import-csv --in study-03.json --kind spend_lines --side source --file original-ap.csv --mapping ap-mapping.json --available-at 2026-10-15T09:00:00Z --out study-04.json
```

plan.json is a partial object using actual keys from config.procurement: side, as_of, population_start, population_end, operator_id, site_id, population_key, population_complete, expected_members, source_population_complete, expected_counts, required_review_roles, required_effort_phases, baseline_method, current_method and notes. Unknown keys are rejected. Use distinct work method names and actual declared counts.

A mapping JSON defines every canonical field as an exact source-column name or an empty string for unobserved. Without --mapping, exact same-name headers are mapped and other fields remain unobserved. The id field requires a source column. --at optionally supplies capture time; --available-at is required for CSV edition availability.

select requires --kind, --side and --extract. source-selection writes the selected extract IDs for one side. crosswalk requires --kind and a CSV with source_id,target_id. match-ids adds unique exact-ID pairs while retaining existing explicit choices.

## Original document bytes

```sh
node native/procurement-desk.cjs add-document --in study-04.json --file original-contract.pdf --type application/pdf --available-at 2026-09-01T12:00:00Z --out study-05.json
node native/procurement-desk.cjs link-document --in study-05.json --side source --kind commercial_terms --record TERM-V1 --document DOCUMENT-ID --available-at 2026-09-01T12:00:00Z --out study-06.json
```

Use the actual returned document ID from inspect; filenames are not identities. document-availability requires --document, --digest, --metadata-digest, --available-at and --reason and checks the exact current bytes and metadata before retaining a corrected availability. unlink-document requires the same exact side/kind/record/document tuple.

## Observed records and exact bindings

```sh
node native/procurement-desk.cjs prepare-record --in study-06.json --kind calculation_inputs --side returned --out pending-input.json
node native/procurement-desk.cjs bind-record --in study-06.json --file pending-input.json --out bound-input.json
node native/procurement-desk.cjs record --in study-06.json --file bound-input.json --reason "Retained original input used in the dated calculation" --at 2026-10-15T10:00:00Z --out study-07.json
```

Edit the complete pending value object with actual source fields before bind-record. prepare-record without --index prepares a new observed row; --index selects a zero-based existing row for a sourced correction. Both retain study_id and expected_extract_id. A changed selected edition is rejected.

Binding helpers apply to baseline_inputs, mapping_inputs and calculation_inputs; baseline_reviews; mapping_reviews; submissions; and finance_reviews. The helper copies the exact current supplied source binding into a pending record. Actual names, dates, decisions and amounts remain original observations.

## Whole-study review

```sh
node native/procurement-desk.cjs review --in study-07.json --digest EXACT-CURRENT-STUDY-SHA256 --role procurement --reviewer "Actual named reviewer" --decision accepted --notes "Actual review findings" --out study-08.json
```

Take the exact current digest from inspect. Repeat for the configured Finance role using the current study edition. Review records themselves do not change the edition digest. A review against changed source state is rejected. Business baseline/mapping/Finance decisions remain canonical source records, separate from this whole-study review.

## Complete export, recovery and application build

```sh
node native/procurement-desk.cjs export --in study-08.json --out complete-study.zip
node native/procurement-desk.cjs export-directory --in study-08.json --out complete-study-directory
node native/procurement-desk.cjs build-html --out Procurement_Savings_Reconciliation_Study_Desk.html
node native/procurement-desk.cjs source-zip --out procurement-complete-source.zip
```

The complete export contains session, current study, report, comparison, selected editable tables, original text, document bytes/index/links, availability manifest, domain reports and recovery index. Complete retained branches and unfinished forms are in session.json.

import-session combines the supplied complete session or study with retained preimages. restore-edition requires a zero-based --index from session history. open-branch requires the exact --hash from retained branches. Each uses --in and a new --out.

Application builds verify every member against SOURCE_MANIFEST.json. Source order is sorted before the compressed offline HTML is produced. The embedded source remains complete; compression changes its transport, not its contents.
