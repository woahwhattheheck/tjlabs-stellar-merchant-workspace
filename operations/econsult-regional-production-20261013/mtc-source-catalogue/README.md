# MTC published regional-growth source import

This package joins the maintained research catalogue in an existing economic project. It contains three complete catalogue definitions, one research-product definition, the complete 28-value source-labelled table JSON, all 28 values in a long-form CSV, the catalogue's exact 12-column import CSV and the original-project receiving programme.

## Source roles

1. Original agency forecast attachment: 17 December 2024; two-page PDF, 152,937 bytes. Table 1/page 2 has seven years and four series.
2. Original agency FAQ: 12 February 2026; four-page PDF, 777,707 bytes. Methodological context for adopted Plan Bay Area 2050+ and the next major 2060 cycle.
3. Complete Table 1 transcription: 3,946-byte JSON, SHA256 6fce41e3b42febfc38eedb96f79400f7a1745c635d963571349eb50855e81e7c. Source-labelled structured representation, retained separately from the original PDF.

All years, units and the nine-county regional aggregate remain explicit. No county allocation is inferred. Publication values retain their historical/forecast meaning; 2020/2025 are not indiscriminately recast as observations. Four 2025-to-2050 change calculations in the JSON are explicitly derived arithmetic. The source also names 2023 as a plan base year although its published table starts in 2020.

The issued 2060 RFP, current addenda, submission deadlines and contract clauses are separate procurement inputs. This import does not populate them from secondary index summaries.

## Retained original files

The current input includes the exact three stable attachment references and original upload IDs. Resolve each stable reference through the existing Notion file-download action immediately before downloading. Keep the two PDF filenames in catalogue-input.json. The table JSON is already included in this package.

The source PDFs were durably received through the public-source attachment route. Their recorded byte counts are observed; PDF SHA256 is deliberately null until complete original bytes are locally received. The programme checks each original's full byte count and PDF signature, computes SHA256, and durably fixes those hashes together with the original project identity before any catalogue mutation. A later invocation must preserve the same hashes. Source upload time represents this local receiving event; it does not fabricate a historical publisher HTTP response or claim the publication date is the acquisition date.

## Run inside the original maintained application

Materialize all six package files together with the complete original PDF receiving programme. Receive the two retained original PDFs into one private directory. Use the existing maintained FRED root and the existing fully received project:

```bash
node import-mtc-sources.mjs \
  --fred-root /path/to/application/stellar/scf-starforge-20261009/sf30-seller-sdk/fred \
  --project /path/to/existing/economic-project \
  --directory /path/to/mtc-source-receiving \
  --originals /path/to/original-mtc-pdfs
```

The programme imports all three definitions, uploads all three full original representations using the native research-source-upload action, and saves the complete source-qualified research product. It re-downloads every retained source through the original project API and compares all bytes. It then exports the full economic project and complete catalogue CSV, receives that exact whole project into its own content-addressed receiving directory, reexports it, compares every complete project member and reopens all three original sources through the received project. Existing QCEW captures, regional calculations, customer history and unrelated research remain part of that same project.

Actions have original operation IDs and complete requests saved before dispatch. A confirmed pre-commit revision conflict can retain a new immutable dispatch-revision record under that same ID and body only after rechecking that no unrelated action is pending and the original selected source/product assumptions still hold. Completed and pending originals follow their existing journal records. The maintained project transaction owns the revision/lease and replay. A transport interruption resumes the same command/directory/input/source files. Do not create a second project or regenerate operation IDs. If another owner changed the selected source definition, preserve that edition and reconcile the same import before continuing. Existing source review and product-issue controls remain the place for actual source review and an issued edition. Original received source IDs come from their completed upload operations, so newer legitimate captures and selected definitions remain preserved on replay. The final catalogue view, CSV and full source verification are derived from one complete exported project revision.

The receiving directory contains source-selection.json, every original request under actions/, content-addressed full-project/CSV exports and receiving-result.json. Complete export files publish only after full temporary-file write and sync, and identical receiving reuses the original bytes. Final receiving-result.json names the exact full project, independentReceiving directory and reexport, and source identities. Repeating a completed import preserves the original full receipt when the whole project and independent receiving identities are unchanged.

## Existing UI and CLI without the programme

The original Research catalogue can import catalogue-definitions.csv directly. Its exact columns are entryId, title, publisher, url, kind, topics, geographies, cadenceDays, expectedRelease, licence, notes and retired. Topics/geographies are JSON arrays inside CSV cells. The table-value CSV is an analytical long-form export, not the source-definition import CSV.

The maintained command accepts a complete research-import request containing definitions from catalogue-input.json. Source upload requests bind entryId plus the returned current definitionId, original filename/media type, complete bytes and a retained acquisition timestamp. Product creation uses research-product-save with the complete input product.

## Actual rendered inspection before presenting

Open the actual resulting project in its existing Research view, inspect all three populated source rows and their different roles, the source-gap/product panel, original PDF/JSON downloads and full export/reopen. Inspect real desktop and narrow-view pixels; use the important controls and repair clipping, unreadable tables, broken files or overflow in the maintained source. Check the two source PDF pages and four FAQ pages when confirming their scientific review. Before calling a client-facing result ready, visually inspect its actual exact version; code/schema checks and captured-but-unviewed screenshots do not replace this.

## Complete company integration

The company controller accepts --mtc-originals ORIGINAL_PDF_DIRECTORY together with --research-catalogue --research-agent. It continues the existing ROOT/research/project after the full customer-agent workflow, receives this complete MTC selection and returns the independently received whole project as completeCustomerProject. The same company root retains the original source, both regional report editions, all Research histories, full MTC sources, import requests, independent receiving and complete archive. Continue the same original operation and source selection after interruption.

Native request IDs are deterministic mtc- identifiers derived from the original operation and step name. Any saved precommit request using the predecessor colon form retains its exact original bytes before an ID-only correction. Complete original bodies and expected revisions remain in the same native request history.


## Inspect the actual delivered application and reports

Before presenting this customer-facing workspace, report, PDF or export as ready, the producer opens or renders the exact outgoing version, looks at its actual screens or screenshots, and operates the important controls. This requirement applies to current, future, resumed and delegated workers across providers and local or cloud runtimes.

For this programme, inspect both populated regional report editions and their complete PDFs, the source catalogue and its two issued research products, and the reopened complete customer project. Use the actual presentation width and a narrow/mobile width. Operate source selection, report navigation, catalogue review, file attachments, CSV download and reimport, full-project export and reopening. Inspect the relevant empty, loading and error states as well as populated screens. Open the final attachments and exports so missing files, clipped tables, broken links and unreadable pages are repaired before delivery.

Capture desktop and narrow-width screenshots with the existing receiving programme and return the actual images and rendered report pages to the producer in the original company thread. The producer must view those images; capturing them alone, code review, DOM counts, HTTP success, unit checks or another worker's approval do not replace seeing the rendered product.

Fix visible and functional faults in the authorized source and repeat only the affected receiving step with its existing operation identity. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve the original data, calculations and complete project. Keep inspection tied to actual repairs; avoid broad suites, repeated checking or a separate verification product.

Carry this complete requirement into assignments and the active build and receiving guidance used by every delegated worker. Preserve the original operation, retained directories, completed work and other owner controls. Historical records and third-party policies retain their original form. Use existing workers without forced restarts or new watchers. If the local runtime is unavailable, give the existing equipped receiver the complete exact version and these opening steps, review its actual rendered results, and continue independent implementation while it runs.

Owner instruction: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999

