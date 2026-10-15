# Native Grooming Cycle Workbench

Receive complete original appointment, recurrence, policy, communication and money exports, compare a declared operating day, and return a complete editable desk. The source files establish what was booked, observed, decided and paid. A review records an explanation against that exact source edition.

## Choose the day and source basis

Set explicit `dayStart`, `dayEnd` and `asOf` timestamps, including seconds and UTC offsets. The day can cross midnight. Preserve the actual exported offsets, recorded times and revision IDs. A local recurring appointment after a daylight-saving change must carry its own actual offset in the original expected occurrence.

Use a coherent full source edition. Receive corrected owner exports as a new edition; earlier originals, settings, reviews and pending browser fields remain retained. A source revision is a full replacement within its declared identity, not an extra appointment or an additional payment.

The workbench reads declared recurrence occurrences. A cadence label such as “every four weeks” is descriptive. It does not invent future visits, select a business calendar, assume a reminder language or calculate a cancellation charge from a policy.

## Run the maintained native command

Use Node.js and the complete supplied source directory. All flags have values. Choose a new output directory for each run.

Create a blank study:

```sh
node groom-cycle-native.mjs --new-id salon-cycle-study --label "Grooming cycle study" --out ./new-study
```

Receive thirteen original files into a complete exported browser desk:

```sh
node groom-cycle-native.mjs --workspace ./downloaded-desk.json --command ./receive.command.json --out ./received-cycle
```

Produce a fresh report without a command:

```sh
node groom-cycle-native.mjs --workspace ./received-cycle/workspace.json --out ./read-cycle
```

Record an exact source-bound review:

```sh
node groom-cycle-native.mjs --workspace ./received-cycle/workspace.json --command ./review.command.json --out ./reviewed-cycle
```

Exit code 0 means the read or command completed. Exit code 1 with a published rejected-attempt package means the command was rejected and its diagnostic, readable original bytes and prior accepted workspace were retained. A failure before a valid starting workspace is admitted may produce no package; keep the original selected file.

Output directories and individual members are create-only. Keep the entire generated directory, including its manifest.

## Continue the complete browser workspace

When the input has schema `tjlabs.groom-cycle-desk.v1`, current **workspace.json** preserves that complete wrapper. Its authoritative `workspace` receives the new accepted edition or review. Its `session` remains unchanged: source drafts, unfinished dates, an empty name draft, selected table/edition/resource, source-bound review drafts, notes and original byte receipts all remain literal.

The browser's current edition is deliberately preserved. After reopening native **workspace.json**, choose the newly appended edition explicitly. The old selection and its unfinished review still belong to the old source. The native report and CSVs describe the newest accepted edition.

The browser model is `createGroomCycleWorkspace(api, codec)` in `workbench/groom-workspace.js`. The native entry is `runGroomCycleCLI` in `groom-cycle-native.mjs`; both use the same `createGroomCycleCore({codec})` implementation. A bare core input remains supported; it naturally has no browser session to preserve.

## Receive all thirteen original tables

Use complete inline `input.sources` or a `sourceFiles` map. File paths are relative to the command file, independently of the terminal's current directory. Each of the thirteen tables is required. A header-only CSV explicitly supplies an empty population.

