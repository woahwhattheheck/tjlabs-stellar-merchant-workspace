# Offline native study commands

The offline study CLI uses Node 18 or later and no provider credential. The separate connected runner requires Linux Node 20 or later and util-linux flock; see native/README.md.

```sh
node native/restaurant-desk.cjs new --label "Restaurant integration study" --out study.json
node native/restaurant-desk.cjs course --kind complete --out authored-session.json
node native/restaurant-desk.cjs inspect --in authored-session.json
node native/restaurant-desk.cjs export --in authored-session.json --out complete-study.zip
node native/restaurant-desk.cjs export-directory --in authored-session.json --out complete-study
node native/restaurant-desk.cjs build-html --out Restaurant_Integration_Study_Desk.html
node native/restaurant-desk.cjs source-zip --out complete-application-source.zip
```

Other complete commands are set-config, import-csv, select, crosswalk, match-ids, add-document, link-document, unlink-document, document-availability, restaurant-plan, prepare-record, record, source-selection, review, import-session, restore-edition and open-branch. Run the CLI without a command for the command list.

CSV import takes --kind, --side, --file, --available-at, optional --mapping JSON and --at. Mapping keys must include every current canonical column; missing source columns map to an empty mapping string and remain unobserved. The original is retained in full.

Prepare-record writes the complete actual row plus study_id and expected_extract_id. Record requires those exact bindings, --reason and a new --out. A row index from an earlier selected extract cannot overwrite a later row.

```sh
node native/restaurant-desk.cjs prepare-record --in study.json --kind places --side returned --index 0 --out correction.json
node native/restaurant-desk.cjs record --in study.json --file correction.json --reason "Actual source correction" --out corrected-session.json
node native/restaurant-desk.cjs import-journal --in study.json --file provider-export.json --actor OPERATOR_ID --available-at 2026-10-15T12:00:00Z --out with-provider-originals.json
```

Prepare-request accepts the complete form object produced by request-form.cjs and checks its exact study digest before generating a native operation. Normal users can use the ordinary browser request form.

All output paths are exclusive. An identical output may be reused, but different existing bytes are refused. Whole-session input retains unfinished drafts and recovery branches. Source HTML rebuilding captures one manifest text, validates its members and uses canonical path ordering.
