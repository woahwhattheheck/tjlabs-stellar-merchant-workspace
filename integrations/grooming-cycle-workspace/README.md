# Grooming Cycle Workbench

A complete offline comparison of original appointments, explicit recurring occurrences, accepted policy versions, observed communications and original financial records. The thirteen-table source contract supports one owned operating day and a separately visible recurring horizon.

Open **Grooming_Cycle_Workbench.html** for a blank study or **Grooming_Cycle_Worked_Example.html** for the complete authored example.

- [Full operator, recovery and rendered receiving guide](WORKBENCH.md)
- [Thirteen-table source and API contract](INTAKE_CONTRACT.json)
- [Native continuation and complete receiving](NATIVE_WORKFLOW.md)

The workspace retains exact imported byte receipts, malformed incoming files, immutable source editions, source-bound reviews and corrections, and unfinished name/time/source/review drafts. Browser saves compare the accepted head atomically and keep competing proposals. Complete JSON and working HTML remain portable. Native continuation preserves the full browser session, exact command, original input and retained source receipts.

## Actual operating distinctions

Recurring enrollment and expected occurrence dates are supplied explicitly. The model does not generate a schedule. A changed appointment remains bound to its client, pet, service and occurrence. The accepted original policy is retained even if a newer policy exists. Elapsed notice can be compared numerically; business-hours or manual terms remain for operator interpretation.

Messages retain actual language, appointment revision, scheduled time and observed outcome. Sent and delivered are distinct. Old-revision, repeated, overdue or mismatched-language records remain visible. Advance pickup notices may be intentional and must be interpreted against the original communication.

Planned resource windows and buffers remain separate from observed work. Occupancy crossing an operating-day or availability boundary stays visible. Original completion snapshots do not invent a later finish.

All monetary values are exact integer minor units, with currencies separate. Invoice-linked settlement and unapplied deposits are distinct. Refunds reduce available credit; payment/job mismatches stay attention. Recorded cancellation or postponement preserves original balances and never creates an automatic fee.

## Build and continue

~~~sh
node build.mjs NEW_DIRECTORY
node groom-cycle-native.mjs --workspace complete-desk.json --command command.json --out NEW_DIRECTORY
~~~

Native output keeps the previously selected edition and every unfinished form. Explicitly select the appended edition after opening its current workspace.json.

The retained actual controller and native courses use production implementations with explicit file/storage adapters. Run the native receiving course and controller course through their ordinary entry points:

~~~sh
node receiving/run-groom-native.mjs --out NEW_DIRECTORY
node receiving/run-controller-course.mjs NEW_DIRECTORY
~~~

Read the full rendered receiving chapter in WORKBENCH.md to open and operate the exact blank/worked applications, view desktop and narrow screenshots, inspect downloaded reports/CSVs and reopen complete outputs. Source-adapter results are labeled separately from that actual browser operation.

The package uses built-in browser and Node functionality. Original scheduling, signed policy, message, invoice and payment sources remain the authorities.

The independently retained seven-case cycle receiving result covers accepted policy, future communication exclusion, equivalent offsets, duplicate occurrence coverage, duration changes, cross-pet rejection and edition-bound review corrections. Its source and actual result are in receiving/grooming-independent-course.js and receiving/grooming-independent-result.json.
