# CRM migration review workspace

For installed Applications, native shared-workspace and customer-agent operation, start with [OPERATING.md](OPERATING.md). The complete source selection is crm-migration. The standalone offline desk and original exported-file CLI remain available below; keep those independently edited files outside a managed workspace directory. Receive an entire offline edition into a separate native directory for managed operation.

# CRM migration production desk
Portable operating source, prepared 14 October 2026.

## Open and operate
Open CRM_Migration_Desk.html in a current desktop browser. All comparison code, original authored example exports and 40 retained operations are embedded. The page has no external runtime dependency. Start with the first rehearsal to inspect its 16 findings, then choose the corrected rehearsal to see zero findings and matching exact currency totals.

Enter the recording operator's name. Use New workspace for actual work. Import original CSVs under distinct source IDs and describe the portal/system, export view, filters, cut-off and export operator. Originals retain their exact text, filenames, hashes, logical records and physical lines.

Mapping configuration has ordinary forms for each object, crosswalk or explicitly normalized key, field mapping, enum dictionary, decimal scale, required/unique values and amount/currency columns. Directed association families have explicit from/to objects, source relationship names, target categories and type IDs. A custom type ID comes from the actual portal and direction. The course's billing type 901 is authored example configuration.

Save configurations under new edition IDs. Create a comparison from a saved configuration. Review findings alongside every referenced original row, then record a reasoned disposition. A delivery lead may request corrections, record fully reviewed exceptions, or mark a zero-finding comparison ready. Corrected inputs get new source IDs and a new configuration/run; prior findings remain retained.

## Retention and recovery
IndexedDB saves the complete workspace and immutable saved versions. A single read/write transaction checks the currently expected workspace hash before committing. A second tab with a stale branch receives an error and keeps its forms. Saved versions explicitly adopts a selected branch while retaining the previous current branch. Workspace import validates full operation replay before replacing the current view and first downloads the current workspace.

Save workspace file downloads a fully replayable JSON archive. Open workspace validates and replays it. Export working bundle contains original CSVs, full configurations, every rehearsal report, all operations and the complete workspace. Save offline desk embeds the current workspace with the same operator code. Raw originals retain original values; findings CSV protects formula-like cells for spreadsheet viewing. Keep these working files in the approved project location.

If local storage is unavailable, the page operates in memory and visibly requests a workspace download. Closing with unsaved form edits or a memory-only workspace produces a warning. Downloaded files are the portable recovery path.

## Native receiving
Node.js 18+; standard library only, no package installation. From this package directory:
```sh
node native/crm-desk.cjs course receiving.workspace.json
node native/crm-desk.cjs inspect receiving.workspace.json
node native/crm-desk.cjs export receiving.workspace.json receiving-export
node native/crm-desk.cjs desk receiving.workspace.json receiving-desk.html
```
Expected: 18 original CSVs, 2 configurations, 2 runs, revision 40, first 16 findings/needs_correction and corrected 0/ready. Export writes 29 content members plus its export plan and completion marker. Repeat an export into that same directory only with identical bytes; a different existing output is rejected. Interrupted exports can continue against their identical retained plan.

For new work:
```sh
node native/crm-desk.cjs init client.workspace.json client-project "Client CRM migration"
node native/crm-desk.cjs apply client.workspace.json operation.json
```
The operation schema and complete examples are in docs/OPERATIONS.md. CLI mutations take an exclusive lock, fully replay the previous state, apply an expected-revision operation and replace the archive through a flushed temporary file. An abandoned lock requires inspecting the retained workspace before removing it. All writes stay in the supplied paths.

## Comparison scope
Object matching uses explicit crosswalks or explicitly normalized common keys. Duplicate/blank IDs, nonunique keys, invalid crosswalks, missing/unmapped records, mapped-field differences, required values and unique values remain visible. Dates are real YYYY-MM-DD. Decimal values are exact integer minor units at the configured scale, including amounts beyond JavaScript's safe floating-point range. Currency is compared separately and totals are split by currency.

Associations compare the directed object pair plus category/type ID, mapping endpoints through accepted object identity matches. Orphans, blocked endpoints, unknown types, duplicate edges, missing/unexpected links and conflicting configured primary-company edges remain visible. An explicitly excluded observed type has a retained reason and an excluded-row count.

Scope is the selected original exports and saved mapping. Empty exports require an actual header-only CSV; an absent required export fails configuration/comparison. Import side effects, workflows, permissions, files, email activities, consent, custom objects and undeclared relationship families need their own agreed mapping or separate receiving checks.

## Authored course
The course is fictional and uses example.test / .example. It has 4 contacts, 3 companies and 4 deals. First rehearsal retains 16 findings across missing/duplicate records, changed email and amount, currency, an orphan source association, blocked/missing/wrong/duplicate target associations and conflicting primary companies. Corrected source/target editions reconcile all three object populations and two association families. The enormous deal value is a deliberate exact-arithmetic exercise, not a business forecast.

## Validation performed
The exact comparison and workspace modules executed the full 40-operation course in V8: first 16, corrected 0, complete archive/reopen replay, exact USD/EUR totals, full report exports and embedded HTML archive identity. Focused regression checks are retained under validation/. Actual browser rendering and the filesystem-based Node receiving commands are a distinct equipped receiving course in docs/RECEIVING.md.

## Package
runtime/ — maintained CSV/codec plus CRM comparison, immutable workspace, reports and ZIP export.
browser/ — neutral normal-form operator and standalone HTML renderer.
native/ — receiving CLI.
examples/ — all authored originals, configuration editions and complete workspace.
docs/ — receiving, source/target contract, operations, cutover, production scope.
All files in this package are the reusable CRM operating product and its authored fictional receiving course.

## Direct HubSpot target acquisition

The installed desk includes **Capture HubSpot**: declared portal/property scope, complete retained responses, resumable object and per-source association pagination, atomic target intake and original capture download. See [HUBSPOT.md](HUBSPOT.md) for the host declaration, native and customer-agent operations, actual API contracts and receiving course.

## Complete cutover planning

Open **Cutover planning** from the installed CRM desk to compare baseline/current source and target editions, resolve concurrent edits, issue ordered packets, retain execution references, reconcile observations and check identity-bound reversal conditions. Existing CRM originals and HubSpot capture sources enter the companion as one recoverable transaction. [INSTALLED_CUTOVER.md](INSTALLED_CUTOVER.md) covers the complete browser, native, customer-agent and receiving lifecycle.
