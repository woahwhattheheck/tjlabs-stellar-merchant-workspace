# Native telemetry intake and receiving

Requires Node.js 20 or later. There are no third-party runtime dependencies. The native runtime uses node:crypto SHA-256, Buffer and TextEncoder/TextDecoder. The browser/source fallback has the same exact hash and UTF-8 contract, but its measured execution time is not native performance.

Materialize the full source package and its source-manifest.json before using the CLI. The CLI verifies all maintained source member identities and carries the complete package into each handoff. Keep original customer files in a private directory; there is no OAuth, network connection, control endpoint, dispatch or automatic upload.

## Begin with a blank workspace

node native/telemetry-cli.mjs blank --at 2026-10-15T00:00:00Z --title "Selected site / pod" --out /existing-parent/blank-workspace

The output includes Telemetry_Workspace.json, Selected_Input.json and Telemetry_Complete_Source.json. The blank input intentionally has no inferred site, point, unit or time window.

## Retain one complete source

node native/telemetry-cli.mjs source --workspace /existing-parent/blank-workspace/Telemetry_Workspace.json --file /private/export.csv --name export.csv --type text/csv --operation receive-export-1 --at 2026-10-15T00:01:00Z --out /existing-parent/received-export

Read Result.json for its sourceId. The complete original bytes are retained even if the source is not parseable UTF-8. Inspect CSV, TSV or a JSON array using the exact source identity:

node native/telemetry-cli.mjs inspect --workspace /existing-parent/received-export/Telemetry_Workspace.json --source-id SOURCE_ID --format csv --out /existing-parent/inspection

For JSON, also specify --array-pointer /rows (or the actual original array pointer). JSON mapping selectors are pointers relative to each row; CSV selectors are exact column headers. Duplicate JSON members and malformed tables are rejected; originals remain in the working archive.

## Preview and freeze an explicit mapping

Edit Selected_Input.json with the actual scope, point dictionary and source mappings described in docs/CONTRACT.md. Retain independent observation and prediction originals. A prediction model's calibration start/end, clock, identity and version are explicit. Run:

node native/telemetry-cli.mjs analyse --workspace /existing-parent/received-export/Telemetry_Workspace.json --input /private/selected-input.json --out /existing-parent/preview

Preview does not create an edition or a review. Inspect full Preview_Report.json, Markdown/HTML and every pair in Preview_Pairs.csv. Errors and omitted coverage remain visible. To freeze the exact selection:

node native/telemetry-cli.mjs freeze --workspace /existing-parent/received-export/Telemetry_Workspace.json --input /private/selected-input.json --name "Baseline supplied model" --prepared-by "Named preparer" --note "Selected source and evaluation window" --operation freeze-1 --at 2026-10-15T00:02:00Z --out /existing-parent/baseline

A correction adds a new complete source and edition with --parent ORIGINAL_EDITION_ID. Never replace retained source bytes. Keep the same logical runId when explicitly comparing alternative supplied versions for that run; their full model/version/calibration contexts remain separate. Different runIds remain unmatched unless the preparer explicitly aligns the logical cohort in a new edition.

## Review, compare and independent receiving

node native/telemetry-cli.mjs review --workspace /existing-parent/baseline/Telemetry_Workspace.json --edition EDITION_ID --decision approved --reviewer "Named reviewer" --note "Approved file comparison only" --operation review-1 --at 2026-10-15T00:03:00Z --out /existing-parent/reviewed

An approved review records a human decision; it does not erase findings or authorize a plant action. Compare two frozen editions:

node native/telemetry-cli.mjs compare --workspace /private/current-workspace.json --left BASELINE_ID --right CANDIDATE_ID --out /existing-parent/comparison

Independently receive a complete working archive:

node native/telemetry-cli.mjs receive --workspace /private/current-workspace.json --out /existing-parent/received

Every receiving output contains exact originals, each full edition input/report, all paired CSV rows, the full current application source and a COMPLETE.json file index. Existing different files are never replaced. An owned same-source retry validates equal bytes and resumes using private temporary files plus atomic create-only publication. Unknown occupied directories and symbolic links are rejected. The original destination parent must already exist.

## Authored worked example and actual course

node native/telemetry-cli.mjs demo --out /existing-parent/authored-demo
node native/run-telemetry-course.mjs /existing-parent/course
node native/run-telemetry-course.mjs /existing-parent/capacity-course --capacity

The demonstration is invented software input, not a facility dataset or model simulation. It retains a received file with duplicates, one invalid temperature, a missing interval and out-of-order records; then a separate authored owner-corrected source; then baseline and candidate prediction originals on that same corrected cohort.

The capacity command executes 1,000 timestamps and 12 points through two complete frozen editions, comparison, export and independent replay. It uses one observed original and one prediction original for capacity, while the ordinary course separately exercises two different prediction originals. Timings are measured on the actual runtime. The previous source-only V8 course completed in 224,743 ms with a 51,831,023-byte compact workspace; these numbers are not a browser or Node performance claim.

The native course first commits its complete result checkpoint before subsequent files, allowing an interrupted same-source materialization to resume the accepted result. It never runs a physics model, calls a provider, changes a live system or establishes energy savings.

## Shared working files

The native CLI accepts either original domain JSON or Telemetry_Shared_Workspace.json and emits both formats while retaining all originals/reports/source. The source course also executes the maintained shared-archive course. See ARCHIVE.md for the lossless format and PERFORMANCE.md for measured results. The complete operator's compact carrier additionally preserves all draft forms and prior sessions; use native/build-desk.mjs with that complete carrier to rebuild an editable desk.
