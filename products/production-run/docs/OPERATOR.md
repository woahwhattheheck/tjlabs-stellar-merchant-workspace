# Production run review desk

## Begin with actual source

The desk starts blank. Open the separate authored demonstration to inspect a complete example; its source files describe fictional production runs. For your own work, retain the actual run, standard, stop, labor, output and charge files in Original sources. Every original is available byte-for-byte and remains separate from its field mappings.

CSV, TSV and JSON tables use explicit selectors. JSON requires the selected array pointer and relative field pointers. Inspect each table before assigning it. Opaque originals can remain retained but cannot support a parsed calculation. Exact decimal meanings remain strings in source mappings and correction JSON.

## Declare scope and map all six tables

Scope records site ID, label, observation cutoff and clock convention. Timestamps must include their UTC offset unless one fixed offset is selected explicitly. A fixed offset does not infer daylight-saving changes.

Select a table under Scope and mappings to edit its exact original, format, array pointer and all field selectors. Full editable input JSON retains every field. Original sources provides a separate whole-table mapping preview: copy the current mapping, edit it, preview the complete resulting calculation and adopt it into the draft.

Runs identify line, SKU, window, standard version, output unit and currency. Map time/output/labor/cost completeness flags, required charge categories and first-pass or final-good convention from explicit owner records. A declared zero needs an explicit source value. Missing wages, charges and output evidence stay unknown.

Standards contain separate planning cycle and ideal cycle times. Neither substitutes for the other. The selected version must cover the complete evaluated run window. Separate simultaneous physical capacity into different line identities; a standard change within a run requires an explicit split.

## Review complete time and output evidence

The report exposes planned/run time, excluded intervals, raw stop duration and the union used in the denominator. Overlapping reasons remain visible and are not silently summed. The selected cutoff bounds an open or future-ending run; it remains partial when appropriate.

The output section retains every delta or cumulative-counter segment and original reference. Counter evidence needs the original baseline and closing reading. A reset needs the supplied immediately-before-reset totals plus the new reading; a decrease alone does not establish a reset. Different counter IDs, missing closing evidence and contradictory counts remain findings.

The run report separates availability, ideal performance, first-pass quality and OEE. Ratios retain exact numerator/denominator along with display values. The report exposes the selected unit, standard version, cutoff, time denominator, coverage and reasons whenever a metric is unavailable. It does not average heterogeneous runs into an invented headline OEE.

## Distinguish supplied cost from complete contribution

Known-cost contribution is recorded good output valued at the supplied per-unit amount, less known allocated labor and explicit charges. Complete contribution also requires resolved wages/categories, complete output and the declared cost coverage, with valid source records. Both fields appear separately in the run overview and full contribution section.

Recorded output value is not an invoice or cash receipt. The source owner defines which material, overhead and other categories belong to the selected scope. Review allocated worker time across runs and preserve actual rate/currency. The engine keeps uncertainty visible rather than filling absent costs with zero.

## Prepare a named source-row correction

Use Source corrections after selecting the actual table in the current mapping. Inspect that mapped table, name the new correction source and preparer, and state the reason. Load an original row by its displayed zero-based index. Edit the complete row JSON; keep numeric meanings as exact text. Loading another row retains the previous unfinished row draft. Retain each planned row edit, then preview the full corrected table and calculation.

The preview creates a separate proposed JSON source containing the original source ID/hash/name/format/array pointer, every original row reference, exact changed-row text, preparer, reason and timestamp. It does not replace the current original or mapping. Adoption retains that new source and its mapping, plus a complete prior-session snapshot. Freeze the resulting edition separately after reviewing its complete findings.

Source corrections display the derivation and individual original row references. The full wrapper is available as an exact source download. Unfinished and invalid row-edit text survives working JSON and editable HTML.

## Freeze editions and inspect reports

Name the edition and preparer, preview the complete source reconciliation, then freeze it. Changing input after preview requires a new preview. Received errors can be frozen as the actual received state and corrected in a parent-linked successor.

Frozen reports have a summary, per-run calculations, all findings and all six mapped source tables. Select a run and inspect its performance, window, output segments, labor, charges, contribution, coverage and standard. Every table is paginated for ordinary operation; full JSON/CSV and readable HTML/Markdown exports preserve all rows and references.

## Compare and review

Choose exact baseline and candidate editions. The comparison retains all changed source rows, paired per-run contexts and deltas, unmatched run IDs, source references and basis changes. Different cutoff, clock, standard, denominator, unit or good-output convention is visible. Correcting bad records does not prove that physical production improved.

Prepare a proposal with explicit name, preparer and reason. Its full comparison has an immutable SHA256. OPERATIONS and FINANCE reviewers select that proposal and record a named decision and note against the exact hash. The latest explicit decision for each required discipline determines source-review status; earlier decisions remain retained.

A valid correction can be reviewed even when its predecessor contained errors; those baseline caveats stay visible. Complete source-review handoff includes both editions, the comparison/proposal, named decisions and every original. Production and accounting owners control downstream application.

## Preserve working state and recover

Save complete working JSON regularly. Editable HTML contains the same complete state in a lossless compressed boot plus the full application source. Both retain unfinished input, mapping, correction rows, proposal and review drafts and previous replaced sessions.

Successful import or replacement first retains current work, including a draft-only session. A failed import leaves it available. Another browser tab's saved copy is not silently overwritten; select the copy explicitly in Open and restore.

The complete source/working/HTML/originals ZIP has a measured 128 MiB and 2,000-member admission. A source original is limited to 20 MiB, all originals to 64 MiB, and each selected table to 50,000 rows. Select a smaller run scope when the entire handover exceeds admission. Browser storage may have a lower limit; the visible status line reports whether saving succeeded.

The desk paints a working notice and persists drafts before synchronous calculations. Internal copies retain only the core's validated immutable workspace identities while copying editable metadata. Received files still receive complete source-history validation.

## Build and receive the full source

The complete application download is an exact gzip+Base64 source envelope. Use the supplied unchanged standalone opener:

```sh
python3 materialize-source.py Production_Complete_Application_Source.json NEW_SOURCE_DIRECTORY
cd NEW_SOURCE_DIRECTORY
node native/build-desk.mjs NEW_Production_Desk.html
node native/build-desk.mjs NEW_Editable.html Production_Working.json
```

Use new output filenames. The complete domain CLI and source receiving commands are in docs/NATIVE_RECEIVING.md. The full actual-browser course is in docs/BROWSER_RECEIVING.md. Source-execution timings and explicit DOM/storage adapters are identified separately from installed Node or rendered browser observations.

Run the complete controller source course with `node native/receive-operator.mjs NEW_DIRECTORY`. Receive the existing exact capacity workspace without regenerating it using `node native/receive-capacity-transport.mjs EXISTING_WORKSPACE.json NEW_DIRECTORY`. Both retain their full measured results in create-only output.
