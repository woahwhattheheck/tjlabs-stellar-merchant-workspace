# Telemetry and model comparison desk

## Start and keep work

Open Telemetry_Desk.html in a current browser. The default is blank. **Open and restore → Open clearly authored example** loads the separate fictional three-edition example with four complete originals. The example is a receiving demonstration, not a facility measurement or physical model execution.

Name the edition and preparer. Save complete working JSON regularly. This preserves the exact domain workspace plus unfinished input, point/stream editors, source mapping, review text and all prior sessions. Editable HTML losslessly compresses the same working state and the entire application source. Browser storage is convenient but may be unavailable or limited; its status line explains whether it succeeded. Other open tabs do not silently overwrite a changed saved copy.

A successful new/open/restore operation retains the prior session even when it has no frozen operations. Failed receiving or admission preserves the current session. The complete handover must fit 128 MiB and 2,000 members including source, editable HTML and originals; use a smaller declared scope if this complete package exceeds its admission. Each original is limited to 20 MiB, originals together to 64 MiB; the domain also limits rows, points and expanded occurrences as documented in CONTRACT.

## Original intake and stream mapping

Retain each authorized CSV, TSV or JSON export using Original sources. The exact bytes, original name, media type and hash remain available for download. Opaque originals may be retained but cannot be parsed into numeric claims. Choose format and JSON array pointer, then inspect the actual columns and rows.

Prepare a complete stream definition. The structured controls and its complete JSON are the same draft. Use **Preview stream mapping** to inspect the source under that definition. Applying it appends a stream or replaces exactly the selected stream ID after retaining the prior draft. It does not freeze a report. A source column name is exact for CSV/TSV; JSON uses RFC6901 pointers relative to each selected row. Empty JSON array pointer means the root.

Wide layout uses columns with pointId, field and original unit. Long layout declares pointField, valueField and unitField (or literal unit), plus optional pointAliases. Quality filtering needs a named qualityField and explicit acceptedQuality list. Prediction streams require a stable logical runId and model id/version/calibrationStart/calibrationEnd/calibrationClockId. Keep runId stable when comparing versions of the same logical model; different run IDs remain separate rows.

## Scope, point and clock decisions

Declare site, pod, clock, time format, start, end and cadence. End is excluded. ISO timestamps require an explicit offset or Z. Absolute and relative time cannot be mixed. Clock identity is a preparer's assertion, never inferred from similar-looking times. Every stream declares its actual clock and time format. The full input editor retains fields that the structured controls do not expose.

Point quantity and unit are separate decisions. Absolute temperature and temperature differences convert differently. Power and energy are separate quantities. Optional lower and upper limits are owner-supplied review context. No operating limit or calibration threshold is supplied by this desk.

Choose exact alignment with zero tolerance, or nearest with an integer tolerance below half cadence. Nearest is the core's deterministic local matching rule; ambiguous ties and reuse attempts remain findings. Choose duplicate policy explicitly: reject is default, first/last retain every occurrence and disclose the selection. No interpolation, averaging or hold-forward is introduced.

## Preview, freeze, compare and review

Preview calculates from the complete current draft and original sources. Editing the source, draft or preparer invalidates that preview. Freeze requires a named preparer and binds the exact preview. A corrected edition has a parent and preserves the full original edition. All record edits remain drafts until preview and freeze.

Saved reports show scope, summary, coverage, residual metrics and all findings. Select the relevant row section for every occurrence and aligned pair. Pagination limits the visible rows, not the exported data. Every original invalid, duplicate, unmatched and out-of-window occurrence is retained. Pair counts are the actual metric denominators. Bias, MAE and MSE retain exact rational numerator/denominator; RMSE is an explicitly approximate square root.

Compare two exact frozen editions. Read common pairs, left-only/right-only coverage and changed observations together. A metric delta uses only common unchanged measured occurrences and matching declared scope, units, alignment and limits. Model/calibration context remains visible. A lower residual is not an energy saving or a conclusion about safe operating control.

Named review targets the selected edition and retains reviewer, decision, note and prior reviews. It does not modify the inputs or automatically approve technical operation.

## Exports and receiving

