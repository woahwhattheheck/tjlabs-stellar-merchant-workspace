# Orkyo import readiness and receiving desk

Prepare native imports, preserve original files and source editions, and reconcile actual create outcomes before producing remaining-only files.

## Start with the operating desk

Open **Orkyo_Import_Readiness.html** in a current desktop browser. It is self-contained and works without a network connection. The four stages are Original & target, Review rows, Native batches & outcomes, and Workspace & exports.

The desk prepares files for Orkyo's own import screens. Its event history records source corrections, explicit row decisions, frozen batches, actual import attempts, and source-to-target outcomes. Open **the authored receiving course** under Workspace to walk through a complete example before using actual customer files.

Each save creates a separate complete browser copy. Copies retain pending form drafts and selected original file bytes as well as the working history. Choose a copy explicitly to reopen it. Keep a downloaded complete JSON copy at each operating boundary; browser storage is local to the browser/profile and may be cleared. If saving fails, the current workspace remains open and Emergency export includes the full current copy and earlier in-memory copies. Confirm that the exact downloaded file was saved; this enables opening/importing/starting another copy while storage remains unavailable. Any further edit requires another export. Batch and outcome-row selection travel with pending outcome fields, and changing either first retains the previous draft.

## The native behavior this desk uses

The retained source is Orkyo Foundation commit 9b773566ecbfb0947f51f6e20ea925c03ddb2a22. The corresponding reusable adapter package is published at integrations/orkyo-native-import in tjlabs-stellar-merchant-workspace, merged through PR2093. Compare the receiving deployment's version and actual entity definitions before its first import.

| Import route | Identity and behavior | Practical receiving step |
| --- | --- | --- |
| Requests page CSV | Creates each admitted row; exported id is ignored. Duration uses integer parsing. | Review exact resource IDs; convert 2.5 hours explicitly to 150 minutes if that is the intended duration. |
| Resources page CSV / flat JSON | Creates records under the selected actual type; exported id is ignored. Custom-field values follow actual type definitions. | Review exact allocation mode, typed metadata, concurrency capacity and physical geometry. |
| Production workbook | Reuses exact workstation codes at the selected site; creates jobs sequentially. | Use the complete current active/placeable-resource lookup and reconcile every prior job create. |
| Reporting API | Read-only. | Use actual supported reads for evidence; this desk never treats a reporting token as write authority. |

Cloud import/export is documented for Professional and Enterprise; the Community edition includes these workflows. The free Cloud plan does not include import/export. Orkyo's founding-partner programme is selective: five organizations, an initial 12 months, and active use with feedback. Custom migration/integration work is separately scoped. The six researched shop families are qualification candidates with concrete operating questions.

Sources: https://orkyo.com/docs/user-guide/import-export/ ; https://orkyo.com/docs/administration/integrations/ ; https://orkyo.com/design-partners ; retained upstream source in vendor/orkyo-foundation.

## 1. Retain the original and receiving context

Choose a CSV, flat resource JSON, or production XLSX. Exact uploaded bytes are retained separately from the editable text or complete worksheet-cell representation. The workbook reader preserves standard shared/inline strings, numeric cells and available formula cache values; the complete original XLSX stays available. A formula without a cached value or an invalid workbook member needs repair before native planning.

For a workbook supplied as JSON, use the complete array of named sheets, each with rows: arrays of cells. Do not remove instruction rows: native Workstations and Jobs headers are on row 5, and data starts on row 6. The authored workbook and receiving course demonstrate the exact shape.

Enter the actual receiving tenant/environment. Resources also need the selected actual resource type key and custom-field definitions. Workbook planning needs the actual site, actual placeable type, complete active/placeable resource array and retained lookup evidence. Preserve the original pagination result. A partial lookup must not be declared complete.

Retain original and inspect creates a source history even when the CSV or sheet content needs repair. It does not silently turn missing data into a completed import. To correct it, select the source in Review rows, load it into the correction form, edit the complete representation or target context, explain the correction, then save a new edition. Earlier bytes and reviews remain in the history. Once a batch is frozen or attempted, its source is protected against redefinition.

## 2. Review native payloads and explicit decisions

Each original occurrence has its own row ID. Repeated names do not merge records. Select a row to inspect its original values, native create payload, issue codes, previous review and actual target state.

Choose one disposition:

- **Reviewed new create:** supply corrected native row values or complete workbook job cells, a named reviewer and an explanation. Preview the new payload and explicitly acknowledge every remaining issue code. Blocking issues require correcting the values.
- **Bind existing target:** retain the actual target ID and complete lookup evidence. It will not be selected for a new create.
- **Exclude:** retain why this row does not belong in the current import.

A matching native payload elsewhere is shown as a duplicate-create risk. If two occurrences are legitimate distinct creates, explain that distinction explicitly. Exact source hashes also prevent accidentally re-intaking the same original under a new name.

### Request and resource details that matter

A request CSV's requirements_count contains no requirement definitions. Preserve that source fact and restore real requirements through the receiving system's authorized workflow. Changing the count to zero is only appropriate for a genuinely request-only scope confirmed by the operator; the original and review reason remain visible. The page route also does not reconstruct site hierarchy or dependencies.

