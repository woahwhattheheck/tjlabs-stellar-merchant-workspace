# CPG costing rehearsal

An offline, source-preserving workspace for reviewing receipt cost, recipe revisions, actual production and channel contribution. The module uses exact rational arithmetic and keeps original records beside every frozen calculation.

## Start

Use Node 20 or later. There are no runtime package dependencies.

```sh
node native/run-costing-course.mjs /new/private/cpg-course
node native/costing-cli.mjs blank /private/blank.json "Selected CPG review"
```

The first command runs the complete authored example and writes its working record, original inputs, reports, comparison and completion inventory into a new directory. Repeating the command against that owned directory validates equal files without replacing different content. The second command creates a separate empty workspace for actual work.

For an existing working record:

```sh
node native/costing-cli.mjs receive /private/working.json /new/private/received-project
```

This independently validates full operation replay and materializes every retained original, frozen input/report, parent comparison and review. See [the complete native workflow](docs/NATIVE.md).

## Offline operator

```sh
node native/build-desk.mjs /new/private/Costing_Desk.html
node native/receive-desk.mjs
```

Open the generated HTML in a current browser. It starts blank; the separate authored example is explicitly labelled. The operator retains unfinished input and mapping text, row edits, selected comparisons and review drafts. Replacement and correction retain the previous session. Complete working JSON and editable HTML reopen the same work.

The builder verifies the selected source manifest and refuses to overwrite an existing output. See [the operator guide](docs/OPERATOR.md) and [complete browser receiving workflow](docs/BROWSER_RECEIVING.md). All runtime code is embedded; no service or hosted account is required.

## What it does

- Retains original UTF-8 or opaque bytes, names, media types and hashes.
- Inspects CSV, TSV and JSON without converting monetary source tokens to binary floating point.
- Maps explicit source columns or pointers; unresolved occurrences are findings.
- Allocates shared landed charges using exact amounts or declared weights.
- Evaluates nested recipe revisions with explicit unit conversions, dates and yield conventions.
- Calculates actual batch costs from receipt lots and upstream batches, exposing aggregate overdraw.
- Distinguishes gross from net-realized revenue and discloses fees already reflected in revenue.
- Freezes named editions with parent, preparer and correction reason; records reviews without erasing findings.
- Compares compatible scopes and preserves mismatched quantities, periods and revenue bases as visible qualifications.
- Reopens the complete immutable source and operation history.

See [the field contract](costing/input-fields.json) and [domain API](docs/CONTRACT.md). Application adapters provide SHA-256, strict UTF-8 and Base64 functions to `createCostingAPI(runtime)`; the supplied Node adapter is [native/runtime.mjs](native/runtime.mjs).

## Authored example

The demonstration data is invented. It includes 100 lb of oats, 200 bags, a shared freight charge, nested recipes, two actual batches and three sales channels. Baseline contribution is exactly 440/3. A corrected oat invoice produces 132 while preserving both editions and all original inputs.

A second comparison records DTC revenue as either gross 150 with 4.50 processor fees and 5 fulfillment, or net-realized 145.50 with the processor amount already reflected and only 5 deducted again. Both give 70.50 contribution.

The dimensional example distinguishes 153 units × 12 oz ÷ 16 × 1.05 = 120.4875 lb from a 95% yield convention, which divides by 0.95. The selected convention stays visible.

## Execution and operating limits

The production-source course has been executed with an explicit V8 runtime adapter. It covers the complete intake, calculation, correction, review and reopening workflow plus meaningful incomplete-source and scope cases. [The retained execution result](commissioning/source-execution.json) identifies that execution surface. The native Node command records its actual version when run; source execution is not a claim of a native Node or rendered-browser run.

Use the complete browser receiving guide when inspecting an operator build. Open the exact outgoing desktop and narrow views, exercise source intake and important controls, and reopen actual exported files before describing that rendered delivery as ready.

The selected records are an analytical scope, not a live inventory, accounting ledger, tax result or production release. Responsible operators retain accounting, production and compliance decisions. Missing inputs remain unknown. No live integrations, ordering, payment or network requests are made by the costing core.

## License

Apache-2.0 under the included [LICENSE](LICENSE), with preserved MIT component notices in [NOTICE.md](NOTICE.md). Preserve source and attribution when redistributing.

## Installed application

Use [OPERATING.md](OPERATING.md) for Applications → CPG costing, the managed private writer, native commands, customer-agent tools and complete recovery/export. [INSTALLED_RECEIVING.md](INSTALLED_RECEIVING.md) carries the native and rendered receiving route.
