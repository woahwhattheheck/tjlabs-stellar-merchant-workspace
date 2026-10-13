# Class Intake: source-to-registration handover

This local operator workbench turns an existing class catalogue and separately received registrations, transactions and instructor confirmations into one reviewable handover. Every input stays unchanged in the SQLite workspace. Explicit column mappings, named catalogue corrections and transaction matches are saved as immutable review editions. An operator can compare editions, prepare a documented CourseStorm catalogue CSV, export the complete source/history packet and receive that packet in an independent workspace.

The application never submits a registration, sends email, executes a payment or refund, changes a bank account, or uploads a class to CourseStorm. Its released/rolled-back states record a named operator's cutover decision. The actual provider action remains with the authorized owner in the original application.

## Run

Python 3.11 or later and its standard library are sufficient. No package installation is required.

    python3 -B server.py --workspace /ABS/PRIVATE/class-intake --port 0

The process prints its actual loopback URL. Open that URL in the existing browser. Keep the workspace on a persistent, private filesystem. The server binds only 127.0.0.1, validates the exact Host and Origin, and requires the current local operator token for mutations. The browser keeps the full unresolved save or receive operation in IndexedDB under the workspace's persistent identity. A restarted server obtains a new token but the same request body/ID and source-selected history can be resumed. Do not expose this local server directly to the Internet.

The source files are class_intake.py, server.py, public/index.html, public/app.js, public/style.css, client.mjs and client.d.mts. The complete engineering journey is operate.py. The factual Berea example is under examples/. No actual student record or payment information is included.

## Source intake and exact mapping

The original raw input may be CSV, a values-only XLSX sheet, or JSON shaped as:

    {"columns":["id","class_id"],"rows":[["registration-1","class-1"]]}

Every cell must be a string. JSON record arrays, automatic date/currency conversion and implicit type coercion are deliberately absent. CSV can have a UTF-8 BOM. An XLSX import requires the exact sheet name and rejects formulas because cached values can be stale. The original workbook is retained unchanged. XLSX row identities use the actual worksheet row numbers, including gaps; cells must agree with their enclosing row and may not repeat a column. Negative or out-of-range shared-string references are rejected. Select the actual Registrations or Transactions sheet explicitly when using a CourseStorm registrations/transactions export.

Each input is limited to 32 MiB and each selected table to 100,000 rows. Portable packets and their expanded contents are limited to 128 MiB. These are explicit application bounds, not measurements of host memory. Private student inputs require an operator-authorized export; the example contains synthetic keys, not customer identities.

Mapping fields select one exact zero-based column index or one explicit constant. The complete header row is retained and must match. Duplicate source headings are safe because the saved selector uses the index. Value translations bind exact original strings to the workbench's vocabulary. UI exact-name suggestions do not take effect until the operator accepts the mapping and saves a review.

Families:

| Family | Required fields | Important optional fields |
|---|---|---|
| catalogue | id, title, schedule, amount, currency | start, end, weekday, capacity, minimum, registration_days, instructor, location, description, price_options, continuous_enrollment, class_type, categories |
| registrations | id, class_id, student_key, status, fee, currency | none |
| transactions | id, gross, refund, currency, status | registration_id, service_fee, student_fee, net, posted_at, payout_id, payout_date, provider_ref |
| confirmations | id, registration_id, status, actor | at |

Catalogue schedules are fixed or flexible. Fixed dates require full offset timestamps, ordered start/end, and agreement with the original weekday when one is supplied. Flexible attendance does not acquire invented dates. Registrations are active/cancelled/waitlist; transactions posted/pending/void; confirmations confirmed/declined/pending. Unrecognized source values remain exceptions until the mapping is explicitly reviewed.

## Money, payout and attendance semantics

Amounts use exact decimal strings and an explicit currency-to-fractional-digit map, normally {"USD":2} for this received example. Calculations use integer minor units parsed directly from decimal coefficients, without decimal-context rounding. Every returned native monetary field is an exact base-10 integer string, including fees, allocations, balances and currency totals. That representation is used consistently before derivedSha256, saved-view reconstruction, HTTP/CLI responses and portable export; clients must preserve it or use BigInt, never convert it to Number. Counts remain ordinary bounded integers. USD and other currencies remain separate; no exchange rate or cross-currency balance is invented.

Only a posted transaction with a valid selected registration and matching currency contributes gross minus refund to that registration's paid amount. Service fees, student fees and reported net payouts are preserved separately. A $20 payment with an $0.88 processor fee pays a $20 registration; the fee does not create a student debt. Pending and void rows remain visible but contribute no posted payment.

Reported net and payout identifiers/dates are original facts, not a recomputed settlement ledger. The workbench does not assume a universal gross/refund/student-fee/platform-fee identity. Missing reported net remains missing; totals include a reported_net_rows denominator. A refund greater than the row gross is retained as a review exception instead of silently being discarded.

