# Pool Route Workbench — complete native workflow

The native runner continues the same retained-source study used by the offline desk. It receives original exports, compares one explicit source edition, records attributed review notes and writes a new complete output directory. The current browser session and original imported bytes stay with the accepted study.

## Start from a complete working copy

A desk file has schema `tjlabs.pool-route-desk.v1`. It contains the core workspace, all nineteen unfinished source drafts, selected edition, review drafts, working notes, original imported-byte receipts and any previous native continuation. The runner also accepts a core-only `tjlabs.pool-route-study.v1` file for an integration that intentionally has no browser session.

Export the complete JSON from the desk before running a command. Keep that original input. Each command writes into a new named directory; it refuses to overwrite an existing directory.

```sh
node pool-route-native.mjs --workspace /absolute/study/complete-desk.json --out /absolute/study/report-001
```

Create a new empty study:

```sh
node pool-route-native.mjs --new-id pool-study-001 --label "Selected pool service records" --out /absolute/study/new-study
```

Use absolute paths for workspace and output. Source-file paths in a command resolve relative to the command file.

## What remains together

When the input is a full desk wrapper, current `workspace.json` remains a full wrapper. Its accepted core advances only after a successful command. The session stays exact, including incomplete timestamps, source text, selected old edition, blank labels and unfinished review reasons. `core-workspace.json` separately exposes the accepted core. `original-input-workspace.json` retains the exact original input bytes.

A native attempt retains its parsed command when readable, original command bytes, received original files, accepted or rejected result and previous continuation. Malformed source and command bytes remain available for repair. A rejection leaves the prior accepted core and unfinished session intact.

After a native receive, explicitly choose the newly appended edition in the browser. The runner preserves the old selection so unfinished review fields remain bound to the source they describe.

## Nineteen source families

Use the current `POOL_ROUTE_INTAKE_CONTRACT.json` and `core.columns` for exact columns. These are independent comparison inputs; the package does not assert that the software vendor exposes an identical API or import format.

| Family | Source meaning |
|---|---|
| resources | Original technician and vehicle identities |
| availability | Declared available/unavailable windows |
| booking_revisions | Full original visit revisions, pool/customer/property, resources, timing, buffers and authorization |
| quoted_lines | Quote amounts bound to the exact booking revision |
| completions | Independent observed physical completion and actual intervals |
| invoice_lines | Issued customer job invoice lines |
| payments | Actual receipts/refunds, method and currency |
| allocations | Explicit authorized job/invoice allocations |
| pools | Stable original pool/customer/property and source identity |
| pool_statuses | Active/paused/inactive state with separate effective and observed times |
| expected_visits | Actual source-declared occurrence and due window |
| route_stops | Original route sequence bound to exact booking revision and optional expected occurrence |
| service_versions | Captured/observed service version, full original work JSON and separate notes |
| readings | Literal analyte, value text, unit, method and measurement/observation times |
| media | Original media reference, optional digest, capture/observation and caption |
| report_artifacts | Exact service version and explicit reading/media membership |
| report_deliveries | Exact report, recipient/channel and actual submission/observation |
| delivery_events | Sent/delivered/failed/bounced/acknowledged outcome with evidence |
| billing_periods | Explicit period/counting observation and supplied platform/per-pool rate basis |

Provide all nineteen CSVs for each received edition. A family with no selected records is an explicit header-only file. A missing file is not silently interpreted as an empty source.

Keep original UTF-8 bytes, including BOM and CRLF. The runner retains each file receipt and exact accepted source text. Invalid UTF-8 remains in the rejected package as original bytes; it is not normalized into a replacement source.

## Define the source window

The receive input supplies `dayStart`, `dayEnd` and `asOf` with full dates, seconds and UTC offsets. These are the operator's actual source observation boundaries. Keep capture, effective, measurement, creation, submission and observation times distinct.

A pool status requires its effective and observed times to be visible before governing the selected observation. Expected visits are actual source occurrences; the model does not manufacture dates from a phrase such as weekly service. A route stop preserves the selected booking revision and original sequence. Compare actual observed order only within the relevant technician/route; the study does not derive travel distance or road time.

## Receive an edition

The package's `examples/native-receive.command.json` lists all nineteen source-file entries. Copy that complete example, assign a new edition ID and replace the metadata and file paths with the selected originals.

The command has `action: "receive"`, an `input` object containing `id`, `label`, `receivedAt`, `settings` and `notes`, and a `sourceFiles` object. Each source-file entry has its literal table name and `{path,name}`.

For example, the readings entry is:

```json
{
  "readings": {
    "path": "original-exports/readings.csv",
    "name": "original-readings.csv"
  }
}
```

This is one entry in the complete nineteen-source command. Keep all other entries from the supplied example.

```sh
node pool-route-native.mjs --workspace /absolute/study/complete-desk.json --command /absolute/study/receive.json --out /absolute/study/receive-002
```

A successful receive appends an immutable edition. The original prior editions and review history remain. Editing the source draft in the browser affects a proposed next edition; it does not rewrite an earlier accepted original.

## Read service, report and delivery together

Follow the stable customer/pool/property identity through the booking, explicit expected occurrence and route stop. A source field disposition such as final remains separate from independently recorded physical completion.

