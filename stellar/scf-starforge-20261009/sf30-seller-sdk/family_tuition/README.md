# Family Tuition operator

Family Tuition turns complete source editions and observed household records into a saved annual tuition review, exact receipt allocations, agreement and staff-confirmation registers, and an explicitly selected next-year handover. It uses the original Class Intake SQLite/source implementation without modifying that product.

## What is operated

The native model, CLI, loopback HTTP server, typed JavaScript client, browser operator, complete source packet and independent reconstruction are implemented. The browser retains the complete original operation across response loss. Each annual review has immutable revisions, a named operator, an exact request body and a derived-content hash. A linked Class Intake edition can be included by its exact ID, revision and derived hash.

The model records observed payments, refunds, signatures and staff confirmations. It does not charge a card, send a registration email, create a legal signature or mutate CourseStorm. Those actions remain with the existing authorized provider and relationship owner.

## Original TONDO sources and unresolved policy precedence

The whole factual fixtures under examples retain the homepage and /artclasses as separate current publications. They disagree about the 7–10 versus 7–9/8–10 bands, adult tuition and adult times/duration. The operator must choose actual programme, plan and slot identities; it never assigns a child automatically from overlapping age bands.

The original PDFs were recovered later in the same project and add a third programme edition and additional fee/calendar/policy facts. Keep their full source bytes and provenance. Their registration form and terms describe different make-up windows and limits. A source edition is not automatically authoritative merely because it is a PDF, a homepage or a later retrieval.

The completed first receiving example deliberately retains the two web editions and a clearly labelled engineering calendar. Its synthetic household, capacities, receipt, agreement and confirmations are not institutional observations. The PDF-defined attendance/make-up extension is a separate cumulative addition; do not relabel the earlier completed result as a run of those later rules.

The separate COURSESTORM_IMPLEMENTATION.md and complete vendor profile describe actual public capabilities, fees and the owner questions required for a provider migration. They do not assert an active vendor API or customer acceptance.

## Run

Use Python 3.11+ on a POSIX host. The standard library provides SQLite, ZIP handling, exact decimal parsing and the local server. Keep the adjacent original class_intake/class_intake.py from the same product source selection. No pip install is required for this module.

```sh
python3 -B workspace.py init --workspace /PRIVATE/family-workspace
python3 -B server.py --workspace /PRIVATE/family-workspace --port 0
```

The server prints its actual loopback URL and persists that exact port in family-operator-endpoint.json. Reopening the same workspace reuses the original origin, which preserves the browser's IndexedDB records. If the port is occupied, resolve its actual owner rather than choosing a different origin. Only the selected local host is accepted; mutations require its current nonce and same-origin request.

Open the operator, enter a named reviewer and select an existing case or retain the complete source tables. The interface supports CSV, JSON tables and values-only XLSX. A workbook mapping retains its original sheet, all header columns and original physical row coordinates. A formula workbook must be exported to values by its original owner.

## Nine complete input tables

All source cells are strings. Select every required field with an original zero-based column index or an explicit constant. A value mapping records exact original and selected values.

| Table | Required fields |
| --- | --- |
| programmes | id, title, min_age, max_age, duration_minutes, capacity, location |
| plans | id, programme_id, frequency, tuition, currency |
| slots | id, programme_id, weekday, start, end |
| households | id, label, contact_ref |
| students | id, household_id, name, birth_date, registration_type |
| enrollments | id, student_id, plan_id, slot_ids, start, end, status |
| payments | id, household_id, gross, refund, currency, status, posted_at, provider_ref |
| agreements | id, student_id, document_source, signed_at, valid_from, valid_to, status, signer_ref |
| confirmations | id, enrollment_id, period_id, status, actor, at |

The native JSON table shape is `{columns:[...],rows:[[...]]}`. The row editor creates a complete new source edition, retaining all other mapped rows. It records the editor and stated authority, keeps the original edition and requires a new saved review.

Dates use YYYY-MM-DD. Observation/decision timestamps include an explicit timezone offset. Weekly weekdays are 0=Monday through 6=Sunday. The original local time strings remain unchanged; interval comparisons use validated integer minutes. Nonzero seconds, fractional seconds, timezones and overnight intervals are refused. The selected year has an explicit IANA timezone. An empty upper age preserves a published open-ended band such as 18+; a missing capacity remains a review issue.

Enrollment slot_ids is a JSON array of exact chosen slot IDs. The number of unique selected slots must match the actual frequency plan, and each slot must belong to that plan's programme. Programmes sharing a physical time/location are evaluated using distinct student occupancy within that programme. One student's overlapping intervals are blocking regardless of programme. Distinct physical studios should use their real location/programme identities.

