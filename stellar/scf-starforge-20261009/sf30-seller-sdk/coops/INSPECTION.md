# Retained observation inspection

The existing Coastal Source Operations console can inspect an entire selected window of one retained product, recover an exact original point, and attach that selection to the normal source review. Its bounded chart and record browser share the original edition, source rows, annotation writer and streamed export.

Open **Source editions**, select an original edition, and use **Inspect retained observations**. Choose a product, inclusive dates inside the edition, and one to 480 display bins. The original station, datum, unit and clock basis appear above the result. Inspection reads retained bytes; it makes no provider request.

## Read the whole window

Every selected record contributes to the inspection. Each bin contains its total and numeric record counts, original first/last points and exact decimal minimum/maximum. The chart uses finite browser numbers for pixel positions; its extrema and review evidence preserve the exact source text. The vertical mark joins the two extrema within that bin. Adjacent bins are never connected or interpolated.

The summary distinguishes:

- All original records, including duplicates and unavailable values.
- Numeric records and exact minima/maxima.
- Expected fixed-grid slots, slots represented by any record, slots represented by a numeric value, missing slots, and slots without a numeric value.
- Duplicate record occurrences, duplicate timestamp/event identities and conflicting identities.
- Off-grid and invalid-clock records; values too large or small for a finite plotting axis.
- Every original value type and quality code.

Blank, missing, null, boolean and nonnumeric values do not become zero. Source quality is retained. A preliminary water-level record's first flag is an excluded-sample count; a verified record's first flag is an inferred-value indicator. Unknown quality/flag meanings remain uninterpreted through the maintained domain module.

One inspection holds at most 200,000 distinct product/timestamp/event identities and two million expected grid slots. Exceeding that bound raises an explicit selection error without returning a truncated result. The complete original window can be narrowed through its date controls. The same original source table and exports remain available.

GMT records retain their existing UTC projection. LST is displayed on its original local-standard clock. LST_LDT retains original repeated/absent clock labels and has no invented elapsed-UTC expected grid. High/low predictions have no fixed expected grid. Predictions are inspected as a separate product and never relabelled observations. No unit or datum conversion occurs.

A source request that completed or recorded unavailability does not establish complete measurements. The inspection retains both its selected request ledger and exact response register.

## Follow an actual point

**Inspect bin** exposes the original first, last, minimum and maximum. **Open selected rows** pages through every row in the selected window, including nonnumeric and conflicting rows, 50 at a time. Either route opens the complete projected row, the original decoded record and its original response receipt.

Each selected point is bound by the original record ID, response SHA-256, response-array locator and SHA-256 of the complete projected row. The server reopens that response and resolves the exact row. The response download is the full retained source file.

Keep up to 32 exact points in a review selection. Removing a point changes only that entered selection. Every original row remains in the source and full selected export.

## Save a source review

Choose **Attach this window and points to the source review**. Compare the selected inspection with the current entered review, then choose **Use this inspected selection in the entered review**. The subject, note and decision stay as entered. The full selected window/hash and point references are attached to that draft.

Complete the actual review note and choose **Save source review**. This uses the existing annotation.save action and original browser request journal. Before reserving a new request, the native writer recomputes the inspection from the exact retained edition and checks its expected inspection hash. It resolves every selected point and retains full evidence with the annotation reservation.

The annotation's existing selected-subject baseline and workspace revision checks remain. First materialization compares the selected saved annotation again. An interrupted original request keeps its exact inspected evidence and target; completed requests replay their existing result before comparing later state. A later generic note edit preserves the attached inspection, and annotation history retains preceding full evidence.

A selection read cannot overwrite later entered dates or a different edition. Attaching evidence checks the current selection, point set, draft token and complete entered review after the comparison was shown. Changing them requires another explicit comparison. Later saved-record edits use the existing current-versus-draft conflict controls.

