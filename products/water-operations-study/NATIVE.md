# Native command-line operation

Use Node.js 18 or later. Run commands from the complete source directory. No network connection or credentials are needed. Native commands preserve complete sessions, including ordinary editor drafts and retained branches.

Every output path must be new or already contain the exact same bytes. A command refuses to overwrite a different file. It writes a temporary file exclusively and publishes with a same-directory hard link. Use a filesystem that supports that operation.

```sh
node native/water-desk.cjs new --out empty-session.json
node native/water-desk.cjs course --kind complete --out authored-session.json
node native/water-desk.cjs inspect --in authored-session.json
node native/water-desk.cjs import-csv --in empty-session.json --kind systems --side source --file supplied-systems.csv --available-at 2026-10-15T09:00:00Z --out imported-session.json
node native/water-desk.cjs water-plan --in imported-session.json --file actual-plan.json --out planned-session.json
node native/water-desk.cjs prepare-record --in authored-session.json --kind field_readings --side returned --index 0 --out pending-reading.json
node native/water-desk.cjs record --in authored-session.json --file pending-reading.json --reason "Actual source correction" --out corrected-session.json
node native/water-desk.cjs export --in authored-session.json --out authored-export.zip
node native/water-desk.cjs export-directory --in authored-session.json --out authored-export
node native/water-desk.cjs build-html --out Water_Operations_Study_Desk.html
node native/water-desk.cjs source-zip --out complete-source.zip
```

Edit the prepared JSON with actual source values. Preserve study_id and expected_extract_id, including null when preparing a new table. The record command rejects a correction prepared against another study or selected extract. It retains the input and writes no successor on rejection.

water-plan accepts only current config.water fields. Use the complete declared source counts, window, methods and phases from the actual study. It does not generate schedules or regulatory requirements.

Other commands: set-config, select, crosswalk, match-ids, add-document, link-document, unlink-document, document-availability, review, import-session, restore-edition, open-branch and source-selection. Run without a command for the complete list.

Supporting originals are read as binary bytes. CSV and source files use strict UTF-8 decoding with BOM preservation. The build and source-zip commands capture SOURCE_MANIFEST.json once, verify its listed source bodies and emit that same captured manifest. The HTML renderer sorts the complete source list, so caller ordering cannot change the generated file.

Run `node verify.cjs` for the maintained source courses. The injected native receiving course executes this actual command source against explicit filesystem services. Real operating-system and browser receiving is a separate step described in RECEIVING.md.