The complete exact headers are in **INTAKE_CONTRACT.json** and the supplied **examples/sources/** files. The example command **examples/native-receive.command.json** points to those authored originals. Change its identity, dates, settings and file paths to describe the actual selected exports before operational use.

| Source | Required meaning |
| --- | --- |
| resources | Stable resource IDs and kind for groomers and stations, plus original reference. |
| availability | Explicit available or blocked half-open resource intervals. Separate resource buffers stay separate. |
| booking_revisions | Full appointment replacements with stable client/pet and recurrence identity, exact recorded time and status, service interval, assigned groomer/station, buffers, accepted policy, language, currency and authorization. |
| quoted_lines | Signed integer minor-unit amounts attached to the exact booking revision. An absent quote stays unknown. |
| completions | Independent observed appointment work, actual assigned resources, status, start/finish when known, observation time and authorization. An in-progress interval has no invented finish. |
| invoice_lines | Actual appointment/invoice/currency links, signed recorded amount, issued time and reference. An invoice is separate from observed physical completion. |
| payments | Positive received or refunded transaction amounts. A refund references the original receipt and keeps its currency and source identity. |
| allocations | Actual authorized distributions to appointment and optional invoice, with purpose, amount and source reference. |
| series | Source-defined client, pet, service, descriptive cadence and active/paused/ended status. |
| expected_visits | Each explicitly exported occurrence, sequence, zoned expected interval and recorded time. An unbooked occurrence remains visible. |
| policy_versions | Exact service policy identity, terms, recorded time and notice basis. Use elapsed_minutes only for a declared elapsed-minute threshold; business_hours and manual remain manual. |
| decisions | Actual appointment/revision-bound cancellation, rescheduling, no-show, waiver, transfer or other decisions with decided time, notice received when known and retained authorization. |
| communications | Actual appointment/revision-bound message kind, language, scheduled time, sent time where applicable, observation time, outcome and original recipient reference. |

### Appointment, recurrence and policy identity

Rescheduling keeps the same explicit series/occurrence relationship. A cancelled or postponed appointment remains linked to its occurrence, and multiple active appointments for one occurrence remain reviewable. The selected analysis reports the explicit horizon; a later unbooked occurrence is not silently added to today's production.

The accepted policy and acceptance time belong to the exact booking revision. A newly published policy does not replace an earlier accepted one. A decision's notice comparison uses its referenced original revision's start, not the later rescheduled start.

When the notice basis is business hours, retain the source's actual wording and operator decision. The workbench does not substitute elapsed hours for a business calendar. A waiver or transfer decision is an observation; its presence does not generate an invoice, refund, replacement booking or money allocation.

### Communication identity

Keep separate message IDs and their exact appointment revision. “Queued,” “sent,” “delivered,” “failed” and “cancelled” are different observations. Missing language remains unknown; a language mismatch uses the preference retained on that exact revision.

Repeated send/delivery observations are compared using original appointment revision, kind, scheduled instant and recipient reference. Records tied to an earlier changed or cancelled booking remain visible. They do not establish that a later message was withdrawn, or that the client received a replacement.

This native workflow sends no messages. A source-bound communication review changes neither its delivered status nor the original recipient reference.

### Deposits, transfers and refunds

Amounts use integer minor units and remain separate by currency. A recorded USD value of 2500 represents 25.00 from the original ledger; it is not calculated from a public advertised service price or assumed deposit percentage.

Retain one stable receipt ID when credit is carried forward. An authorized allocation transfers that existing receipt; it does not create a second receipt. Refunds name their original received transaction and retain the actual appointment/invoice allocation.

A postponed appointment can retain recorded credit with no active planned occupancy. Show both facts. The review disposition documents why a discrepancy is expected or needs investigation; it never removes the original numeric difference.

## Source-bound review commands

Supported subject types are `booking`, `resource`, `invoice`, `payment`, `allocation`, `series`, `occurrence`, `policy`, `decision` and `communication`. Select the exact original edition and analysis subject ID. The subject is not an arbitrary label.

Use a new review ID with `previousReviewId: null` for the first record. A correction names the immediately preceding review for the same edition, subject type and subject ID. Dispositions are `investigate` and `accept_expected`. Preserve the reviewer, full reason and actual supporting evidence.

The supplied native review example addresses VISIT-A's authored 500-minor-unit quote/invoice difference. It changes no amount. The source receiving journey also records reviews against an explicit unbooked occurrence and an existing message: the occurrence remains unbooked and the message outcome stays unchanged.

Reviews append to history and bind the edition's source hash. Receiving a corrected source edition preserves earlier review history without applying its disposition to different source data.

## Complete native package

| File or directory | Contents |
| --- | --- |
| workspace.json | Current full browser desk when one was supplied; otherwise the current core. |
| core-workspace.json | The same authoritative current core, separately available. |
| original-input-workspace.json | Exact selected input bytes, including BOM and CRLF. |
| original-command.json | Exact selected command bytes, including an unreadable command. |
| attempt.json | Completed/rejected action and its diagnostic. |
| received/*.bin | Exact bytes of every readable source file in that attempt, including invalid UTF-8. |
| originals/edition-*/ | All thirteen original texts for every accepted edition. |
| current-analysis.json | Newest-edition operational and cycle analysis, attention and full review history. |
| complete-report.html | Readable comparison with original sources and complete core. |
| bookings.csv, resources.csv, conflicts.csv | Planned and observed appointments/resources/conflicts. |
| invoices.csv, payments.csv, allocations.csv | Recorded money relationships and separate balances. |
| attention.csv, revisions.csv | Attention and original booking revision selection. |
| series.csv, expectedVisits.csv, policyVersions.csv | Explicit recurrence horizon and policy versions. |
| decisions.csv, communications.csv | Retained decisions and message observations. |
| MANIFEST.json | Every preceding package member's path, byte size and SHA-256. |