Duplicate IDs, invalid monetary precision, unknown references and currency mismatches block release. A transaction lacking its registration ID requires a named original-record match. Fee differences, balances and unconfirmed attendance require review; acknowledging a balance does not erase it or change a payment. Capacity counts active registrations across one class ID, including alternate fee choices. Instructor confirmation is separate from money and registration state.

## Named decisions and editions

A complete save request has requestId, actor, at and definition. Create omits id/expectedRevision. An edit supplies both the existing review ID and its current expectedRevision. The same exact request returns its original historical result; reuse with changed content fails. A concurrent revision returns 409.

A catalogue decision binds source SHA, physical selected row, field, original value, new value, reviewer, reason and timestamp. Its original raw row remains unchanged. Matches bind original transaction and registration IDs. Review exceptions bind a hash of the complete derived issue and the selected source mappings, catalogue corrections, named matches and currency precision. A change to any of that reviewed evidence invalidates prior exception acknowledgements; the operator must deliberately review the resulting issues again. After mapping or source changes, stale decisions cannot silently attach to a different issue.

The browser preserves the unresolved full body before dispatch. It first looks up the original request on retry. Only an actual returned validation/CAS rejection permits explicitly discarding that request; transport uncertainty retains the same request. Packet receiving likewise retains the entire selected file in IndexedDB. Only an explicit adoptionState=NOT_ADOPTED response permits discarding a rejected file. An uncertain commit or lost response keeps the same selected file for reconciliation.

Comparison includes source-row changes, original definition and decision changes, and derived registration fee/payment/balance/confirmation changes. A named payment match therefore appears even when its original source rows are unchanged.

Historical selection feeds every displayed table from that exact saved edition. A later edition cannot be saved accidentally from the historical view. Existing source metadata is not relabelled when an identical source is added again.

Cutover states are draft, ready, released and rolled-back. Ready/released require every source blocker resolved and every review issue explicitly acknowledged. A rollback names an actual previous released revision, records a reason and leaves its history intact. This is the retained plan/decision record; provider-side rollback is operated separately through its original owner.

## CourseStorm operator import

The received official import workflow supports an Excel/CSV catalogue, then human column matching inside a newly selected catalogue. Public API documentation requires an activated account and issued credentials/endpoint. This product does not guess those API contracts.

An explicit importPlan selects provider coursestorm-csv, target catalogue, unique original class IDs, reviewer, note and timestamp. The export uses documented class fields and Visibility=hidden. It requires reviewed start and end dates, finite capacity, valid USD price, resolved source decisions and a confirmed continuous-enrollment choice for a flexible product. It refuses multiple source prices until the actual site's price configuration has been resolved. It does not turn two prices into separate capacities or four nonconsecutive visits into a fixed session sequence.

The CSV uses the documented basic class mapping. A customer with the Sessions plugin must supply its exact current exported template and configuration before a sessions-specific adapter is introduced. Session grouping requires identical shared fields, and does not safely apply to arbitrary price variants. Do not import the engineering CSV into a live catalogue.

The actual operator cutover should retain the current provider catalogue export, choose a hidden target catalogue, inspect field mapping and instructor/location/form associations, resolve the provider's reported invalid cells, verify source-to-target counts and representative class/fee/date rows, retain the resulting provider export, and only then record the release decision. If the owner rolls back, retain the target export and restore visibility/links through the original provider controls. The local workspace does not claim those steps occurred.

## Complete portable receiving

A ZIP contains the raw source files and original metadata, every selected historical view and its complete original request, the selected revision, reconciliation/exception CSVs, and an import CSV only when that plan is currently representable. A draft with unresolved import decisions still exports a complete packet with an explicit import-not-ready result.

CSV exports neutralize formula-leading text while the raw source and JSON stay unchanged. Export checks both the complete expanded selection (including manifest) and the compressed ZIP against the same 128 MiB receiving bound before returning it. A receiver checks exact member identities, hashes and expansion bounds; reconstructs each revision through the same original save path; and re-exports the complete packet byte-for-byte before adoption. Edited history that no longer follows its raw input fails. Existing divergent requests or revisions are rejected rather than overwritten. Receiving the same packet again preserves the original case, and receiving an older complete packet does not replace later local history.

    python3 -B class_intake.py receive --workspace /ABS/INDEPENDENT --packet /ABS/CASE.zip
    python3 -B class_intake.py view --workspace /ABS/INDEPENDENT --id REVIEW_ID --revision 2
    python3 -B class_intake.py export --workspace /ABS/INDEPENDENT --id REVIEW_ID --revision 2 --output /ABS/REOPENED.zip

## Full operated example

    python3 -B operate.py --output /ABS/PRIVATE/receiving

The one original operation is CLASS-INTAKE-BEREA-ENGINEERING-7108-20261013. It retains an original flock around its whole native lifetime and reopens a completed result only after every saved output descriptor matches.

