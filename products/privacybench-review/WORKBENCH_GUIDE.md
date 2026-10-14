# PrivacyBench Review Workspace

This complete offline application receives original native PrivacyBench evaluation outputs, retains the original bytes and exact number spellings, prepares editions through the maintained Research engine, compares explicitly selected bases, and returns named review with an editable handover.

## Open and retain your work

Open Open_PrivacyBench_Review.html in a current desktop browser. All application source is inside the HTML. The application makes no network requests. The default authored example is marked TRAINING_FIXTURE and is intended to explain the operator workflow.

Enter your name in Overview. Use New workspace to receive your own outputs. Save working JSON and editable HTML regularly. Both retain the complete workspace, original bytes, selections, editions, comparisons, review/adoption history and unfinished forms. The HTML additionally carries the entire application source and build tools.

Each opened HTML, imported working JSON or saved-browser-copy action creates a separate editable branch. IndexedDB keeps local copies when available. If storage is unavailable, the visible message tells you to download the working JSON. The live complete copy remains available to download. A stale concurrent branch is retained as a separate branch instead of overwriting the other window.

Keep copies in a folder you control. Opening a copied or renamed HTML under a different browser origin can have a different browser storage area; the embedded working copy remains portable. Browser storage alone is not your only copy.

## Original intake

In Originals choose a role, then select the original file. Results use role results. summary.md, viewer.html, configuration, notes and other supporting files have explicit roles. A returned review uses prior_review.

Files retain their exact Base64 bytes, name, media type, length and SHA-256. An uploaded viewer.html is displayed as source text and never executed inside the operator. Binary originals are retained and downloadable. The source text inspector shows the first 50,000 characters; Download complete original always returns the entire file.

Each original file may be at most 32 MiB. Selected-original and encoded-run bounds and the complete-handover bound also apply. The whole ZIP is measured before accepting a source or saved operation. If it would exceed 128 MiB, the previous workspace and unfinished forms remain intact. Six maximum-size result files cannot be assumed to fit together: exact originals, native Research runs, working copies, reports and application source all count.

## Explicit selection

In Selection choose the original result and enter its dataset identifier, exact revision and cohort reference. Bind each supporting original to a stable ID, portable path, role and media type. The native result is included automatically.

Use Start blank own-result definitions, then enter protocol question/title/purpose, candidate identity/version/kind and the original run ID, status, engine, timestamps and cohort/protocol IDs in the typed controls. Advanced complete JSON retains every configuration, command, runtime, source reference and additional definition field. Invalid unfinished JSON is preserved and its typed controls pause until that JSON is valid.

Enter the complete protocol, candidate and run definitions from the original evaluation. Required PrivacyBench criteria retain the producer definitions, units and directions. The Copy authored definition structure action copies a marked TRAINING_FIXTURE definition as an editable example. Replace its context with the real protocol, candidate, dataset and run before preparing a real imported result. Do not infer a dataset revision or judge configuration from a filename.

Preview complete selection checks the exact result descriptor, all selected supporting originals, protocol and native Research definitions. It projects every metric group supported by the original producer format. The full selection is immutable after saving. Edit a successor retains the earlier selection and the previous unfinished form.

## Editions and metric review

Give the edition a label, select a saved selection and, when relevant, its earlier edition. Preview and save an immutable edition.

The metric table shows all original groups, exact value strings, original gold/detected counts, denominators, judge state and source pointers. Search, group filtering and fifty-row pagination change only the view. CSV export contains every row.

The documented native metrics have these meanings:

- Detection recall is detected / gold.
- Synthesis accuracy is coherent / detected.
- Combined accuracy is coherent / gold.
- Individual unjudged detected spans remain in the detected denominator.
- A global skipped judge makes the original synthesis and combined rates unavailable.
- Shared character groups and overlapping file-kind rollups are not summed.

These statements describe the original producer contract. The application retains producer values; it does not recalculate or replace a metric.

## Comparison

Select exact earlier and later editions. Set dataset, cohort, protocol and judge bases to same, changed or unknown, and record the reason. Preview the complete comparison before saving.

Rows retain each side's exact value and denominator. Exact deltas are descriptive. An increase is not automatically a better privacy outcome. Unknown or changed bases are visible in the comparison and its caveats. Earlier-only and later-only rows stay present.

Saving a comparison produces an immutable comparison record. To express a later conclusion, add a named review; do not rewrite the original comparison.

