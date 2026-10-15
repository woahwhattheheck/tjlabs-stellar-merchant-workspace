# Native Technician Day Workbench

This workflow receives complete original exports, compares the declared technician day with observed work and money records, and returns a complete editable workspace. It does not change a booking system or issue a payment.

## Start with the actual day

Choose the explicit operating-day start, day end and analysis time, each with seconds and a UTC offset. The day may cross midnight. Preserve the source's real booking, completion, invoice, payment and authorization timestamps. The tool does not infer travel time, recurring work hours, a time zone, a cancellation fee or a deposit percentage.

Use one complete named source edition for a coherent snapshot. When an owner corrects an export, receive a new edition. Keep earlier exports, settings and reviews; the new edition remains a separate source basis.

## Run the maintained native command

Use Node.js with the complete supplied source directory. The command accepts named flag/value pairs. The output directory must not exist. A successful read or accepted command returns exit code 0; a retained rejected command returns exit code 1 and a complete inspectable package.

Create a blank study:

```sh
node detail-day-native.mjs --new-id shop-day-study --label "Technician day study" --out ./new-study
```

Receive source files into an existing browser workspace:

```sh
node detail-day-native.mjs --workspace ./downloaded-desk.json --command ./receive.command.json --out ./received-day
```

Produce a fresh report and exports without applying a command:

```sh
node detail-day-native.mjs --workspace ./received-day/workspace.json --out ./read-day
```

Receive a source-bound review:

```sh
node detail-day-native.mjs --workspace ./received-day/workspace.json --command ./review.command.json --out ./reviewed-day
```

Keep the entire output directory. Open its current **workspace.json** in the browser desk. When the input was a full `tjlabs.detail-day-desk.v1` file, this current output remains the same full wrapper: the authoritative core is updated, while the complete session, unfinished fields, byte receipts and prior native continuation are retained.

The browser's selected edition is deliberately preserved. After receiving a new edition, choose it explicitly in the browser's edition selector. Existing old-edition review drafts stay bound to their original source. The native report and CSV exports describe the newest accepted edition.

## Receive all eight original tables

A receive command can supply complete inline `input.sources`, or use `sourceFiles` to read the eight actual files. Paths in `sourceFiles` are resolved relative to the command file, independent of the current terminal directory. Each table must be present; a header-only file explicitly declares an empty population.

The supplied `examples/native-receive.command.json` points to the authored source files under `examples/sources/`. Change its edition ID, dates, settings and file paths before using a real export. Keep filenames descriptive and preserve their actual bytes.

| Table | What the original must establish |
| --- | --- |
| resources | Stable technician and bay IDs, kind and source reference. |
| availability | Explicit available or blocked half-open intervals for each resource. Adjacent declared available windows may form continuous coverage. |
| booking_revisions | Full replacements with stable job/customer/vehicle identity, increasing revision and recorded time, exact status and service interval, assigned technician/bay, separate resource buffers, currency and authorization. |
| quoted_lines | Each signed minor-unit amount belongs to an exact booking revision. A missing quote remains unknown. |
| completions | Independent current observation per job: actual assigned resources, start/end where observed, status, observation time and authorization. In-progress work has no invented finish time. |
| invoice_lines | Actual invoice/job/currency links and signed original amounts, including credits. Invoice records do not establish physical completion. |
| payments | Positive recorded received/refund transactions; refunds name the original receipt and retain its currency, method and reference. |
| allocations | Actual authorized distribution of a transaction to a job and optional invoice, with deposit/settlement/refund purpose. A corrected allocation is a new full source snapshot. |

Amounts use integer minor units. A USD amount of 25000 represents the source's recorded 250.00; the tool never creates that amount from a public advertised price. Do not combine currencies or use a positive ordinary receipt for a refund. Keep one stable payment identity when a deposit is retained or reassigned: changing an allocation does not create another receipt.

A postponed booking retains its source history and recorded deposit. Written rescheduling or transfer decisions belong in actual source authorizations and a corrected edition. A review annotation alone cannot move the deposit, change a booking or remove a discrepancy.

## Source-bound review command

