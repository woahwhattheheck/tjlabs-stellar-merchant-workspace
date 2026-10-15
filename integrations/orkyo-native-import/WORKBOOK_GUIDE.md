# Orkyo native workbook preparation
Source contract: Kymr10n/orkyo-foundation commit 9b773566ecbfb0947f51f6e20ea925c03ddb2a22, retrieved 2026-10-15. Source files and license are retained in the complete package.

## Operator route
1. Preserve the actual input workbook and original resource/job rows in the desk. For this module, supply the complete sheet values, including the first five rows. It receives neutral sheet data; it does not claim to read arbitrary XLSX files.
2. Select the target site's actual ID and a tenant resource type that supports placement. Retrieve all active placeable resources for that site. The native importer stops if its returned resource list has another page. In the planner, existingComplete must be explicitly true only for a complete lookup.
3. Resolve every new station before running the workbook import. The pinned native workbook function sends isPhysical:true and no geometry. The create endpoint runs CreateResourceRequestValidator, which requires geometry for physical resources. Create missing stations through the native resource flow with their actual floorplan geometry and record their exact code and returned ID. Then refresh the full lookup. Reused stations are not updated from workbook names or notes.
4. Inspect dates, durations and every source warning. Headers are on row 5, data begins row 6. Workstations uses A:E, Jobs A:F. Additional columns remain in the preserved sheet values but the native importer ignores them.
5. Download the generated XLSX and use Orkyo's spreadsheet import with that selected site/type. Record actual workstation and job results in the desk's run history. The preview describes the pinned source; actual tenant configuration and required custom fields remain authoritative.
6. If a write fails, previous successful writes remain. Preserve its result and actual created IDs. The native importer reuses exact station codes but creates every job again. Use remainingSheets only after reconciling completed job keys; refresh station lookup before resuming. It leaves all workstation rows in place because native parsing requires referenced codes in this sheet even when the station already exists.

## Native values
- Codes match exactly, including letter case. Duplicate workstation codes are invalid.
- Workstation columns: Code, Workstation, What stands there, Capacity (h/day), Notes. The native payload combines What stands there and Notes into description, uses Exclusive allocation, and disallows cross-site allocation. Hours/day capacity is not imported as occupancy or calendar.
- Job columns: Job, Description, Workstation code, Start, End, Hours/day.
- End is inclusive in the sheet and becomes midnight UTC on the next day in the request. A one-day job uses equal Start and End.
- Duration is hours/day times Monday–Friday count across inclusive dates. It does not apply site shift times, holidays, shutdowns or overtime. Missing/unreadable dates, zero/negative hours, or a weekend-only span can result in the native one-hour minimum.
- The workbook path preserves decimal total hours; the separate per-page CSV importer uses parseInt. Choose the actual destination, not an assumed common import format.
- Excel dates use the native 1899-12-30 epoch and rounded serial day. The provided native XLSX reader consumes cached formula values and does not recalculate formulas or respect the date1904 workbook option. This writer emits explicit scalar cells and ISO dates, with strings represented as inline strings rather than formulas.
- Requests get status new. A previously used job name is not an update key.
- The source-stage plan displays unresolved resource binding separately. A job payload cannot be sent before its new station has a real target ID.

## Module API
createOrkyoWorkbookNativeReader(originalSpreadsheetImportSource) executes the retained production functions after narrowly checked TypeScript type erasure. If a known signature changes, it rejects the source instead of silently adapting.
createOrkyoWorkbookPlanner(native) provides makeSheets, inspectSheets, remainingSheets, jobKey, xlsxEntries and buildXlsx.
buildXlsx(sheets, UZIP.encode, utf8Encode) uses the maintained complete ZIP writer supplied by the receiving application. xlsxEntries returns the entire OpenXML package members. Strings, empty values, booleans and numbers remain explicit; invalid XML control characters fail export while original rows remain retained.

## Worked journey
The authored example has CNC-01 and INSPECT. Its initial complete lookup already contains CNC-01. INSPECT must first be created with real geometry; the planner identifies that action. A machining job from Friday 2026-10-16 to Monday 2026-10-19 at 2.5 hours/day becomes five hours, ending 2026-10-20T00:00:00Z. The inspection job on Monday retains 1.25 hours.
After recording the first job as completed and INSPECT's returned ID, the remaining-only workbook retains both workstation rows and only the inspection job. The next full lookup reuses both stations. The execution record in receiving/actual-workbook-course.json comes from actual production parser/payload functions run in JavaScript V8.
The guide and examples are development and onboarding material. Actual shop data enters the same forms and must retain its own originals, exact site/resource identities and run outcomes.

## Licensing
Authored planner and guide: MIT. Orkyo source remains under its retained upstream AGPL-3.0 license. The native reader executes upstream source supplied with this package; retain that source, its original notice and license when distributing the combined development material.

## Reproduce and materialize
Preserve the source bank's file paths and content. Run `node receiving/workbook-course.mjs NEW_OUTPUT_DIRECTORY` to execute the retained parser/payload course and write the actual XLSX plus a complete result. The checked-in V8 result is the run performed here; the Node command records its actual runtime when run.