## Annual rules and financial conservation

Choose the annual bounds and each billing period explicitly. Periods must be chronological, non-overlapping, inside the annual window and no longer than 31 inclusive days. The interface does not invent an academic calendar from a monthly price. A confirmed calendar requires a complete retained source; source-less dates remain an unconfirmed preview.

Registration has an explicit source-backed amount for the selected new/returning classification and one charge per student/year. It is placed in that student's earliest actual overlapping billing period, independent of input row order. If the original policy distinguishes sibling registration, senior discounts or card surcharges beyond those two classifications, retain the exact policy and use a named calculated-charge decision until an applicable dedicated rule is selected. Do not mislabel a sibling as a returning student merely to obtain a fee.

Sibling eligibility is explicit: percentage in integer basis points, selected enrollment IDs, tuition-only scope and half-up minor-unit rounding. The original public percentage does not establish eligibility or stacking. Each selected partial-period tuition requires an explicit charge decision, including a decision to retain the full monthly amount. Cancellation/reschedule interpretations must retain their source and reason.

All calculations use exact integers internally and integer strings in JSON before hashing. Source decimals remain strings. No browser Number conversion is used for money. Posted receipts contribute gross less observed refund; pending or void records contribute zero. Allocations must be positive and refer to the same household and currency as the charge, and their total cannot exceed actual available funds. Overpaid charges remain visible credits requiring named review.

Rollover selects the exact latest saved prior-year revision and derived hash. Its complete payment snapshot retains original receipt identity, household, currency, provider reference, original net and amount already consumed. Later edits cannot drop that historical consumption. A provider receipt cannot be duplicated with a new ID. Later refunds below already consumed funds create a blocking deficit. Prior payment IDs omitted from a current table remain in the carried snapshot for future years.

The rollover preview is read-only. The operator selects returning students, new dates, updated source editions and agreement/confirmation evidence. It does not silently renew or debit a customer.

## Readiness, decisions and history

A signed-agreement observation requires the complete document source, signer reference, observation timestamp and coverage dates. A staff confirmation uniquely binds an enrollment and billing period to its named observed state. A ready roster additionally requires full funding, a confirmed source calendar, reviewed status and no unresolved issues.

Source corrections retain the original source SHA, physical row, field and original value. Charge corrections retain the original calculated minor-unit amount. Every issue acknowledgement binds the complete effective definition and relevant evidence; changing the underlying fee, mapping, calendar or allocation invalidates the acknowledgement. Blocking issues cannot be waived.

Historical revisions are read-only in the browser. Native edits require the current expectedRevision. A repeated request ID with the same whole body returns its original snapshot before CAS; a changed body with the same ID is rejected.

The browser holds an origin/workspace Web Lock through actual pending-record re-read, creation or original continuation, provider dispatch and durable completion. Another tab cannot overwrite an unresolved request. Source success and its intended complete draft/mapping are committed together before clearing pending. A recovered draft retains its original revision anchor, so a later saved head cannot be silently substituted.

Only a definitively rejected save or a receive explicitly returned as NOT_ADOPTED can be discarded. Unknown outcomes remain pending for reconciliation. Complete source uploads are content-addressed and retain their original body and metadata through continuation.

## Native and typed interfaces

`FamilyWorkspace(directory, create=False)` exposes identity, sources, add_source, table, state, view, history, request, save, rollover_preview, compare, export and receive. Close the original workspace when finished.

Save accepts `{requestId,actor,at,definition,id?,expectedRevision?}`. Creation omits id and expectedRevision. Definitions contain year, currencyDigits, all nine selections, documents, registration, sibling, calendar, source corrections, charge decisions, allocations, exceptions, named review and optional rollover/linkedIntake.

CLI commands are init, state, source, table, save, view, history, request, rollover-preview, compare, export and receive. All require --workspace. Source uses --input and --metadata; save uses --input; receiving uses --packet; export uses --id, optional --revision, and --output.

The local HTTP routes mirror those operations. GET /api/state returns the actual workspaceId and token; GET /api/view, /api/history, /api/request and /api/rollover-preview retain the selected identity/revision. POST /api/source receives full bytes plus metadata; /api/table, /api/preview, /api/save, /api/compare and /api/export take JSON. /api/receive takes the complete ZIP. Returned downloads include full byte count and SHA256.

