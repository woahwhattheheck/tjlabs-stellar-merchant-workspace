# Technician Day Workbench

A complete offline study of one owned operating day: original and revised appointments, declared technician/bay availability and buffers, independent completion snapshots, revision-bound quoted amounts, invoice lines, original payments/refunds and explicit allocations.

Open **Technician_Day_Workbench.html** or **Technician_Day_Worked_Example.html** directly. The authored example retains a changed appointment, separate planned and observed overlaps, a blocked lunch interval, an original invoice difference and a weather-postponed job's unapplied deposit.

- [Browser operation, source recovery and rendered receiving](WORKBENCH.md)
- [Exact eight-table source and API contract](INTAKE_CONTRACT.json)
- [Native continuation and receiving](NATIVE_WORKFLOW.md)

The workbench preserves original byte receipts, malformed imported files, immutable source editions, review corrections and unfinished name/source/time/review drafts in complete JSON or working HTML. Browser saves compare the accepted head atomically and retain competing proposals. Native continuation keeps the entire browser session, exact command and source receipts in create-only output.

All amounts are exact integer minor units with separate currencies. Invoice-linked balances and unapplied deposits remain distinct. Original refunds reduce available credit; source-mismatched refund/job allocations remain attention. Time is expressed with explicit offsets; only declared travel/access buffers are used. No automatic fee or route is derived from policy prose.

Regenerate the two applications with:

~~~sh
node build.mjs NEW_DIRECTORY
~~~

Continue an actual complete desk through the original native command:

~~~sh
node detail-day-native.mjs --workspace complete-desk.json --command command.json --out NEW_DIRECTORY
~~~

A successful appended source edition preserves the previously selected edition and unfinished forms. Explicitly select the new edition after reopening its current workspace.json.

The existing source course runs with:

~~~sh
node receiving/run-source-course.mjs NEW_DIRECTORY
~~~

It preserves its complete authored originals, three source editions, transfer/refund comparisons and review corrections. The browser controller course separately exercises actual handlers through explicit file/storage/DOM adapters. Use the full receiving chapter to open and operate the exact applications at desktop and narrow width, view captured screenshots, open actual downloads and continue the full returned workspace.

The package uses built-in browser and Node functionality. Existing booking, field, invoice and payment systems remain the original authorities.
