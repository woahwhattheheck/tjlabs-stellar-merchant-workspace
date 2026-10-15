# Marine Job Workbench — native continuation

## Purpose and opening

Use the native runner to receive a complete set of original marine job records, retain a source-bound review, or publish a complete report package from an existing working copy. It operates on the same core as the browser workbench.

The current `workspace.json` is the continuation file. When the input is a complete browser desk, the output keeps that complete desk, including unfinished source fields, selected edition and job, selected customer handover, review drafts, original file receipts, working notes and the full ordered native command history. A separately emitted `core-workspace.json` contains the accepted calculation model.

A job quote, actual internal cost, billable amount, invoice and payment balance answer different questions. Inspect them separately. Weekly technician approval and an external accounting result also have their own source records. Customer handovers contain an explicitly selected set of retained versions; the full operating archive contains internal records.

The authored worked example is for learning the workflow. Enter actual boat, customer, job, technician, quote, time, material, invoice and accounting identities from the authorised source owner when commissioning a real study.

## Run requirements

Use a current Node.js installation with built-in ES modules and filesystem APIs. The package includes its codec, core, model, command runner and receiving course. It needs no installed npm dependencies or provider credentials.

Run from the materialized product directory. Keep the entire directory together: `marine-job-native.mjs`, `marine-job-core.mjs` and `vendor/archive-codec.mjs` are direct module dependencies. `workbench/marine-workspace.js` is the actual browser workspace model used by the continuation course.

Every command writes a **new output directory**. Choose a different directory for each receive, review or report operation. Existing output directories are refused, preserving their saved files.

To publish the current report from a complete browser download:

```sh
node marine-job-native.mjs --workspace Marine_Job_Workspace.json --out marine-report
```

To start a separately named core study:

```sh
node marine-job-native.mjs --new-id marina-intake --label "Marine job intake" --out marine-new
```

The new-study command creates an accepted core without browser session fields. For a workflow that already has unfinished browser work, begin with its complete browser download.

## Receive all nineteen original families

A receive command names a new immutable edition and supplies explicit offset-bearing day bounds and an observation cutoff. Source paths are resolved relative to the command file. Preserve each original filename in its `name` field; the source bytes and their SHA-256 travel in the resulting native receipt.

```json
{
  "action": "receive",
  "input": {
    "id": "yard-day-source-2",
    "label": "Second retained yard-day source",
    "receivedAt": "2026-11-02T18:00:00+13:00",
    "settings": {
      "dayStart": "2026-11-02T00:00:00+13:00",
      "dayEnd": "2026-11-03T00:00:00+13:00",
      "asOf": "2026-11-02T18:00:00+13:00"
    },
    "notes": "Actual source-owner intake notes."
  },
  "sourceFiles": {
    "resources": {"path": "source/resources.csv", "name": "resources.csv"},
    "availability": {"path": "source/availability.csv", "name": "availability.csv"},
    "booking_revisions": {"path": "source/booking_revisions.csv", "name": "booking_revisions.csv"},
    "quoted_lines": {"path": "source/quoted_lines.csv", "name": "quoted_lines.csv"},
    "completions": {"path": "source/completions.csv", "name": "completions.csv"},
    "invoice_lines": {"path": "source/invoice_lines.csv", "name": "invoice_lines.csv"},
    "payments": {"path": "source/payments.csv", "name": "payments.csv"},
    "allocations": {"path": "source/allocations.csv", "name": "allocations.csv"},
    "vessels": {"path": "source/vessels.csv", "name": "vessels.csv"},
    "time_versions": {"path": "source/time_versions.csv", "name": "time_versions.csv"},
    "material_versions": {"path": "source/material_versions.csv", "name": "material_versions.csv"},
    "media": {"path": "source/media.csv", "name": "media.csv"},
    "handover_records": {"path": "source/handover_records.csv", "name": "handover_records.csv"},
    "handover_events": {"path": "source/handover_events.csv", "name": "handover_events.csv"},
    "week_periods": {"path": "source/week_periods.csv", "name": "week_periods.csv"},
    "week_submissions": {"path": "source/week_submissions.csv", "name": "week_submissions.csv"},
    "week_events": {"path": "source/week_events.csv", "name": "week_events.csv"},
    "accounting_requests": {"path": "source/accounting_requests.csv", "name": "accounting_requests.csv"},
    "accounting_events": {"path": "source/accounting_events.csv", "name": "accounting_events.csv"}
  }
}
```

