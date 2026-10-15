# Native production-run receiving

Requires Node20+ and the complete application files selected by source-manifest.json. No dependencies, API keys, cloud account, OAuth registration or equipment connection are required. Use a private working directory. Every output destination is create-only and bound to the exact operation/source identity; retry the exact same command to resume. A conflicting existing file is preserved and rejected.

## Whole authored course

```sh
node native/production-cli.mjs demo --out received-demo
node native/production-cli.mjs course --out received-course
node native/production-cli.mjs receive --workspace received-demo/Production_Run_Workspace.json --out independently-received
```

The CLI verifies every maintained source manifest member before work. It writes the complete working record, full application source, every original, all frozen input/report/CSV editions, proposal/comparison/status records, then independently imports the written working record and checks each output byte before COMPLETE.json. It never substitutes a receipt for the full source.

For the measured full-size scenario:
```sh
node native/production-cli.mjs capacity --runs 12 --readings 1000 --out capacity-received
```
This retains the whole large workspace. Do not run it again merely to make an operator carrier if the exact retained workspace is already available. Native execution uses node:crypto SHA256 and Buffer/strict UTF-8; actual timings must be recorded from that host.

## Real manual source mapping

```sh
node native/production-cli.mjs blank --at 2026-10-15T00:00:00Z --title "Selected production flow" --out blank
node native/production-cli.mjs source --workspace blank/Production_Run_Workspace.json --file runs.csv --name runs.csv --type text/csv --at 2026-10-15T00:01:00Z --operation receive-runs --out runs-received
node native/production-cli.mjs inspect --workspace runs-received/Production_Run_Workspace.json --source-id RETAINED_ID --format csv --out runs-inspected
```

Repeat source intake for the selected runs/standards/stops/labor/output/charges originals. Copy the blank input to a private mapping file and select actual source IDs, CSV headers or JSON pointers. All times, units, standard versions, coverage declarations and cost meanings require the source owner's agreement. Inspect before freezing:

```sh
node native/production-cli.mjs analyse --workspace whole-input/Production_Run_Workspace.json --input mapping.json --out preview
node native/production-cli.mjs freeze --workspace whole-input/Production_Run_Workspace.json --input mapping.json --name "Received edition" --prepared-by "Named preparer" --note "Agreed source contract" --at 2026-10-15T00:10:00Z --operation freeze-1 --out frozen
```

Use a new source intake and a parent-linked edition for corrections. compare takes --left and --right frozen edition IDs. propose additionally takes --name, --prepared-by, --reason, --at, --operation. review takes --proposal, --comparison-sha, --discipline OPERATIONS or FINANCE, --decision approved or needs-work, --reviewer, --note, --at and --operation. The latest review for each role is retained. handoff exports full exact approved context; nativeApplication stays NOT_APPLIED.

## What to retain from a real receiving run

Retain the original Node version, exact command, source-manifest identity, original input bytes, stdout/stderr, COMPLETE.json and its complete enumerated files. Open the report HTML and inspect ordinary source/coverage findings. Reopen both blank and worked records in the actual browser operator when available, then download/reopen the complete editable working and full source. A V8 execution with an explicitly supplied in-memory filesystem adapter is useful source execution but must not be called an installed Node or actual disk/browser run.

## Partial files and retry

The maintained native writer owns a destination with an exact-source marker, writes private unique same-directory stages, fsyncs, then uses a create-only hard link. It never replaces a differing final. Unfinished owned stages do not poison the next exact attempt. Existing unrelated destinations and symlink paths are rejected. Complete-source verification runs before output creation. Keep partial directories for diagnosis.
