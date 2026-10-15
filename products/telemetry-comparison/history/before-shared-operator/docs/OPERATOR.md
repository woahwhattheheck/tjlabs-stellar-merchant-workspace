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