The driver receives the complete 26-row public factual catalogue, plus explicitly synthetic registration, payment and confirmation sources. It demonstrates exact request replay, changed-body rejection, fee-versus-student-balance separation, pending-payment exclusion and a named unmatched-payment correction. The actual catalogue's unresolved date, deadline and multiple-price issues remain open; no school policy approval is fabricated.

A separate, conspicuously labelled engineering case demonstrates ready/released/rolled-back editions and hidden catalogue CSV. Both full packets are independently received, replayed, cold-reopened and byte-for-byte re-exported. The final engineering handback ZIP includes the full product source, factual interpretation, original native case packets and comparison. Its result.json reports native completion separately from browser execution. Browser: NOT_RUN until the separate actual browser leg returns.

## Public source findings and acquisition limits

Original sources read on 13 October 2026:
- https://bereaarts.org/classes.asp
- https://bereaarts.org/pdfs/FALL%202026.pdf?v2=
- https://bereaarts.org/pdfs/Art%20Classes%20Registration%20Form_7.28.24.pdf
- https://coursestorm.atlassian.net/wiki/spaces/CSHD/pages/4489349/Importing+Classes
- https://coursestorm.atlassian.net/wiki/spaces/CSHD/pages/4489321/Formatting+Your+Catalog+Spreadsheet+for+Import
- https://coursestorm.atlassian.net/wiki/spaces/CSHD/pages/4522078/How+To+Export+a+Registrations+and+Transactions+Report
- https://coursestorm.atlassian.net/wiki/spaces/CSHD/pages/4980805/REST+API

The three-page Fall catalogue supplies 26 dated/flexible class rows when four alternate-price Bob Ross workshops retain one shared class each. The linked form supplies a six-student capacity and a two-week registration rule. The Bob Ross catalogue text instead specifies one week. Watercolor Cards says Saturday 2 November, while that date is a Monday in 2026. Paper Collage has a date but no time. Drawing and Acrylic allow nonconsecutive attendance. Each of these facts remains visible in the source review.

The example JSON is a factual transcription, explicitly public-derived. It is not an unchanged PDF. The application source does not republish the copyrighted narrative descriptions. The original source PDFs and complete official documentation responses belong in the receiving source carrier when their full binary acquisition is available. No actual customer export, respondent information or provider API endpoint was acquired.

## Commercial and skills-transfer handover

48DB retains the existing CourseStorm prospect contact and offer. The engineering contribution can support that original conversation with a working source review, exact documented import constraints, a completed operated handback when run, and a short input list:
- approved current catalogue/source and actual tenant export/template;
- approved registration and transaction export, with exact sheet/header meanings;
- current instructor-confirmation record and the owner's intended cutover window;
- decisions on source conflicts, alternate-price configuration, flexible attendance and privacy/access roles.

Teach the operator to retain a new source, inspect and accept its mapping, save a draft, resolve a named exception, compare revisions, preview a hidden catalogue sheet and receive a complete ZIP in a separate workspace. That leaves a usable case and a repeatable handover for the next term.


## Full browser receiving leg

After the exact native result is COMPLETE, write one private browser-input.json:

    {
      "sourceRoot":"/ABS/SELECTED/class_intake",
      "outputDirectory":"/ABS/PRIVATE/browser-receiving",
      "coreResult":"/ABS/PRIVATE/receiving/result.json",
      "pythonExecutable":"/ABS/EXISTING/python3",
      "playwrightModule":"/ABS/EXISTING/playwright-core/index.mjs",
      "chromiumExecutable":"/ABS/EXISTING/chrome-headless-shell"
    }

Run the one owned browser interval with the existing Node runtime:

    python3 -B browser.py --input /ABS/browser-input.json --node /ABS/EXISTING/node

The local server persists operator-endpoint.json under its original workspace and holds .operator.lock. Restart with --port 0 reuses that exact loopback port, so the browser retains the original IndexedDB origin. An occupied original port or a conflicting explicit port fails visibly; do not select a new origin to bypass pending operations.

SF30_PLAYWRIGHT_MODULE and SF30_CHROMIUM_EXECUTABLE are supported if the corresponding input path is omitted. No browser is installed. The Python parent holds the original output flock through the Node child; Node owns its local servers and persistent browser context. The input file must be outside the receiver's normalized selection.json path.

The full journey opens the original catalogue/register, performs one clearly identified engineering note edition, preserves its exact UUID/body before deliberately losing the HTTP reply, recovers that same request, displays a historical edition, compares, downloads the verified whole ZIP, receives it through the UI in an independent workspace, closes/reopens the recipient and retains desktop/mobile screenshots. It does not correct or approve the real unresolved school source questions. Completed reentry verifies the original outputs before opening any application.

The final Class_Intake_Complete_Browser_Handback.zip includes the complete native handback, full browser output, original packet members expanded for inspection, and both browser source files. A browser completion is claimed only when result.json and complete-handover.json actually report COMPLETE. Preserve the same input, original workspace and browser profile on a failed run; reconcile any uncertain process lifetime before invoking the same receiver again.
