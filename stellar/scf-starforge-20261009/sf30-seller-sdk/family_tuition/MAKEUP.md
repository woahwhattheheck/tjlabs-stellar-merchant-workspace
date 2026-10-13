# Studio make-up scheduling

The make-up operator extends the existing family tuition workspace. A staff member selects the exact family revision and school year, records an absence against one published policy, reviews the available sessions, obtains a named approval, and records the subsequent booking and attendance events.

Open the existing family server and choose **Make-up scheduler**, or open `/makeup` at its retained local address. The same workspace contains tuition, sources, family records and make-up ledgers. Each ledger belongs to the original family and academic year. An independent receiving workspace can reopen the complete exported package.

## Source selection

TONDO has two different published make-up policies. Each absence retains its named selection; the operator does not combine the two editions into a new entitlement.

| Edition | Published terms used by the model | Explicit operating choices |
| --- | --- | --- |
| Student registration form, page 3 | Twenty-four hours' notice; studio discretion for illness or emergency; make-up within thirty days; active enrollment; studio approval and available capacity; expiry on pause or withdrawal; holiday and break exclusions. | Thirty days after the original lesson. An exception is a named studio decision and applies to the notice requirement. |
| Terms and conditions, pages 1–2 | Four make-ups during September–June; twenty-four hours' notice; within two weeks before or after the original lesson; no transfer to the next semester. | The studio enters the semester boundaries because this PDF supplies no semester dates. A confirmed unused booking reserves one annual entitlement; attended or missed bookings remain consumed. A timely cancellation releases the unused reservation. |

The operator displays the full native policy catalogue and accounting interpretation. Each selected policy retains the exact original PDF SHA256 and a reviewer, note and observation time. The complete PDFs are included in exported handovers.

The original registration source is `eec6450f43b9798892d77c3688dba20f3aa9f11e4da9055e9f63f6d9ae754e7a`. The original terms source is `68fb0614ad67c0703ae2c74dfe455a9356c25bd720e651bf953fc95b386a313f`.

The linked family record supplies programme membership, weekly slots, funded periods, signed agreements, class confirmations, timezone and the calendar. The actual 2026–27 calendar runs from September 8 through June 26, with the published Thanksgiving, winter, spring and Memorial Day closures already represented in the PDF-based family continuation.

## Daily operation

1. Select the ledger and current revision, or create a ledger and bind the exact family revision. Check the displayed school year and timezone.
2. Enter the operator name and review note. Effective time is displayed in UTC. New observed decisions advance it when necessary.
3. Add a named published policy selection. For the terms edition, enter the studio's semester intervals as an ordered JSON array of objects containing `id`, `label`, `start` and `end`.
4. Select an enrollment and its original lesson date and weekly slot. Record when notice was received, its reference and the reason. The notice control is explicitly UTC. A studio exception also needs its own reference and explanation.
5. Refresh eligibility and capacity. The native model displays the exact permissible interval, original lesson, active membership, annual use and any reasons the absence or proposed booking is ineligible.
6. Select the absence and target session. Enter the instructor's approval and reference. Where the programme leaves capacity unpublished, record the studio-confirmed capacity and its source. Published capacity takes precedence.
7. Add the booking event and record the complete revision. Later rescheduling, cancellation, attendance, missed attendance and withdrawal are new events in the retained history.
8. Export the complete handover. The receiving operator imports that same ZIP, reviews its original sources and history, and can continue with a new local revision.

All event rows are append-only once recorded. An absence remains bound to its originally selected policy. Rescheduling retains the same absence identity. Previous records can be viewed and compared through the history controls.

The complete definition editor supports source-aware review and specialist corrections before saving. The native model validates the entire definition, event order, policy selection and family binding.

## Interrupted operation

Before recording a revision, the browser stores the complete original request and acquires a workspace-scoped Web Lock. If the HTTP response is lost, the pending panel retains that request across reloads. **Reconcile original save** first queries the original request record, then returns the recorded revision or retries the same body and request ID.

If the server definitively rejects a request with validation or revision conflict and confirms that request was not recorded, the browser retains the rejected body and receipt, restores editing and keeps the working draft. Reload the current revision before reconciling a stale draft with another operator's accepted work.

Before receiving a package, the browser stores the entire ZIP in IndexedDB and its original receiving intent in local storage under the same workspace lock. Reconciliation validates the retained bytes and SHA256 and continues the same complete packet. A definitive pre-adoption rejection retains the original packet and error. A successful result is retained before the pending intent is cleared.

An earlier package can be received again after later compatible local work. The receiving model reconstructs the complete selected source and history, preserves the later compatible revisions, and returns both the selected revision and the current local view.

## Operator API and typed client

The make-up HTTP routes share the family server's loopback host check, origin check and `X-Family-Token` authentication. Package receives use the original full-packet size limit. Every request closes its native workspace handle.

| Method | Route | Operation |
| --- | --- | --- |
| GET | `/api/makeup/state` | Current ledgers, family records, sources, policy catalogue and contract |
| GET | `/api/makeup/view?id=…&revision=…` | Exact retained revision, or current revision |
| GET | `/api/makeup/history?id=…` | Complete retained ledger history |
| GET | `/api/makeup/request?id=…` | Original request receipt |
| POST | `/api/makeup/preview` | Full definition eligibility and capacity calculation |
| POST | `/api/makeup/save` | Complete original request with expected revision |
| POST | `/api/makeup/compare` | Compare two retained revisions |
| POST | `/api/makeup/export` | Produce a full source-and-history handover |
| POST | `/api/makeup/receive` | Reconstruct and receive the complete ZIP |

`MakeupClient` in `makeup_client.mjs` composes the original `FamilyTuitionClient`. Its adjacent declaration file supplies the complete policy, absence, membership, booking, request and view interfaces. Binary downloads are checked against their declared byte count and SHA256.

## Complete native and browser operation

`makeup_operate.py` exercises the native model against the independently received, actual-PDF family record. It retains the original tuition receipts and history while exercising the selected policy editions, bookings, changes and receiving.

`makeup_browser.mjs` opens the existing source workspace, enters an absence and confirmed booking through the real operator controls, deliberately loses one already-committed save response, reloads and reconciles the original request, selects historical views, compares revisions and downloads the complete package. It then receives that packet through a separate operator, records receiving notes, receives the earlier packet again, reconstructs the original packet byte for byte, and cold-reopens both closed workspaces.

The browser configuration selects the existing source and recipient paths, the actual Python/Chromium/Playwright paths, the current ledger identity and an unused source-bound lesson scenario. The controller retains its original configuration, pre-operation view and original save request so an interrupted continuation can use the same operation. It also checks the family and make-up interfaces at a 390-pixel viewport.

Example invocation, using an operator-prepared complete configuration file:

```sh
node /absolute/source/family_tuition/makeup_browser.mjs /absolute/makeup-browser-configuration.json
```

The browser output contains the full source and recipient views/history, downloaded packet, comparison, desktop and phone captures and final completion result. The cumulative TONDO engineering handover includes these alongside the tuition course, actual original PDFs and vendor implementation guide.