Resource allocation mode must be the actual accepted enum: Exclusive or Fractional. Capacity is concurrency, not hours per day. Numeric identifiers should remain text when the actual field definition is text. List lookup fields require actual target lookup IDs. Preserve original unknown columns even when they are outside the importer's mapping.

Physical resources need their real geometry. The retained native production-workbook creator sets physical=true without supplying geometry, while the receiving validator requires geometry. Therefore create new physical stations through the appropriate resource workflow using actual geometry, then refresh the complete exact-code lookup before using the workbook. The desk will not invent locations.

### Workbook duration and station reuse

The native parser converts inclusive end dates to the following midnight. Duration counts Monday–Friday and keeps decimal hours; 2.5 hours per day over Friday–Monday becomes 5 hours. A one-day 1.25-hour inspection remains 1.25 hours. Missing or unusable values may invoke a one-hour fallback and need review.

This calculation does not apply the actual site's holidays, shutdowns or overtime. Review those in the target calendar. Workbook capacity hours/day is retained but does not set concurrency or occupancy. Existing station names, notes and capacity are reused unchanged.

## 3. Freeze, import and reconcile

Select only the reviewed new rows and prepare a batch. The desk freezes the exact source edition, target context, corrected values, native payloads and native file. CSV/JSON files are read back through the same adapter before admission; payloads must match. Workbook batches preserve all station rows while selecting only the reviewed job rows.

Download the exact native file and use the receiving tenant's authorized import screen. At the actual import, record the operator, route and exact typed tenant label, and mark the batch attempted. This makes every unresolved row unavailable for another create.

Resolve each row with actual evidence:

| Outcome | Evidence and continuation |
| --- | --- |
| Created | Actual returned or looked-up target ID plus retained response/lookup and source-row attribution. The binding remains immutable. |
| Existing | Actual target ID and lookup evidence showing the source row belongs to that target. |
| Rejected | Actual rejection before creation; correct the row or receiving cause before another reviewed batch. |
| Not attempted | Evidence that the import did not reach this row, including the relevant stopping point and receiving lookup where needed. |
| Unresolved | Leave the row unresolved while inspecting the actual receiving state. No repeat create is permitted for that row. |

The native workbook hook returns counts, not a full list of created job IDs. A count alone cannot establish an individual row's target. Retain actual request responses or a complete receiving lookup that identifies the row. A lost browser response can follow a successful create; do not equate silence with rejection.

Prepare the remaining rows only after their outcomes are resolved. Confirmed created or existing rows stay excluded. A remaining workbook retains station definitions so the native parser can resolve codes, and contains only the selected uncreated jobs. Refresh the target context when necessary before a separate intake and cross-check prior target bindings.

Abandon applies only to a prepared, unattempted batch. It releases those rows for another preparation while retaining the original frozen batch and reason. It cannot erase an actual attempt.

## 4. Reopen, report and hand over

Complete workspace JSON contains all event payloads and exact original bytes, source editions, native batch contents, target IDs and evidence. Reopening replays each event against the maintained model and verifies the hash chain and native semantics. The foreign-operation guard prevents another programme's workspace being adopted under Orkyo filenames.

The desk also exports readiness CSV, outcomes CSV and the full readable HTML report. CSV cells beginning with spreadsheet formula triggers are neutralized for human reporting. Native import exports use the maintained adapter's separate exact round-trip rules.

The complete source package includes all original native source, current application, authored example and actual local course result. The six-shop workbook and reader provide public-source qualification and proposed resource/adoption configuration. They are separate from actual target IDs, geometry and production orders.

## Complete authored operating course

The retained course executes 18 accepted commands through the unchanged production core. Fourteen checks cover actual request duration coercion, reviewed conversion, partial creation, uncertainty blocking, remaining-only request/workbook files, native weekday/decimal calculations, geometry prerequisite, malformed-source repair, immutable original editions and exact portable replay.

The authored IDs and receiving responses are clearly labelled. The saved result is a local source execution. The same native Node runner can execute it after materialization; the caller-owned browser chapter operates the actual standalone desk and downloads when an existing browser is supplied.

## Build and run

From this integration directory:

```sh
node desk/build-cli.mjs /absolute/path/to/New_Orkyo_Desk.html
node desk/cli.mjs course /absolute/path/to/new-receiving-directory
node desk/cli.mjs report /absolute/path/to/Workspace.json /absolute/path/to/New_Report.html
```

The CLI reads the complete saved workspace with the same core and native adapters. Output paths must be new, preserving earlier work. The pure `buildOrkyoDesk(files)` function composes the standalone application from the maintained bodies and validates its actual assembled script. Literal source insertion uses callbacks so JavaScript replacement sequences in bundled libraries remain unchanged.

For actual browser receiving, supply an existing caller-owned Playwright page and loopback origin to `receiveOrkyoBrowser` in `receiving/browser-receiving.mjs`. The chapter opens the exact standalone, exercises intake/review/import-file/outcome/export/reopen, and saves desktop/narrow screenshots and ordinary downloads. Inspect those screenshots and the opened files as the recipient would before client presentation. The retained authored V8 course and focused handler execution are separate from rendered browser operation.
