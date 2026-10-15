# Studio session study — complete operating guide

This companion compares a studio's declared source records alongside its current scheduling, creative and accounting tools. It does not connect to a scheduling provider, book rooms, notify crew, issue invoices, collect/refund money, calculate payroll/tax or write media. Use the studio's accepted quote and actual selected workflow as authority; declared transaction exports are the input to the comparison.

## Start with one complete study

Keep the selected room, a source period and the studio's original booking/reference. A session spanning two rooms needs an explicit occurrence/room mapping; do not silently duplicate its amount under both room IDs. The supplied normalized CSV contract is a study format, not a promised provider import schema.

Choose a new edition ID and descriptive label; enter a real received-at timestamp with a UTC offset and a note identifying original export scope. All eight tables are explicit. A header-only CSV means the source owner supplied an empty population; a missing source is rejected. Original text including a UTF-8 BOM and CRLF remains intact. Unknown additional columns remain in the original source even when the analysis does not consume them. Keep the original export and the exact preparation/mapping decision when changing headings or removing voided/historical rows.

All dates in booking/actual/report rows are full offset timestamps at whole-minute precision, for example 2026-10-15T18:00:00-04:00. Midnight rollover must use the next calendar date. Explicit offsets handle the source's local/DST interpretation; the engine makes no timezone assumption. Room/person conflict intervals are half-open: an ending session and one starting at the same instant do not overlap.

## Eight full originals

1. **rooms** — room_id,name. Each room has one identity.
2. **sessions** — session_id,room_id,artist_id,booked_start,booked_end,actual_start,actual_end,status,billing_mode,hourly_rate_minor,package_minor,overtime_rate_minor,increment_minutes,currency,quote_reference. Status: scheduled, in_progress, completed, cancelled, no_show. Billing mode: booked, actual, package. Quote/reference is mandatory. An absent client is visible attention. Optional po_reference is the session's declared label PO.
3. **crew_rules** — room_id,role,required_count. Declare the actual required roles for the room; use zero explicitly when appropriate. No engineer/assistant requirement is invented from a studio's marketing description.
4. **crew** — assignment_id,session_id,role,person_id,status,replacement_id. Status: assigned, seen, cant_make_it, covered, declined, outside. Outside is an explicit engineer marker; the person may be blank. Covered requires an accepted assigned/seen replacement in the same session and role. One person cannot be counted twice in the same role. A pending cover request supplies zero fulfilled-role count but keeps the original person's booked reservation until accepted cover; role and overlap attention remain distinct.
5. **reports** — report_id,session_id,status,signed_by,signed_at,reference. Status: draft, signed, void. One current report per session per edition. Signed requires signer, offset whole-minute time and source reference. Historical/corrected reports stay in earlier full editions.
6. **allocations** — session_id,payer_id,rule,limit_minor,reference. One optional label payer distinct from the artist. Rule: all, booked or fixed. Even all/booked rows explicitly declare limit_minor (normally0; only fixed consumes it). Optional deal_po_reference supplies the label's fallback PO when the session PO is absent.
7. **invoice_lines** — line_id,invoice_id,session_id,payer_id,category,amount_minor,currency,reference. Categories: base,overtime,discount,fee,tax,other. Line IDs are unique; a single invoice has one payer and currency. Base/overtime/fee/tax are nonnegative; discount nonpositive; other is explicitly signed. Optional po_reference is the actual line's invoice PO. Use the current agreed source population, preserving the original source/mapping when historical voided lines are excluded.
8. **payments** — payment_id,invoice_id,kind,amount_minor,currency,reference. Kind receipt or refund; amounts positive/nonnegative original minor units. A receipt and subsequent refund are separate original records. Deposit receipts already on an invoice are counted once, not subtracted again from its amount. Currency must agree with the invoice. Bank, check, card and other actual methods remain in the source reference/additional columns; no payment route is activated.

Duplicate IDs, unknown source relationships, malformed CSV, invalid timestamps and currency contradictions reject the new edition before adoption. The prior complete workspace remains current. Monetary observations retain arbitrary exact integer minor units within the published25-character range and use BigInt arithmetic; currencies never aggregate together.

## Declared charge comparison

Completed sessions require both actual start and end. For a booked policy, base duration is booked duration. For actual, it is the smaller of actual and booked duration. For package, base is the explicit package amount. Overtime is positive actual duration beyond booked duration, at its independently declared overtime rate.

The declared increment is a whole number of minutes,1–1440. Each duration component rounds upward to this increment. The hourly amount is duration × rate /60, rounded half-up once to an integer minor unit. Example: six booked hours at12000USDminor/hour =72000; eight actual hours gives two overtime hours =24000. This is a deliberately explicit comparison policy, not a claim about a provider's undisclosed rounding. If the studio's actual policy differs, agree a compatible normalization or retain the issue for review.