FamilyTuitionClient in client.mjs and client.d.mts exposes the same methods, exact money strings, full original request lookup and verified byte downloads. It uses the supplied fetch implementation or the runtime's original global fetch.

## Portable receiving and complete operated example

The private packet includes every original source/document, all selected request and revision history, the selected whole view, exact money/report CSVs and any linked Class Intake packet. CSV free text uses the original spreadsheet neutralization; raw JSON and source bytes stay unchanged. Expanded and compressed packets are bounded at 128 MiB.

Receiving first verifies every complete member, reconstructs linked intake and every family request in an isolated workspace, and requires byte-identical canonical re-export. Only then does one SQLite transaction adopt source, intake and family history. An earlier valid packet never replaces later local history. Unknown commit outcomes are not labelled NOT_ADOPTED.

Run the complete labelled example:

```sh
python3 -B operate.py --output /PRIVATE/tondo-receiving
```

The operated result contains two factual publication editions, five family revisions, a first-year $805 charge and $195 unused credit, a next-year $755 charge, and $440 remaining after a second synthetic $1,000 receipt. It exercises original request replay, changed-body refusal, source-edition comparison, exact prior consumption, complete independent receive, earlier-packet receiving after later history and cold reopen.

For the full browser programme, write one JSON input with sourceRoot (this family_tuition directory), outputDirectory (a private persistent browser directory), coreResult (the actual operated-case.json), and the host's existing pythonExecutable, playwrightModule and chromiumExecutable. Run:

```sh
python3 -B browser.py --input /PRIVATE/browser-input.json --node /EXISTING/node
```

Node 22+ and an existing Playwright/Chromium runtime are required. SF30_PLAYWRIGHT_MODULE and SF30_CHROMIUM_EXECUTABLE overrides are supported. Do not install duplicate browser runtimes. The receiver uses the actual current case, retains its complete initial intent, verifies response-loss recovery without a second logical save, checks historical views, compares editions, receives the whole ZIP in an independent browser workspace, exercises the typed client and cold-reopens the actual server.

The packager retains immutable member selection before deterministic ZIP publication. A completed reentry validates and reuses the same archive. Owned server stdout is drained before closure and the parent flock spans the child lifetime. Preserve the complete failed attempt/source-selection record when applying a reviewed receiving-driver correction; do not overwrite an already completed receipt.

## Continue with the actual original PDFs

The separate `pdf_operate.py` reconstructs the exact funded 2026–27 revision3 into a new private workspace. It retains all three complete original PDFs, the third programme fixture and the actual18-date closure calendar. It keeps the original payment source unchanged, names the second child, adjusts that child's registration from50USD to the form's25USD sibling fee, and explicitly retains full September tuition despite the8September first class date. The original805USD example therefore becomes780USD due and220USD unallocated from the same1000USD receipt. The later2027–28 rollover case is untouched.

Write an input JSON with these exact fields:

```json
{
  "operationId": "TONDO-FAMILY-PDF-RECEIVING-7108-20261013",
  "familyPacket": {"path": "/PRIVATE/Year_2026_Complete.zip", "bytes": 29979, "sha256": "42b4477c34f3cbceee79efb94cc24b58e546aec81844c10d97eb3b40fd429765"},
  "originalsDirectory": "/PRIVATE/original-public-documents",
  "outputDirectory": "/PRIVATE/pdf-receiving",
  "actor": "Named receiving operator",
  "at": "2026-10-13T06:00:22Z"
}
```

Run `python3 -B pdf_operate.py --input /PRIVATE/pdf-input.json`. The originals directory must contain the unchanged filenames selected by the source fixtures: Student-Registration-Form-1-1-1.pdf, Calendar-2026-27.pdf and Terms-Conditions-2026-2027.pdf. Every full body is checked against the actual source byte count and SHA256. This course requires the original completed revision3 packet identified above; for another customer, use the general source/mapping/save interface with that customer's approved inputs.

The result `pdf-operated-case.json` returns the exact saved family anchor and both workspace paths. Its complete packet preserves the earlier web-based revisions, all original requests, the new named policy/charge decisions and every original document. Independent receiving, same-packet replay, earlier-packet preservation and cold reopen are part of the course. The household, signed-agreement observation, capacities and staff confirmations remain clearly labelled engineering examples. Selecting the make-up policy and recording actual attendance are separate saved operations bound to this family revision.

The complete deliverable provides executable source, source provenance, exact case history and a reusable recipient workflow. Configure it with approved household/payment documents and the institution's explicitly chosen programme, calendar and policy editions before an operational handover.
