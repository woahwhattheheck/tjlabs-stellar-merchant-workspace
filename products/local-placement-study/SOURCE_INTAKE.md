# Source intake and exact mapping

## What to collect

Collect the complete original schedule population for one actual operating trial and all related source records. Keep real source exports and document originals, including failures and unresolved rows. Do not replace them with a favourable summary.

Use DOMAIN_HEADERS.json and templates/ as the exact maintained contract. The 25 families follow the whole operating chain: organisations, people, authorities, venues, host agreements/events, assets/events, slots, advertisers, category rules, campaigns, placements, creatives, approvals, schedules, play events, exposure estimates, outcome events, reports/inputs, invoices/lines, accounting events and effort.

Your planning workbook is not automatically an import file. Supply real observations, retain the source, and explicitly map any different column names in the desk.

## Preserve actual distinctions

- A row ID is an internal identity; asset_ref, external event identity, campaign number and document hash are separate fields.
- Authorities are records with scoped source evidence. Job titles are descriptive.
- host_agreements.signed_at is the actual signing time. Effective term and recorded knowledge are separate.
- An asset row describes inventory; installed/operational observations establish actual state.
- A placement is an actual reservation with booking actor/authority. Its future service interval is distinct from the booking instant.
- Approval rows bind exact creative, venue and actor authority. An earlier version or another site's approval does not transfer automatically.
- player_ack is not play_completed. Actual mode, duration, source timing and external identity remain necessary.
- An estimate has an actual method and input reference. A response has attribution and actual event identity. Neither is cash.
- An invoice is an issued source record. Clearing is an actual accounting observation.

Pipe-delimited categories, service areas, authority scopes and required installation line kinds are exact sets. Do not insert unobserved categories or create geographic matches from address words.

## Time and editions

Supply real UTC ISO instants and retain the venue timezone. The desk distinguishes when an event applies, when the source recorded it, when the original extract was available and when this application captured it. It does not substitute import time for earlier operating knowledge.

Original CSV availability identifies the complete edition used in this study. If only a later consolidated extract exists, do not invent earlier editions. Use retained source record times and actual earlier documents where available; leave unknown evidence visible.

Corrections create later complete selected extracts and retain original text/mapping and before/after rows. Source and returned record IDs are joined only by explicit crosswalks. Unmapped fields remain unobserved through exports: selected/availability.json carries this distinction alongside the readable CSVs.

## Attachment identity

Retain exact source bytes and link each to its precise typed record on the correct side. Agreement, authority, creative, report and invoice payloads are not interchangeable. The record hash is a content identity, not a filename assertion.

Creative approvals and play observations reference exact creative payload bytes. Report inputs with a payload bind that payload; other typed inputs use the exact canonical row SHA obtained from the maintained Core.hash(row.values). Original player logs remain available as exact CSV/source files in addition to their creative binding.

Retain the full inventory original and its source locator. Source-original exports use stable hash identities and index files, so repeated filenames do not collide.

## Monetary and work data

Use exact decimal strings without currency symbols or exponents. Declare actual currency precision in the plan. Use negative invoice credit lines and positive observed refund/reversal amounts. Preserve the actual external transaction reference across repeated exports.

For prepaid installation, use the actual required positive line categories and fully cleared linked invoices. Do not treat a button, rate card, draft, issued invoice or pending payment as cleared money.

Work observations require a stable actual disjoint work_key, phase, method, complete period, matching cohort identifier, observer and source reference. Changed filenames do not create new work. Include explicit measured zeroes and all recurring review/correction/reporting/billing.