Cancelled and no-show sessions never generate automatic fees or refunds. They carry manual-policy attention and observed invoice/payment records remain visible. Scheduled/in-progress or incomplete completed records remain unfinished; a missing time never becomes zero.

A label's all rule takes both base and overtime. Booked takes base only. A fixed limit allocates to base first and then overtime up to the limit; the residual belongs to the artist. Expected components are compared to actual base/overtime invoice lines by session,payer,category and currency. Discounts, fees, tax and other lines remain visible as separate original adjustments requiring review. They do not erase the raw base/overtime discrepancy.

For a label invoice, an explicit session PO takes precedence over the deal PO. Mismatched actual line POs and one invoice containing distinct POs are attention. The software neither changes nor sends a bill. Invoice totals, receipts, refunds, net paid and remaining balances remain separate observations; negative balances/over-refunds are reviewable rather than silently normalized.

## Complete worked course

The included originals are authored examples. First edition: one overnight session, six booked hours, eight actual hours, label covers72000 base, artist owes24000 overtime. Actual artist line12000 exposes a−12000 difference. The recorded36000 deposit is applied once to the label's72000 invoice. An assistant's unresolved cover and unsigned report stay visible.

Two review entries show an investigation followed by a source-correction decision, preserving the first entry and numeric delta. The corrected source edition supplies accepted assistant cover, signed report and the full24000 overtime. It keeps both full original source sets and original decisions bound to their former edition. Its invoice total is96000, net paid36000, remaining60000. Additional retained course paths exercise fixed80000 label allocation, session PO override, cancellation, exact BOM/CRLF, malformed-source rejection, review mutation and pending-cover occupancy.

Review choices investigate, accept_expected and correct_source annotate the exact source finding. Each new correction names the previous review ID. A reviewed item can remain numerically different; a correction becomes a new full source edition, never a rewrite of old originals.

## Native continuation

Requires Node.js with built-in modules. No package install or network is needed.

Create a blank core package:
    node studio-session-native.mjs --new-id STUDY_ID --label "Studio study" --out NEW_DIRECTORY

Continue from a complete browser JSON:
    node studio-session-native.mjs --workspace browser-workspace.json --command receive-command.json --out NEW_DIRECTORY

A receive command is:
    {"action":"receive","input":{"id":"received-1","label":"Original export","receivedAt":"2026-10-15T10:00:00Z","notes":"Actual selected source scope"},"sourceFiles":{"rooms":{"path":"rooms.csv"},"sessions":{"path":"sessions.csv"},"crew_rules":{"path":"crew_rules.csv"},"crew":{"path":"crew.csv"},"reports":{"path":"reports.csv"},"allocations":{"path":"allocations.csv"},"invoice_lines":{"path":"invoice_lines.csv"},"payments":{"path":"payments.csv"}}}

Relative source paths resolve from the command file. Each original file is read once, retained as bytes and strictly decoded. A review command uses {"action":"review","input":{...the exact review fields...}}. Omitting --command exports the current complete study/report. Output directories are create-only. If writing a package is interrupted, retain that directory and choose a different new output directory for continuation.

The output's workspace.json preserves an incoming tjlabs.studio-session-desk.v1 wrapper and all its session fields while replacing its workspace with the current validated core. core-workspace.json is the separate core. original-input-workspace.json is byte-exact, with original-command.json and received binary originals. All editions' original CSVs are under originals/. The ordinary complete-report.html, full analysis and four CSVs come from the current last edition.

Rejected intake returns exit status1 and writes the unchanged adopted core plus the exact command, all readable received bytes and failure. In a desk wrapper, nativeContinuation retains command/attempt/byte receipts and its full previous continuation. Browser adoption must preserve and show that record; retaining or clearing it is a deliberate action. No failed command is retried automatically. The source course is receiving/run-source-course.mjs.

## Review handover

Open the full comparison table, check source dates and pricing basis, inspect payer/PO and payment observations, and document who accepts each exception. Export complete workspace and ordinary report, then reopen the exact exported current JSON before handoff. Keep the original studio's creative approvals, media storage, accounting records, payroll and customer communications in their established systems.


## Complete browser and native continuation

The operator's current wrapper is `tjlabs.studio-session-desk.v1`; its source draft, source receipts, selected edition and unfinished per-finding review drafts remain intact in native `workspace.json`. A successful receive appends a source edition. A rejected receive retains the current adopted edition and full attempted command, original byte receipts and prior continuation under `nativeContinuation`. The operator displays that whole continuation and retains the current copy before clearing it.

Run the complete source-native handoff with `node receiving/run-native-course.mjs NEW_DIRECTORY`. It uses the maintained browser workspace validator and native CLI on the full worked desk, checks complete source/working-state retention, a malformed UTF-8 rejection, exact output manifests and create-only output. `receiving/actual-browser-native-course.json` records the actual production-function run in the available V8 runtime with explicit filesystem/path adapters. The existing caller-owned browser journey handles rendered controls and downloads.