The dates above illustrate the explicit settings format. Supply the actual operating day and observation cutoff for the records being compared. Day bounds are limited by the core contract; the weekly period is a separate explicit source record.

Save the complete command as `receive.json`, then run:

```sh
node marine-job-native.mjs --workspace Marine_Job_Workspace.json --command receive.json --out marine-received
```

Every declared table must be supplied. A table with no records still has its exact declared header. Use the current `INTAKE_CONTRACT.json` or `core.columns` for the full column list. CSV columns and identifiers remain literal; explicit arrays within CSV cells use proper CSV quoting.

| Source family | Meaning in this comparison |
| --- | --- |
| resources and availability | Named technician, vehicle and other declared resources; actual open or unavailable windows. |
| booking_revisions and quoted_lines | Versioned boat/job booking, customer, assigned resources, declared buffers, currency and the quote attached to the exact booking revision. |
| completions | Observed job outcome and actual start/finish, independently retained from planned booking time. |
| invoice_lines, payments and allocations | Original issued charges, receipts/refunds and explicit authorised application to the exact job/invoice. |
| vessels | Exact boat/customer identity and source-system identity. |
| time_versions | Technician entry versions, predecessor, interval, explicit breaks, separate cost and bill rates, observation time and status. |
| material_versions | Versioned material quantities in thousandths of a declared unit, independent cost/bill rates and exact correction history. |
| media | Exact job/revision, captured and observed times, source reference and supplied artifact hash. |
| handover_records and handover_events | Explicit selected time/material/media versions, recipient and customer notes; independently observed send/transport/acknowledgement events. |
| week_periods, week_submissions and week_events | Explicit technician/week boundary, exact submitted time-version membership and observed approval/rejection/withdrawal history. |
| accounting_requests and accounting_events | Exact invoice or weekly-submission request, retained supplied payload hash and independently observed external outcome. |

## Read the operating comparison

Start with `complete-report.html` and `current-analysis.json`. The native report follows the latest accepted edition, while the complete browser session retains its prior selected edition. After opening the resulting `workspace.json` in the browser, choose the newly appended edition when you want to inspect that result. Existing unfinished review drafts remain attached to their original edition and subject.

### Time, materials and job cost

A final time entry uses its exact elapsed seconds less the declared break. Separate hourly cost and bill rates produce separate amounts; rounding is per entry to the currency's supplied minor-unit representation using the core's stated half-up rule. A running entry keeps its unfinished interval and unknown accrued amount. A missing rate remains unknown, while an explicitly supplied zero rate remains zero.

Materials use `quantity_milli`: an integer number of thousandths of the declared unit. A correction retains the original entry and its predecessor chain. Different units are not implicitly converted, and a voided version does not silently erase its earlier source.

The job comparison keeps known cost subtotal, unknown contributors, billable amount and quote relationship visible. It separately retains the issued invoice, its explicit payment allocations and unallocated credit. An accounting success does not create a payment or convert a quote into revenue.

### Weekly submission and approval

Each week names one technician and explicit offset-bearing boundaries. Its `boundary_basis` records the source owner's convention. A submitted week lists exact time-version IDs. An approved historical submission remains tied to those versions even if a later source corrects an entry.

Inspect both the submitted duration and the current entry comparison. A stale marker identifies changed current time that needs a separate new submission or source-owner decision. A review note preserves the issue; it does not change the submitted membership, supply approval or imply a payroll export.

Accounting requests for timesheets reference the exact submission. Review the observed external result independently from the internal approval event. An uncertain result stays an uncertain result until an actual source event resolves it.

### Customer handovers

The directory `selected-customer/` contains one standalone customer preview for each visible explicit handover. `INDEX.json` binds its filename to the exact edition, handover ID, recipient and complete source hash. The generated HTML comes from the same selected-content renderer used by the browser. An observed handover whose selected member has not yet been observed is retained in the index with state `not_ready`, a null output path, exact missing IDs and the cutoff reason. The complete internal package remains available; that customer preview can be produced after a new source edition contains the required observation.

