# Source intake and canonical headers

DOMAIN_HEADERS.json and templates/*.csv are the exact maintained import contract. The 30 tables use their own named identifier: organisation_id, project_id, claim_id, invoice_id and so on. The application uses an internal non-enumerable ID accessor; it does not add a synthetic id column to exported source records.

## Source families

| Group | Tables |
|---|---|
| Parties and authority | organisations, people, authorities, projects |
| Accepted scope | contract_versions, contract_lines, contract_events |
| Changed work and approval | variations, variation_lines, approvals, measurements |
| Billing basis | payment_milestones, progress_claims, claim_lines |
| Certification and retention | certifications, certification_lines, retention_events |
| Customer accounting | invoices, invoice_lines, accounting_events |
| Supplier cost | commitments, commitment_lines, deliveries, cost_invoices, cost_invoice_lines, cost_payments |
| Source review and effort | reports, report_inputs, effort, source_documents |

Map each family from actual supplied extracts. Do not treat supplementary planning worksheets as canonical input. The original export may use different headers; select the actual original column for each canonical field.

An unmapped field is null internally and remains explicitly unobserved in selected/availability.json. The ordinary selected CSV uses a blank cell, so keep that availability manifest alongside it. A mapped empty source cell remains an observed blank.

## Exact values and sets

Amounts, rates and quantities are original decimal strings, without currency symbols or exponent notation. Rates in tax_rate, percentage and retention_rate use percentage values: 21 means 21%, and 5 means 5%. Project currency_decimals and rounding_mode are actual agreed/accounting settings.

Set-valued source references use semicolons: authority permissions, measurement_ids, delivery_ids and explicit milestone scope-key lists. Members are exact identifiers; repeated members are unresolved. Do not split a comma-containing source identifier.

A transaction's processor plus external_transaction_id identifies the actual external transaction globally across the study. transaction_amount is its retained whole source amount. allocation_group is for an explicit supported split; every member must carry the same original total, event, currency and source reference. The engine does not infer a total by adding unverified split rows.

## Time and original availability

Canonical operating instants use real UTC ISO strings, for example 2026-10-15T09:30:00Z. Preserve an original date-only value in the retained CSV. A date-only value is not silently assigned midnight or a timezone; it remains unresolved where an exact chronological boundary is required. Obtain the actual source boundary or record the limited precision through the ordinary source review.

The original capture time is separate from its availability time. A later consolidated extract cannot automatically reconstruct an earlier value. Select a retained edition appropriate to the declared cutoff and preserve the source history needed for historical decisions.

source_documents binds an original filename, content hash and source edition. Retain the bytes under Supporting originals and add the exact typed link. A SHA value alone does not mean the bytes were supplied. A changed file creates another retained document; identical bytes under different filenames preserve both original names.

## Authorised record vocabulary

- billing_basis: measured_progress, milestone, lump_sum, mixed.
- certification_required, retention_applicable, deposit_applicable: true, false, unknown.
- pricing_mode: unit_rate or lump_sum.
- price_basis: exclusive or inclusive.
- discount_kind: none, percent, fixed.
- quantity_mode: period or cumulative.
- Invoice document type: invoice or credit_note.
- Customer line types: work, milestone, deposit, deposit_application, retention_deduction, retention_release, adjustment.
- Accounting events: receipt, payment, refund, reversal, deposit_application, adjustment, pending, failed. The family determines the actual customer/supplier direction.
- Retention: held, release_due, released, received, reversed.
- Recurring work: recurring=true or false, actual workflow method and phase.

Authority permissions used by the workflow are accept_contract, instruct_variation, approve_quantity, approve_price, approve_measurement, certify_work, release_retention, approve_milestone and accept_delivery. These are the study's explicit permission vocabulary, mapped from actual authority evidence; they do not grant those permissions.

## Identity and comparison

Use separate crosswalks for every parent family. A returned record's parent is compared through that parent's crosswalk, not by assuming that raw IDs remained equal. Missing and duplicate identities remain visible. Source and returned document bytes are compared for each explicitly mapped record pair.

Before applying a corrected source, retain the original and explain the reason. The current record table is a selected interpretation; all prior originals, complete mappings and correction preimages remain in the saved session and exports.
