# Marine Job Workbench

A complete offline operating study for vessel jobs, original quote revisions, technician time, material use, customer selections and weekly approvals.

Open [Marine_Job_Worked_Example.html](Marine_Job_Worked_Example.html) to explore the five-edition authored study, or [Marine_Job_Workbench.html](Marine_Job_Workbench.html) for a blank study. The applications preserve nineteen original CSV families, immutable source editions, attributed review corrections, unfinished forms and complete saved copies.

## Operating flow

Receive the original job, vessel, resource, money, time/material, handover, week and accounting tables together. Compare quoted, supplied cost and billable amounts separately. Running timers and missing rates stay visibly incomplete. Corrected entries preserve earlier submitted weeks and customer-selected records.

The customer handover preview includes only the explicitly selected customer records. The complete internal report retains source history, cost rates and all reviews. A handover with an unobserved selected member is indexed as not ready in the native package while the remaining complete outputs are preserved.

[WORKBENCH.md](WORKBENCH.md) covers the whole browser flow, source intake, saving, conflict recovery and actual rendered receiving. [MARINE_WORKBENCH.md](MARINE_WORKBENCH.md) explains the marine source semantics and worked figures. [NATIVE_WORKFLOW.md](NATIVE_WORKFLOW.md) covers full browser-to-native continuation and selected-customer output.

## Native commands

Use a maintained Node.js runtime with the standard modules used by the entry points. Output directories must be new.

```sh
node build.mjs new-applications
node marine-job-native.mjs --workspace examples/worked-desk.json --out new-export
node marine-job-native.mjs --workspace examples/worked-desk.json --command examples/native-review.command.json --out new-review
node run-operating-course.mjs
node receiving/run-controller-course.mjs
node receiving/run-marine-native.mjs --out new-native-receiving
```

The native `workspace.json` preserves the complete browser wrapper, source receipts, unfinished session and native continuation. Reopen that complete file in the desk; explicitly select a newly received edition. Every emitted member is identified by byte length and SHA-256.

## Maintained source

The engine is `marine-job-core.mjs` with a matching classic browser body. The browser model, store, controller, builder and neutral stylesheet live in `workbench/`. Both codec module forms are included for browser and Node use. `sample/` retains all nineteen original tables, five source editions, selected customer example and authored media/accounting bodies. `examples/` retains complete blank/worked browser wrappers.

The source includes the executed 18-case domain journey, 28 controller paths and 29 native continuation checks. Their saved results distinguish the actual production functions and explicit execution adapters. Use the complete browser chapter to open, operate, download and reopen the exact rendered artifacts in the existing equipped receiving operation.

Repository delivery instructions are in [AGENTS.md](AGENTS.md). Hosted Actions remain disabled. The MIT license is included.