Derived CSV text is protected for spreadsheet use. Exact original source CSVs remain unchanged.

The wrapper's `nativeContinuation` retains the parsed command where readable, original command bytes, attempt state, full received file receipts and the complete preceding continuation. The browser exposes this material and retains the prior complete desk before clearing that visible continuation.

## Rejected intake and continuation

Read **attempt.json** and the browser's Native continuation section. A rejected receive keeps the accepted core and every unfinished browser field. Malformed source bytes remain attached even when no valid text can be accepted.

Correct the original file or prepare a new command and choose a new output directory. A corrected accepted source becomes a distinct immutable edition. Keep the rejected package as the record of that earlier attempt.

An unreadable command has no parsed command object, but retains its exact bytes and prior continuation. A read-only report run preserves this chain. If the starting workspace itself fails decoding or core validation, preserve that exact file and continue from its original producing workflow.

## Authored operating example

The supplied example has three series and four explicit expected visits. VISIT-A moves from 09:00 to 10:00, keeping occurrence O-A2. Its accepted POL-24 remains the basis despite the separately recorded POL-48. The 1 November noon notice is 1,260 elapsed minutes before the original 2 November 09:00 start, inside the declared 1,440-minute threshold. The original no-new-charge authorization remains unchanged.

O-A3 is explicitly expected on 30 November and has no booked appointment. VISIT-C is postponed with its original occurrence retained; its policy uses business hours, so the notice disposition stays manual. No recurrence is generated from the cadence label.

VISIT-A's original quote is 9000 minor units and invoice is 9500. The difference is 500; its allocated receipt is 2500, leaving 7000 invoice balance. VISIT-C's separate 4000 credit remains allocated without an invoice. These are different questions and are not combined into one “paid” status.

The source messages include two earlier-revision English reminder records, a Spanish confirmation on the later revision, an advance pickup notice and an overdue queued reminder for a postponed visit. Original IDs, language and outcomes remain retained.

These examples are authored operating cases. Actual salon or mobile-groomer observations enter through complete original exports.

## Run the same native receiving journey

```sh
node receiving/run-groom-native.mjs --out ./native-receiving-new
```

The runner uses the actual CLI, core and complete browser model. It receives all thirteen files, preserves unfinished source/settings/review/name fields and malformed receipts, appends source-bound booking/occurrence/communication reviews, retains source and command rejection, reads the complete current continuation, rejects output overwrite and verifies every package member.

The retained source-course result executed those same production functions with explicit in-memory file/path ports: nineteen checks and 347 generated manifest members. Native execution uses the supplied Node runner. The existing equipped receiver continues the browser chapter in **WORKBENCH.md** on its original page, then opens the real desktop/narrow screens and complete downloaded JSON, CSV, HTML and original files.
