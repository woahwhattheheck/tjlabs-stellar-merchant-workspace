# Telemetry Comparison Workspace

A complete source-preserving file workflow for reviewing supplied model predictions against actual observations. It retains original CSV/TSV/JSON files, explicit site/pod/clock/unit mappings, invalid and duplicate readings, calibration context, actual paired denominators, missing coverage, frozen editions and named review decisions.

The module is read-only. It does not connect to building controls, train a physical model, send a work order or verify energy savings. Thresholds are supplied review criteria. The authored example is separate from the empty workspace.

Start with docs/CONTRACT.md and docs/NATIVE.md. Run node native/telemetry-cli.mjs demo --out NEW_DIRECTORY to materialize the whole example and independently reopen it. The native runtime has no third-party dependencies and uses built-in Node hashing. telemetry/course.mjs contains the actual whole receiving programme; native/run-telemetry-course.mjs runs it with the native runtime.

The report retains every source occurrence and paired row. A candidate with fewer comparable readings cannot silently claim a better full-cohort metric: common-cohort metrics, changed observations, left/right-only coverage and model contexts are all separate.

All source files are complete in source-manifest.json, which excludes itself. Native handoffs include that complete source package, working JSON, originals, full reports and a materialized file index. Private customer inputs belong in a separate authorized workspace.


## Complete offline operator

Open the generated Telemetry_Desk.html for a blank industrial interface, or the separate authored example. See docs/OPERATOR.md and docs/BROWSER_RECEIVING.md for source intake, scope and stream mapping, immutable reports, common-observation comparison, review and exact working/HTML/source/ZIP reopen. Build from this complete source with `node native/build-desk.mjs NEW_Desk.html`; run its production controller receiving with `node native/receive-operator.mjs NEW_DIRECTORY`.
