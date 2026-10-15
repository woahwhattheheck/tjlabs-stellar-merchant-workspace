# Repair Queue Workbench

A complete source-preserving repair intake and notification-receiving workspace. Open `Repair_Queue_Workbench.html` for a blank working copy, or `Repair_Queue_Worked_Example.html` for the clearly authored example. Both are self-contained offline applications.

The workbench keeps full original CSV text and imported file bytes, literal column/status mappings, immutable named source editions, review corrections, actual application observations and unfinished forms. It compares stable repair references across complete previous/current sources and keeps duplicate, missing and changed-contact cases visible. The UI includes paged queue review, original source downloads, ordinary reports/CSV/JSON and independent saved-copy recovery.

## Source contract

Read [GENERIC_WORKBENCH.md](GENERIC_WORKBENCH.md), [QUEUE_GUIDE.md](QUEUE_GUIDE.md) and [the public technical contract](official/intake-contract.json). Required fields are original repair reference, customer name, customer email and item. Optional values retain their exact original text. The programme is grounded in the linked published import rules: initial import is silent; later new rows/status changes may be candidates; note-only changes are distinct. Source authority and notification preferences are explicit. Canadian SMS eligibility requires declared recipient country, recorded consent, appropriate phone and funded credits. A changed phone or device identity requires investigation.

Candidate channels are preparation results. Separate observed outcomes retain the actual source/provider reference and recorder; no outbound message or private product API is executed by this workbench. A review does not delete an original discrepancy. Corrected sources become new editions.

## Build and native continuation

Node 20+; no package installation is needed for core/CLI/build.

```sh
node build-workbench.mjs NEW_APP_DIRECTORY
node cli.mjs receive --input examples/intake.json --out NEW_OUTPUT_DIRECTORY
node source-course.mjs
```

Continue with `--workspace` pointing to a complete core workspace or the browser's complete `tjlabs.repair-queue-desk.v1` export. The native output keeps the original input wrapper, all source CSVs, full workspace, comparison, report and manifest. Output directories and files are create-only. Review or observe with `--input RECORD.json` and an existing workspace. The UI build uses the same maintained source and callback substitutions, retaining arbitrary literal source safely.

The browser uses IndexedDB for transactional saved-head and independent proposed-copy retention. Export the complete working file for portability. When storage is unavailable, retain the current complete export and explicitly confirm it before adopting another state. Imported UTF-8 bytes, including rejected original bytes, remain available for recovery.

## Authored receiving example

Four old rows and four current rows produce five distinct references: one new, one status change, one note-only change, one unchanged and one missing. The declared Canadian configuration yields two email candidates and one SMS candidate. Initial-import mode yields none; US configuration removes the SMS candidate. Corrections retain prior records. The included example contains controlled example.com contacts and is not customer performance data.

## Product inspection

Use the repository's complete AGENTS.md rendered-product instruction and the maintained browser receiving chapter. Open the exact generated app, exercise source intake and recovery, inspect desktop and narrow views, download/reopen the whole workspace and readable report, and inspect the actual screenshots. Source-function execution is recorded separately from a rendered receiving return. Existing host and operation ownership remain in place.

## Source and licensing

The generic package contains technical source, public format rules and authored examples. All original working records remain in the operator's private exported workspace. Public product references are identified in the technical contract. The containing repository's MIT license applies to original TokenJunkieLabs code; retain its license and applicable source notices with distributions.
