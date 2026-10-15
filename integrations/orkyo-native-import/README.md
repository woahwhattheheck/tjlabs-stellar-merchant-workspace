# Orkyo native import preparation

Prepare original resource/request tables and the official capacity-planning workbook format against Orkyo's actual import code.

## Use the right import route

- **Per-page CSV / resource JSON:** adapter/orkyo-import.mjs retains all original rows, previews actual creates and exposes native coercions. Requests use the actual 15-column CSV route; resources use flat selected-type CSV or the matching JSON envelope.
- **Capacity workbook:** adapter/workbook-planner.mjs preserves complete sheet values, computes the actual workbook payloads, identifies exact-code reuse and creates a genuine XLSX package. It can prepare remaining jobs after a reconciled partial run.
- **Existing stations first:** the pinned workbook creator marks a new station physical but omits geometry, while its create endpoint runs a validator requiring geometry. Prepare missing stations with actual geometry through the resource flow, refresh the complete target lookup, then import the job workbook.
- **Actual target configuration:** retain tenant/site/type IDs, real geometry and required custom-field values. Workbook hours/day capacity does not become occupancy or a shift calendar.

Read [the source contract](SOURCE_CONTRACT.md) and [the complete workbook guide](WORKBOOK_GUIDE.md). Upstream source is pinned to commit9b773566ecbfb0947f51f6e20ea925c03ddb2a22.

## Run the source course and generate the XLSX

From this directory, with Node installed:

```sh
node receiving/compare-native.mjs
node receiving/workbook-course.mjs /absolute/path/to/new-orkyo-receiving-directory
```

The second command requires a new directory and writes Orkyo_Authored_Workbook.xlsx and the complete receiving result. It executes the retained production parser and payload functions. Its report records the actual Node version.

The supplied V8 receiving result covers the authored two-station/two-job journey. A Friday–Monday job at2.5h/day produces5h and an exclusive Tuesday-midnight end; inspection retains1.25h. After reconciling the first job, the remaining workbook keeps both station rows and only the inspection job. The generated XLSX archive was decoded and each complete member matched.

## Embed in an operator

Import createOrkyoWorkbookNativeReader and createOrkyoWorkbookPlanner. Pass the retained original spreadsheet-import.ts source to the reader, then give its returned native functions to the planner.

```js
const native = createOrkyoWorkbookNativeReader(originalSpreadsheetImportSource);
const planner = createOrkyoWorkbookPlanner(native);
const plan = planner.inspectSheets(sheets, {
  siteId: actualSiteId,
  typeKey: actualPlaceableTypeKey,
  existingComplete: true,
  existingResources: completeActivePlaceableResources,
  priorJobCreates: previousCreatedJobRecords
});
const workbookBytes = planner.buildXlsx(sheets, UZIP.encode, codec.utf8Encode);
```

Each issue includes its sheet, original row, concrete effect and whether preparation is incomplete. Display unresolved new-station bindings separately. Record actual completed writes before preparing a remaining-only workbook: the native importer reuses stations but creates jobs on each run.

Original source rows and unrecognized columns remain in the plan. String cells in the generated XLSX are literal inline strings. Existing shop records, contacts and credentials belong in the consuming private workspace.

## Files

- adapter/: complete authored adapter, workbook planner and native reader.
- vendor/: retained exact upstream files, original license, existing archive codec and UZIP runtime.
- examples/: explicitly authored CSV, resource definitions, sheet values and generated XLSX as base64.
- receiving/: actual V8 results and reproducible Node courses.
- SOURCE_CONTRACT.md and WORKBOOK_GUIDE.md: full operational semantics and recovery sequence.

See [third-party notices](THIRD_PARTY_NOTICES.md) before distributing the combined source.