Service versions retain a complete predecessor chain. Customer notes and internal notes remain distinct. Readings preserve original `value_text`, analyte, unit and method. A literal value such as `0.0500`, a qualifier or an instrument phrase remains the original recorded text. The study does not reinterpret it as a dosage, threshold, conversion or safety determination.

Media records preserve their original reference and optional source-reported digest. An unseen image is not verified merely because its digest is present. The report artifact lists the exact readings and media from its precise service version. Later readings, media or corrected service text cannot silently enter the older report.

A delivery identifies the exact report, recipient, channel, submission and observation. Every event retains its own occurrence time, observation time and evidence reference. Among events visible at the study's as-of point, the overall latest-event status follows occurrence time. Transport outcome and recipient acknowledgement also retain independent current event IDs, evidence and occurrence/observation times. A later transport event therefore leaves the earlier acknowledgement visible. The last-observed event remains separately visible, so a delayed older callback cannot erase a newer occurred outcome.

Keep the original delivery result even when a later report is corrected or resent. The comparison does not send reports or customer messages.

## Keep subscription counts separate from customer money

Each source billing period supplies start, end, counting time, observation time, currency, platform amount, per-pool amount, exclusions and rule reference. Monetary values use integer minor units.

For a full-month comparison, the actual supplied rates govern. A provided-prorated basis also needs the original proration reference; the workbench does not invent a trial adjustment or calculate a vendor charge.

Count distinct eligible pools from the actual selected booking or independently completed visit in the declared period. A bare expected recurrence is not a scheduled job. Source-excluded states remain excluded. A missing effective status makes the comparison incomplete rather than silently active.

The resulting subscription comparison is distinct from customer service invoices, receipts, refunds and allocations. A subscription count does not create an invoice. An invoice link does not prove payment, and unallocated credit is not automatically assigned to a job. Keep explicit currencies separate.

## Record a source-bound review

Select the exact edition, subject type and source ID from the current analysis or browser subject selector. New pool/service/report/billing rows expose a stable `key`.

A review command has this shape:

```json
{
  "action": "review",
  "input": {
    "id": "review-002",
    "editionId": "source-edition-002",
    "subjectType": "reportArtifact",
    "subjectId": "ACTUAL_REPORT_KEY",
    "disposition": "investigate",
    "reviewer": "Actual reviewer",
    "reason": "Describe the exact source issue.",
    "evidence": "Reference the retained report or original record.",
    "previousReviewId": null
  }
}
```

The placeholder in this explanatory example must be replaced with an actual source key. The package's authored review example uses an actual subject from its worked study. A corrected review names the actual previous review ID.

```sh
node pool-route-native.mjs --workspace /absolute/study/receive-002/workspace.json --command /absolute/study/review.json --out /absolute/study/review-002
```

A disposition documents the reviewer’s interpretation of the exact source edition. It changes no source reading, scheduled visit, report member, delivery event, billing count basis or payment. Correct source records by receiving a new complete edition.

## Output and recovery

The new directory contains:

- Complete current `workspace.json` and separate `core-workspace.json`.
- Exact original input and command when supplied.
- The complete attempt result and every received byte file.
- All original source CSVs from every accepted edition.
- Current analysis, full HTML report and nineteen comparison CSV views when the study has an edition.
- A manifest with every emitted member's byte length and SHA-256.

The manifest excludes itself from its own member list. Derived comparison CSVs are outputs; the original input CSVs remain exact sources.

A rejected command returns exit code1 and an attempt with `state: "rejected"`. Read the retained original and diagnostic before preparing a new command. The current wrapper still contains the last accepted study and the rejected continuation.

Create-only output protects earlier directories. If an interrupted write leaves a partial directory, keep it and retry into a new named directory. Do not treat directory creation as an atomic whole-package publication.

## Complete authored receiving course

Run the maintained course with:

```sh
node receiving/run-pool-native.mjs --out /absolute/receiving/new-pool-course
```

The course uses the production core, native runner and actual browser model. It receives all nineteen originals, preserves BOM/CRLF in booking and reading sources, and carries an unfinished setting, raw source draft, review reason, blank name and unreadable receipt through accepted and rejected commands.

It records source-bound service, report, delivery and billing reviews, then confirms all original source editions remain exact. It retains malformed source and command bytes, reopens current outputs through the actual browser model, checks a report-only continuation, refuses an existing output directory and validates the entire emitted manifest.

The saved source execution uses explicit file/path ports. The Node runner and the original caller-owned browser chapter in WORKBENCH.md continue the same operation on the equipped host. Return the complete reopened files and viewed desktop/narrow screenshots with the source identities used for that run.

## Retained production execution

The current complete source course passed 24 checks and reopened all 1,639 emitted manifest members using the production core, native runner and browser model with explicit V8 file/path ports. It carried seven retained source editions into an eighth and preserved all sixteen reviews after the new source-bound notes. The exact incoming desk, accepted and rejected outputs, literal drafts, original source receipts and source identities are retained in `receiving/pool-native-receiving-result.json`. The maintained Node runner uses the same course and real filesystem on the receiving host.
