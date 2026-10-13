# Cost workbook edition review

This complete local application lets a consultant compare two original Excel workbooks, inspect their stored cells and formulas, record named decisions, and deliver a portable review containing both exact originals.

## Open the application

Use Python 3.11 or later on Linux or macOS. The seven source files stay together. There are no package installs, external services or hosted runners.

    python3 serve.py serve --workspace /absolute/private/workbook-review --port 8865

Open the printed http://127.0.0.1:8865 address. The workspace contains original files and the authoritative review history. Keep it on persistent private storage.

1. Choose **New comparison** and enter a useful title, the exact reporting period, currency or units, and selected donor methodology.
2. Receive the two original .xlsx files. Each may be up to 20 MiB, with at most 250,000 stored cells; expanded workbook parts are limited to 200 MiB.
3. Add named review fields for the actual cost-recovery totals, direct-cost denominator, individual partner allocation or explanatory note cells that matter to the consultant. Reference each original sheet and cell explicitly. The application requires real stored coordinates and retains the rationale.
4. Create the comparison. Open the earlier/later workbook download controls and confirm the full original files. The comparison includes every stored cell, formula definition, shared formula master, sheet addition/removal/name/state, workbook controls and every OOXML package part.
5. Read named fields and changes. Filter by worksheet, cell, text or change type. Review tables show 50 rows per page; the complete change set is retained. The separate original-cell viewer pages through actual cells from either edition.
6. Enter the reviewer’s name and acknowledge changes or request correction/information. Explain all formula, structural and unresolved decisions. An optional cost-category label and explanation belong to the review, preserving the original workbook.
7. Save the review. Every accepted request has a stable ID, expected revision and exact comparison digest. A stale browser must reload. A disconnected save retains its original request for exact replay and can reconcile against the returned history.
8. Close and reopen the application. Select the existing comparison, inspect its saved revision/history and download **complete handover**.

An acknowledged change records the named reviewer’s action. “Unresolved” counts every change without an acknowledgment, including outstanding requests for correction or information. No decision is filled in by the software.

## Original calculations and presentation

The comparison reads original SpreadsheetML values and formula definitions. Formula values are stored caches from the selected workbook. Numeric date cells remain original serial values with their format definitions. Shared formulas retain the master formula, master coordinate, shared index and reference information.

Use the actual spreadsheet application for recalculation and financial sign-off. Receive the resulting new workbook edition to compare its real changes. The software preserves all original binary parts, styles, charts, pivot data, comments, external links and validation XML in the original .xlsx. Package-part changes are shown explicitly. External data links and macros are never executed.

The supported workbook format is transitional SpreadsheetML .xlsx. Strict-namespace, encrypted, macro-enabled, .xls and .xlsb workbooks produce a specific format error. Keep those originals and use the proper original-application export, then receive the unedited exported .xlsx. The workbook engine’s ordinary save/export remains authoritative.

The selected financial method is a recorded input. Grant and commercial-contract cost methods are separate, and an NPAC rate is not replaced by a NICRA rate. Periods, units, classifications and allocation rationale are reviewed using the selected original source and the consultant’s instructions. There is no universal preset cost rate.

## Complete portable handover

The exported ZIP contains:

- Both exact original Excel files.
- The complete original comparison, mapping, named decisions, immutable revision history and request replay records.
- A readable offline index.html and review.json.
- All seven application/operating source files.
- A manifest naming every complete file with its bytes and SHA256.

Unzip into a private directory and open index.html. All changes, named review fields, saved decisions and original workbook downloads are available. Offline new decisions can be downloaded as a complete request file. Submit that file to the original workspace’s CLI to append them to the authoritative history.

Use the packet’s **own complete source** for independent receiving. This avoids silently changing the parser or programme during a historical receive:

    cd /path/to/unpacked/source
    python3 serve.py receive --workspace /new/private/received-review --packet /path/to/Workbook_Review.zip
    python3 serve.py list --workspace /new/private/received-review
    python3 serve.py show --workspace /new/private/received-review --case CASE_ID
    python3 serve.py serve --workspace /new/private/received-review --port 8866

Receiving validates every member, both original workbook identities and the complete source. It recomputes the comparison from both actual workbooks and compares the full result, verifies retained decisions, then restores the original case. An existing different revision is preserved; choose a separate receiving workspace. Reopen the independent workspace, inspect the saved history and export again.

## CLI intake and review

Create directly from original files:

    python3 serve.py create --workspace /private/review --title "Organisation FY2025 — agreed and revised costs" --before /original/agreed.xlsx --after /original/revised.xlsx --mapping /original/mapping.json

The mapping has methodology, period, currency and optional focus fields. Exact sheet-name alignment is the default. For a genuine renamed worksheet, provide a complete one-to-one sheetPairs array; every original sheet must occur exactly once. Use null for a sheet present only in one edition.

Example structure, to be completed with the actual workbook’s names and cells:

    {
      "methodology": "Exact selected donor method and dated source",
      "period": "Exact reporting period",
      "currency": "Original workbook units",
      "focus": [
        {
          "id": "direct-cost-base",
          "label": "Direct-cost base",
          "category": "Direct programme costs",
          "rationale": "Consultant’s selected source and allocation rationale",
          "before": {"sheet": "ACTUAL_EARLIER_SHEET", "cell": "ACTUAL_CELL"},
          "after": {"sheet": "ACTUAL_LATER_SHEET", "cell": "ACTUAL_CELL"}
        }
      ]
    }

The placeholders above deliberately do not identify cells in any unreceived workbook. The browser offers ordinary labeled inputs for these fields.

Save a decision file downloaded from the browser:

    python3 serve.py review --workspace /private/review --case CASE_ID --decisions /private/Workbook_Review_Decisions.json

Replay that **same complete file** after an uncertain call. The request ID returns the original accepted revision. Reusing an ID with changed decisions is rejected. To change an existing decision, create a new named review at the actual current revision; the earlier decision stays in history.

Export to a fresh path:

    python3 serve.py export --workspace /private/review --case CASE_ID --output /private/delivery/Workbook_Review_r2.zip

The CLI prints the actual exported path, byte count, SHA256 and full manifest. It does not overwrite an existing retained delivery.

## Practical review

Package XML and metadata can change when the original spreadsheet application saves. The whole-package change list makes that visible alongside the useful cell and formula comparison. Use the change-type filter to inspect each class, and selected-row acknowledgment for repeated understood package changes. Do not infer a financial amount changed merely because a package part changed.

Named review fields show original values side by side. They do not combine different currencies, financial years or cost bases. If a correction requires changed workbook content, make it in the original workbook application, save a new edition, and receive the new pair. Keep the prior review and its exact originals.

Use private workspaces for client financial files. This local server binds only loopback, uses no analytics and sends no workbook data to a service. Keep ordinary OS access controls and the client’s established storage/retention practice.

## Receiving before customer use

Use the actual original pair and selected mapping. Complete intake, inspect all worksheets represented in the comparison, open relevant named totals/formulas, save an actual named decision, replay it, close/reopen, export, independently receive, and open both original file downloads. Review desktop and narrow views and inspect every page of any separately produced PDF. Keep the full actual result with the original case.

The complete source edition is available at products/cost-workbook-review in the public Merchant repository. Keep all seven files together; SOURCE_MANIFEST.json records their exact byte identities. Read OPERATING.md for the full receiving and handover procedure. Actual workbook runs and customer deliveries belong to their selected original inputs and returned execution results.