## Named review and returned-work adoption

Choose Review beside a metric or comparison row to bind that exact target. A review can also cover all of a selected edition or comparison. Enter an owner, status and useful note. The named operator in Overview is recorded as reviewer. A successor review keeps its earlier parent.

For independent review, save a complete working JSON or editable HTML and give that copy to the reviewer through your normal channel. The reviewer opens a separate branch, records named reviews, selects the exact subject in Reviews and uses Export reviewer return.

Receive that original JSON under role prior_review. In Reviews choose the returned original, write an adopting note and preview the return. Adoption checks the checksum, shared workspace, exact immutable subject, row targets and linear review chain. Already-present records are recognized. Divergent or stale review chains remain visible as an error and do not overwrite the receiving workspace. Resolve such divergence by reviewing both retained copies and recording a new current named decision.

The return source bytes and adopting operator remain in history.

## Native Research handover

In Research choose an immutable edition and prepare the complete handover. The operator invokes the maintained original Research preparation/validation engine. Download Research handover ZIP to obtain its exact original result, supporting files, metric projection, plan, native run, readable review and current workspace history.

The complete native Research sources and reproducible PrivacyBench adapter accompany the application. No evaluator is embedded in the operator. Existing independently produced evaluator outputs can be received without giving this HTML model-service credentials.

## Full handover

Handover provides working JSON, editable HTML, full application source JSON, readable report, complete report JSON, operating guide and the full ZIP. Per-edition CSV is in Editions. Research ZIP is in Research. Measure complete handover shows the current actual byte count.

The complete ZIP contains:

- Full working JSON and independently editable HTML.
- All application source files, complete maintained engine sources and build tools.
- Complete original files at safe hash-derived paths.
- Every edition's full metric CSV and readable/report JSON.
- Complete Research files for every immutable edition.
- HANDOVER-MANIFEST.json with each entry's exact length and SHA-256.

ZIP paths reject collisions, traversal and nonportable file/directory collisions. Download original retains its original filename separately.

## Materialize and rebuild

Use Python 3 to materialize the complete source:

    python3 materialize_source.py PrivacyBench_Complete_Application_Source.json /absolute/source-directory

The helper retains the complete original source bank, checks original member identities, refuses linked or conflicting output paths and can resume the same exact materialization. See --help for its accepted arguments.

Build with Node.js in the materialized source directory:

    node build.mjs --out /absolute/new-delivery

The build checks the complete source manifest and regenerates the static bootstrap from the retained modules. Repeating the same build in its owned output directory verifies and reuses exact files. A different source uses a different output directory.

After reviewing intentional edits to existing manifest-listed source files:

    node build.mjs --out /absolute/edited-delivery --accept-edits

The resulting source bank and manifest bind the changed source. Newly added files must be explicitly added to PRIVACYBENCH-SOURCE-MANIFEST.json. Build source and output directories are separate. Source edits do not alter an earlier delivered working copy.

## Complete receiving course

Run the complete course in commissioning/COMPLETE_RECEIVING_COURSE.md against the same built source and retain the output identities.

1. Materialize the exact complete source, rebuild and record the output identities.
2. Open the resulting HTML in a desktop browser and at 390-pixel viewport width. Inspect the actual controls, table scrolling, labels and error messages.
3. Enter a named operator. Start a new workspace, admit an exact original result and its supporting files, and confirm original download bytes match.
4. Fill the genuine selection metadata, preview and save selection and edition. Inspect every metric family and a null judge result where present.
5. Import a second original result, create a successor selection and edition, and save an explicit-basis comparison. Review changed and unmatched rows.
6. Save named reviews. Export a working copy; open it independently, add a successor review, export reviewer return, and adopt it in the original receiving branch.
7. Save unfinished forms. Download working JSON and editable HTML, close the browser, move/rename the files into a directory with spaces and Unicode, and cold-open them. Verify original bytes, saved editions, review history and unfinished text.
8. Export all formats, inspect the readable report and full CSV, unzip the full handover, verify manifest lengths/hashes and independently open the included editable HTML.
9. Exercise an over-capacity intake and a divergent returned-review chain. Confirm the earlier workspace and unfinished draft remain accessible.
10. Retain the actual environment, source identity, observations and original failure details with the receiving output. Correct defects against that same source and repeat only the affected course.

Actual source execution and actual rendered-browser receiving are recorded separately so the receiving operator can reproduce the corresponding work.