Choose the actual edition and subject from the complete analysis. Supported subject types are booking, resource, invoice, payment and allocation. The subject ID must be the exact analysis key for that type; it is not an arbitrary display label.

Use a new review ID. The first review has `previousReviewId: null`. A correction names the immediately preceding review for that same edition/type/subject. Keep the reviewer, actual reason and available evidence in full. Dispositions are `investigate` and `accept_expected`.

The supplied review command is an authored example for JOB-A in the authored received edition. It documents the 1000-minor-unit invoice/quote difference; it changes no amount. Replace its identifiers and explanation with the actual selected source context before operational use.

Reviews are append-only and source-bound. Receiving another source edition does not transfer the earlier review to changed data. Old review history remains available for reading and export.

## What the package retains

| File or directory | Purpose |
| --- | --- |
| workspace.json | Current full browser wrapper when one was supplied, otherwise the current core workspace. |
| core-workspace.json | The same authoritative core, separately available to source-aware callers. |
| original-input-workspace.json | Exact supplied input bytes, including BOM and CRLF. |
| original-command.json | Exact supplied command bytes, including an unreadable or rejected command. |
| attempt.json | Current action, completed/rejected state and diagnostic. |
| received/*.bin | Exact bytes of each readable source file received for this command, including malformed UTF-8. |
| originals/edition-*/ | Every retained accepted source edition, with all eight complete original texts. |
| current-analysis.json | Full newest-edition analysis, attention, review history and source-derived totals. |
| complete-report.html | Human-readable newest-edition comparison with complete original sources. |
| bookings/resources/conflicts/invoices/payments/allocations/attention/revisions.csv | Derived comparison exports. Original source exports remain separately exact. |
| MANIFEST.json | Path, byte size and SHA-256 for all previously listed package members. |

The browser wrapper's `nativeContinuation` retains the full command, its exact bytes, attempt result and received file receipts. Each later command retains the preceding continuation. Existing browser fields remain literal, including unfinished or currently invalid dates and source edits. Those draft fields are distinct from the accepted immutable core.

## Recover a rejected intake

Read `attempt.json` and the visible native-continuation section in the browser. A rejected command preserves the previously accepted core and complete pending browser session. The rejected source bytes and exact command remain attached to the continuation and ordinary package.

Correct the actual source file or create a new command, then choose a new output directory. Do not edit a past accepted edition or reuse an existing output folder. Receiving a corrected file creates a new edition only when the complete source contract validates.

An unreadable UTF-8 command still has its original byte descriptor even though it cannot have a parsed command object. The prior complete continuation remains behind it. A read-only report run preserves that complete chain unchanged.

If an initial workspace itself is not readable or fails authoritative core validation, keep its original file and correct it through its originating workflow. A native validation error does not authorize replacing a different saved workspace.

## Practical authored example

The supplied day has one technician, adjacent availability windows, an explicit lunch block and three jobs. JOB-A moves from 09:00 to 09:30, has a recorded 25000 quote, a 26000 invoice and a 5000 allocated deposit. The 1000 invoice difference and the 21000 invoice balance are different questions and remain separate.

JOB-A's observed completion overlaps JOB-B's independent in-progress start. Buffers are declared separately for each resource. A completed or in-progress actual interval is compared with the original operating day; no finish time is invented. JOB-C is explicitly postponed and retains its separate recorded deposit.

These are authored operating examples. Actual customer day records enter only through the complete eight-table intake.

## Run the same native receiving journey

```sh
node receiving/run-detail-native.mjs --out ./native-receiving-new
```

The runner uses the actual native CLI, core and browser workspace model. It exercises a complete browser wrapper containing unfinished settings/source/review fields and retained malformed bytes, receives eight source files, appends a review, retains a malformed source rejection and malformed command, produces a read-only continuation and verifies every manifest member. It uses a new directory and never launches a browser.

The saved adapter result executes those same production functions with explicit in-memory file/path ports. The existing equipped receiving owner runs the native command and the original supplied-page browser chapter from WORKBENCH.md, then inspects the actual screens and downloaded files. Both paths continue the same product and original sources.
