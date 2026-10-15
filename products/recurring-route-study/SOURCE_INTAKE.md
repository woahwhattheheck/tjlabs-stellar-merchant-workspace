# Original-source intake and mapping

## Start from the actual systems

Accept supplied exports from the operator's scheduling, dispatch, field, proof, customer-report and accounting systems. Existing GPS, QR asset records, reporting portals and route software remain the baseline. No vendor database or API layout is assumed. The twenty-three canonical tables are the independent study boundary, not a claimed RouteProof schema.

Retain the complete source file before mapping. Preserve the original column meanings, units, timezone interpretation, account/company scope and extraction time in the study notes and original locator. UTC conversion must be documented; the original local timestamp remains in the retained file.

## Source groups

| Source group | Canonical families | Meaning |
|---|---|---|
| Operating identities | companies, users, customers, sites, assets, routes | Exact owners, site-coordinate edition, service assets and route revisions |
| Scheduled obligations | stops | Complete consecutive population, original schedule window and explicit selection |
| Dispatch context | assignments, requirements | Actual route/technician assignment and approved proof rules known at dispatch |
| Actual field activity | attempts, attempt_events | Each attempt and dated status changes, including blocked, missed and reopened work |
| Original proof | proofs, proof_receipts | Exact payloads, device acquisition/capture and actual office receipt |
| Exceptions | exceptions, dispositions | Original exception and named dated disposition, including linked revisit |
| Customer report chain | reports, report_inputs, report_events | Exact report edition, consumed payloads and separately observed publication/access |
| Actual billing chain | billing_decisions, invoices, invoice_lines, accounting_events | Named readiness decision, exact issued records and real accounting events |
| Study effort | effort | Disjoint observed person-work slices for both methods and all recurring phases |

Every exact canonical header is in templates/ and DOMAIN_CONTRACT.md. The examples/input/ CSVs are authored values, not blank templates. Keep programme planning worksheets separate from these imports until a deliberate field mapping has been made.

## Mapping rules

All imported fields are strings. Numeric fields use explicit decimal strings and retain their units in the canonical field definition or source notes. IDs never become numbers. Blank mapping means null/unobserved; an empty cell in a mapped source column means an observed blank. The selected/availability.json export preserves this distinction when a selected CSV alone would display both as empty.

Each original column may map to only one canonical field. If a source combines information, prepare a separately retained extraction with a documented derivation rather than concealing a transformation. When correcting an existing canonical record, previously unobserved fields remain null; supply an explicit complete source mapping to make a new field observed.

Each source edition has a separate available_at. Each original has actual intake capture metadata. Later manual corrections retain the earlier source and a reason. The as-of study includes only selected editions available by its cutoff. Within those editions, actual row times still determine what was known at dispatch, report creation or billing.

## Scheduled work and revisions

A stop ID means one scheduled service obligation. A route list, an asset list and a proof list are different populations. Multiple service assets may require separate explicitly scheduled obligations; do not infer them from photo counts. A cancelled or blocked stop remains scheduled. A revisit gets a new attempt linked to the same stop.

Routes and assignments have explicit predecessors. Preserve the dispatched route ID, technician, requirement ID, recording time and effective interval. An assignment recorded after dispatch is not contemporaneous dispatch evidence. Requirement versions retain their actual photo counts, signature/position/note rules and location thresholds.

## Exact proof and report payloads

Preserve original photo/signature/location/report/invoice bytes. The source payload hash in a row must match a typed document link. File extensions and names do not identify contents. A location result includes the original provider, acquisition time, WGS84 coordinates and reported accuracy; the site's coordinate uncertainty comes from its own actual source.

Office proof receipts record the exact hash, recipient and arrival time. A report lists the actual proof IDs and hashes used. If a report was created before a required payload arrived, retain the first report and a later corrected edition. Do not backdate the receipt or replace the original report file.

## Effort and accounting

Work keys identify disjoint active person-work slices, independently of the source filename. Include actual recurring correction, review, customer handoff and billing reconciliation. Record measured zero explicitly. Missing phases remain unobserved. Keep waiting time and route travel context separate from active documentation person-minutes unless the declared phase measures actual active work.

Invoice line amounts must reconcile exactly with the supplied header in the same currency. Link each line to the scheduled stop and actual ready decision. A report or ready decision does not imply an issued invoice; an invoice does not imply payment. Retain actual accounting references and payment/refund observations.

## Size and receiving boundary

Original file reads allow up to 24 MiB; session file reads allow up to 64 MiB before validation. Expanded complete retained sessions are limited to 40 MiB. The compact archive shares unchanged records and original bytes across history, while preserving complete preimages. A rejected original or pending form remains recoverable. Choose an operationally complete study window that fits, and export it before replacing the active scope.