The browser retains its selection, inspected result, selected points and review fields in the original workspace-keyed IndexedDB journal. Native reviews reside in the original workspace store and ordinary exports; browser storage is not the native authority.

## Export the complete selected data

Choose **Export every selected row**. Select CSV, JSONL or JSON and, optionally, an existing mapping for the same source table. The normal export.create action snapshots that saved mapping, annotation evidence and normalized selected dates/products in its original reservation.

The original streamer writes every selected row. Display bins do not sample or down-select the file. JSON includes the metadata envelope; CSV and JSONL keep the ordinary table format while the native export record retains complete metadata.selection, mapping and source identities. An interrupted request without its required retained window is explicitly unresolved rather than silently exporting the whole edition.

Use the original full-edition export controls for the complete source package or report. Their original bytes/semantics remain unchanged when no window fields are supplied. The source package carries exact response bytes and annotation evidence. Importing source bytes into another workspace creates that receiver's own source selection; it does not imply that its reviewer adopted an earlier decision.

## CLI and native API

Use the original running workspace startup JSON with --session when the console owns the workspace. A stopped original workspace may use --workspace under its existing single-writer rules.

~~~sh
node coops/cli.mjs --session /private/original-startup.json inspect-observations \
  --edition-id ORIGINAL_EDITION --product water_level \
  --begin 2025-01-01 --end 2025-01-07 --buckets 240

node coops/cli.mjs --session /private/original-startup.json inspect-point \
  --edition-id ORIGINAL_EDITION --file /private/exact-point-reference.json
~~~

These commands are read-only. Choose dates actually contained in the selected edition. The example dates describe the existing La Jolla reference selection, not acquired observations.

HTTP reads use the original private session and same-origin authentication:

- GET /api/inspection?editionId=…&product=…&beginDate=…&endDate=…&buckets=…
- GET /api/inspection-rows with the same fields and offset/limit (one to 500).
- POST /api/inspection-point with {editionId, reference}.

The native application exposes inspection(id, selection), inspectionRows(id, selection, options), and inspectionPoint(id, reference). The pure inspection.mjs exports the same computations over the existing retained store and edition. Its adjacent declaration file describes the result/evidence boundary.

A reviewed action uses the original exact request envelope:

~~~json
{
  "action": "annotation.save",
  "operationId": "YOUR_ORIGINAL_REVIEW_OPERATION",
  "expectedRevision": 42,
  "payload": {
    "editionId": "ACTUAL_RETAINED_EDITION",
    "subject": "Selected observation window review",
    "status": "open",
    "note": "Actual reviewer note",
    "inspection": {
      "selection": {
        "product": "water_level",
        "beginDate": "2025-01-01",
        "endDate": "2025-01-07",
        "buckets": 240
      },
      "expectedInspectionSha256": "REPLACE_WITH_ACTUAL_RETURNED_HASH",
      "points": []
    }
  }
}
~~~

This is a field example, not a dispatch-ready review. Supply the actual workspace revision, edition, inspection hash, decision and stable original operation ID. Retry the unchanged request after uncertain transport; inspect the existing native operation before authoring another request.

For a selected streamed export, export.create additionally accepts beginDate, endDate and products alongside editionId/table/format/mappingId. If supplied, the exact normalized selection stays in the original operation context.

## Receiving and validation

The additive operating flow belongs in the existing La Jolla receiving operation: open its actual retained edition, inspect its full selected window, follow an actual original point, retain a real review, export all selected rows, recover an uncertain original request, and reopen the same workspace and full original files. The original source and study reviewers remain the decision owners. This feature introduces no second capture or independent workspace.

Source validation includes a V8 semantic exercise of the actual inspection and domain modules with explicitly authored decoded rows: blank/null/missing/boolean handling; large and underflowing decimal text; conflicting duplicate timestamps; grid counts; original flag interpretation; exact point recovery; and selected evidence hashing. That exercise is not a NOAA capture or native/browser run. Native syntax and browser operating results must be reported separately when the original execution is admitted.