Working JSON uses compact serialization and editable HTML retains a lossless gzip+Base64 boot state. Both preserve unfinished drafts. Earlier plain JSON boot states remain receivable. Domain workspace JSON opens in the maintained native CLI. Complete report JSON includes the selected edition and reviews; pair CSV contains every aligned pair, while full report CSV retains all typed report paths. Comparison JSON/CSV preserves both cohorts and unmatched reasons. Report HTML/Markdown are readable summaries with complete JSON available separately.

Full application source is an exact gzip+Base64 envelope with encoding `gzip+base64`. Use the included unchanged standalone opener:

```sh
python3 materialize-source.py Telemetry_Complete_Application_Source.json NEW_SOURCE_DIRECTORY
cd NEW_SOURCE_DIRECTORY
node native/build-desk.mjs NEW_Telemetry_Desk.html
node native/run-telemetry-course.mjs NEW_DOMAIN_RECEIVING_DIRECTORY
node native/receive-operator.mjs NEW_OPERATOR_RECEIVING_DIRECTORY
```

To rebuild the same editable state, use `node native/build-desk.mjs NEW_Editable.html Telemetry_Working.json`; the working carrier is fully validated before create-only output.

See docs/NATIVE.md for original source intake, calculation, freezing and comparison commands. Select a new output directory; create-only publication preserves existing files.

Large calculations are synchronous. The desk saves drafts and paints a working indicator before invoking the core, but the browser may be busy while it executes. The supplied 1,000-row/12-point receiving measurement is from explicit V8 source execution, not Node or browser timing. Use the native CLI for larger scopes and run the included actual browser receiving course on the target environment.

## Compact complete working copies

Save compact complete working JSON stores the same current workspace, unfinished input/mapping/review forms, recovered originals and every prior session in the versioned shared carrier. Save compact domain workspace exports the selected domain only. Open and restore accepts both original and compact complete operator files; domain import accepts either domain format. The native editable builder accepts either complete operator format. Original full JSON, editable HTML and full ZIP remain available.

The shared representation retains repeated complete values once, then reconstructs every original workspace before the existing full history validation. Backup hashes still bind their original expanded snapshots. The source contains both the original operator edition and the reviewed performance contribution. Calculation reuse applies only to validated unchanged numerical inputs; changed model declarations remain explicit in each report. Shared-file construction and reopening are synchronous; transfer-size reduction does not imply a faster total operation. See ARCHIVE.md and PERFORMANCE.md for the exact measured scope.


## Durable browser copies and large retained workspaces

The desk now saves to IndexedDB. Each complete immutable domain workspace is retained once as its exact compact archive; later unfinished form saves reference that object. A saved session includes its input, mapping, structured-field edits, review text, selected reports, prior-session snapshots and recovered originals.

Every save first prepares a complete proposal. One IndexedDB read/write transaction retains the proposal, checks the expected browser head and publishes only when that head still matches. If another tab saved first, both complete proposals remain in **Open and restore → Browse retained browser versions**. The other tab's head stays intact. Open the version you want, then use **Save current as an independent browser copy** to continue it separately. Earlier versions are retained.

The status line distinguishes a saved working copy, an independently retained conflict proposal, and a copy still held only in this tab. If storage is unavailable or full, keep the tab open and use **Save complete working JSON**, **Save compact complete working JSON**, or **Save editable HTML**. These downloads remain available even when browser persistence fails. Closing an unsaved copy prompts the browser's normal leave-page warning. Downloaded files are still needed for backup and transfer; browser data can be removed by browser settings or profile cleanup.

An editable HTML handover has its own saved-copy identity. Reopening it restores later work saved for that same handover; it does not substitute an unrelated active copy. Its initial complete state remains in the file and the retained revision history. A newly opened different handover starts with its own embedded state.

Earlier full and compact working files remain supported, including the earlier complete-session shared carrier and the full domain JSON. The original localStorage key is left unchanged. **Import earlier localStorage copy** brings that original into the current complete session with the prior session retained; **Download earlier browser original** exports its exact stored text.

The actual large source course retains 1,000 timestamps × twelve points and two full 12,000-pair editions. Its original domain file is 51,831,023 bytes; the compact domain file is 11,356,391 bytes. Its complete old/full operator file is 51,838,446 bytes and the corresponding compact operator file is 11,363,828 bytes. These are retained-file sizes, not a browser quota promise or a physics result. IndexedDB moves the practical save path off localStorage's small quota. Initial complete object validation/packing can still take time; subsequent draft saves reuse immutable objects.