A handover includes only its selected time/material/media versions and customer notes. Internal cost/rates, operator reviews, authorisation data, original full source tables and unfinished working drafts stay in the full operating package. Before sharing, inspect the exact selected preview, its named versions and recipient. The directory's README explains this separation.

A later time/material correction does not rewrite a previous handover. Prepare another explicit handover with the intended corrected version membership. Delivery events remain attached to the original handover identity. Acknowledgement and transport observations are separate; a delayed older transport callback does not become a new customer response.

The runner only creates local export files. It does not email the preview, invite a customer, push invoices, approve a week or call Xero.

## Retain a source-bound review

Use the exact `subjectType` and `subjectId` from the selected edition's analysis. Every marine analysis row exposes a stable `key`; review types are published by `core.reviewTypes`. A complete command is:

```json
{
  "action": "review",
  "input": {
    "id": "office-review-1",
    "editionId": "yard-day-source-2",
    "subjectType": "weekSubmission",
    "subjectId": "ACTUAL-SUBMISSION-ID",
    "disposition": "investigate",
    "reviewer": "Actual reviewing operator",
    "reason": "The source owner is checking the corrected entry against the earlier approved submission.",
    "evidence": "Actual retained evidence reference",
    "previousReviewId": null
  }
}
```

Replace the example identity and text with the real selected record. For a correction to an existing review, provide its current `previousReviewId`; the earlier review remains retained. Review disposition documents the handling decision and does not alter source amounts, create an external success or remove a discrepancy.

```sh
node marine-job-native.mjs --workspace marine-received/workspace.json --command review.json --out marine-reviewed
```

## Rejected intake and recovery

The runner reads every available supplied source into a byte receipt before attempting the new edition. If one CSV is malformed UTF-8 or the source contract rejects its content, the current accepted core and browser session remain unchanged. The new output retains the rejected command, all received bytes, its error and the prior ordered native continuation.

An unreadable command also retains its exact original bytes. A report-only run over that current workspace preserves the complete continuation. The actual `attempt.json` and exit status distinguish an accepted receive/review from a rejected attempt; exit code 1 accompanies a rejected command that produced its recovery package.

Correct the source outside the accepted edition, keep the rejected output, and issue a separately named receive command into another new directory. The changed original becomes a new source edition. Do not overwrite the old source bank or edit its manifest to make a changed file appear original.

When the command cannot read the input workspace itself, it stops before a new accepted study is produced. Keep that original file and resolve the read/format issue directly.

## Package contents and continuation

Every successful package includes:

- `workspace.json`: current full desk when the input was a desk; otherwise current accepted core.
- `core-workspace.json`: the authoritative accepted model.
- `original-input-workspace.json`: exact original input bytes when supplied.
- `original-command.json`: exact original command bytes when supplied.
- `attempt.json`: completed or rejected command result.
- `received/`: complete original byte receipts for every supplied source read.
- `originals/edition-0001/` and later edition directories: every retained original CSV, including its BOM and line endings.
- `current-analysis.json`, `complete-report.html` and nineteen derived CSV views when an accepted edition exists.
- `selected-customer/`: explicit handover previews and their exact identity index.
- `MANIFEST.json`: byte length and SHA-256 for every other emitted member.

To continue in the browser, open the complete current `workspace.json`. Full browser export then carries the same accepted editions, source receipts, unfinished form values and command history back to the native runner. Selecting or correcting a later source edition does not move old review drafts to a different source.

## Run the retained receiving course

The package includes `receiving/marine-native-receiving.mjs` and the Node entry point `receiving/run-marine-native.mjs`. It opens the delivered worked browser wrapper through the actual workspace model, receives all nineteen source files, records real source-bound review commands, exports selected customer reports, rejects malformed source/command bytes and reopens the complete current output.

```sh
node receiving/run-marine-native.mjs --out marine-native-receiving
```

The runner requires a new directory. It writes every complete command output and `receiving-result.json`. Its manifest checks read actual emitted bytes. The browser chapter in `WORKBENCH.md` continues the same original workflow through the caller's equipped page, with the downloaded full workspace and customer preview.

The saved result records which actual production bodies were executed and the execution environment. The local Node entry point runs the same functions with real filesystem paths; source execution with an explicit in-memory file port is separately identified in its retained result.
