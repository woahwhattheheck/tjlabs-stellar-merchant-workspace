# Authored complete construction workflow

Data class: authored_course

Source scope: Complete authored agreements, progress, milestones, invoices, bank observations and supplier records

Returned scope: Mapped independent trial records; exact source counterpart retained

Selected edition: 3b7115300166945c18c2c09ca566ab9cdb7d329ece40bd4f38c16e00523fc06c

Comparison: selected_fields_match; review: unreviewed

| Kind | Original rows | Returned rows |
|---|---:|---:|
| organisations | 3 | 3 |
| people | 3 | 3 |
| authorities | 2 | 2 |
| projects | 2 | 2 |
| contract_versions | 2 | 2 |
| contract_lines | 2 | 2 |
| contract_events | 0 | 0 |
| variations | 2 | 2 |
| variation_lines | 2 | 2 |
| approvals | 6 | 6 |
| measurements | 3 | 3 |
| progress_claims | 2 | 2 |
| claim_lines | 3 | 3 |
| certifications | 2 | 2 |
| certification_lines | 3 | 3 |
| retention_events | 3 | 3 |
| invoices | 4 | 4 |
| invoice_lines | 9 | 9 |
| accounting_events | 4 | 4 |
| commitments | 1 | 1 |
| commitment_lines | 1 | 1 |
| deliveries | 1 | 1 |
| cost_invoices | 1 | 1 |
| cost_invoice_lines | 1 | 1 |
| cost_payments | 1 | 1 |
| reports | 1 | 1 |
| report_inputs | 1 | 1 |
| effort | 16 | 16 |
| source_documents | 0 | 0 |
| payment_milestones | 4 | 4 |

## Differences

Every selected canonical field matches through the explicit identity maps.

## Retained photo and document bytes

projects: P1 → P1: exact_bytes_match; original f09753deebe1ecaf163525111bc78a9169204c13989596c7fcb0aaf50ae05a47; returned f09753deebe1ecaf163525111bc78a9169204c13989596c7fcb0aaf50ae05a47
contract_versions: CV1 → CV1: exact_bytes_match; original 79b8a651edf1b3ad8ef2b1a16b8924c4a97380b4e67adfa0f35ce11de8212f7f; returned 79b8a651edf1b3ad8ef2b1a16b8924c4a97380b4e67adfa0f35ce11de8212f7f
contract_versions: CV2 → CV2: exact_bytes_match; original 4a3d046a56d7225ba7cb4fdb20ed2918c87537486c10f2c13c0300da69aa8c3f; returned 4a3d046a56d7225ba7cb4fdb20ed2918c87537486c10f2c13c0300da69aa8c3f

82 mapped record pairs have no retained attachment bytes on either side; the complete per-record inventory is included in comparison.json.

Unobserved means neither side supplied retained attachment bytes. Matching record references do not establish matching photo or document contents.

## Operator review

No review recorded for this edition.

# Construction progress, claims and cost study

Knowledge cutoff: 2026-10-15T12:00:00Z

Decision boundary: 2026-10-15T12:00:00Z

Exact supplied-record study; actual signed contracts and source decisions control. No statutory VAT or retention default, no automatic approval/certificate/invoice/payment, and no claim that a pre/post time change establishes causality or cash saving.

## Complete claim population

| Retained | Included | Excluded | Unresolved | Complete denominator |
|---|---|---|---|---|
| 2 | 2 | 0 | 0 | 2 |

## Project money and cost

| Project | Currency | Actual invoiced net | Client cash | Actual supplier cost | Uninvoiced commitment | Forward committed cost | Issues |
|---|---|---|---|---|---|---|---|
| P1 | EUR | 5987.5 | 4598 | 660 | 400 | 1060 |  |
| P2 | EUR | 500 | 605 | 0 | 0 | 0 |  |

## Claims and certifications

| Claim | Project | Status | Source net | Valid | Issues |
|---|---|---|---|---|---|
| C1 | P1 | submitted | 4000 | true |  |
| C2 | P1 | submitted | 6250 | true |  |
| Certificate | Claim | Certified at | Period net movement | Valid | Issues |
|---|---|---|---|---|---|
| CERT1 | C1 | 2026-09-03T10:00:00Z | 4000 | true |  |
| CERT2 | C2 | 2026-10-03T10:00:00Z | 2250 | true |  |

## Actual milestones

| Milestone | Trigger | Basis | Amount | Achieved | Eligible | Issues |
|---|---|---|---|---|---|---|
| DEP1 | signature | accepted_contract_net | 500 | 2026-08-01T09:00:00Z | true |  |
| MP1 | signature | accepted_contract_net | 500 | 2026-08-01T09:00:00Z | true |  |
| MP2 | start | accepted_contract_net | 1000 | 2026-08-10T09:00:00Z | true |  |
| MP3 | reception | accepted_contract_net | 3500 |  | false | MILESTONE_NOT_OBSERVED_ACHIEVED, APPROVAL_IDENTITY_OR_SCOPE, MILESTONE_NOT_ELIGIBLE |

## Retention states

| Project | Applicability | Complete | Held | Released | Received | Held balance | Released awaiting cash | Issues |
|---|---|---|---|---|---|---|---|---|
| P1 | true | true | 312.5 | 50 | 0 | 262.5 | 50 |  |
| P2 | false | true | 0 | 0 | 0 | 0 | 0 |  |

## Actual invoices

| Invoice | Currency | Source gross | Reconciled | Observed receipt | Outstanding | Issues |
|---|---|---|---|---|---|---|
| D1 | EUR | 605 | true | 605 | 0 |  |
| I1 | EUR | 3993 | true | 3993 | 0 |  |
| I2 | EUR | 2646.87 | true | 0 | 2646.87 |  |
| P2-I1 | EUR | 605 | true | 605 | 0 |  |

## Historical reports

| Report | Decision | Knowledge | Inputs supported | Issues |
|---|---|---|---|---|
| REPORT1 | 2026-09-05T12:00:00Z | 2026-09-05T12:00:00Z | true |  |

## Complete recurring work

Signed change is current minus baseline active person-minutes for matched project/cohort periods with complete recurring phase coverage. Unmatched current work remains in the complete current total; setup is separate. No time-to-cash extrapolation.

| Matched cohorts | Baseline minutes | Current minutes | Signed change | All current work |
|---|---|---|---|---|
| 1 | 80 | 64 | −16 | 64 |

## Source and operating exceptions

| Code | Family | ID | Detail |
|---|---|---|---|
| VARIATION_PRICE_UNAGREED | variations | V1 | Review the exact linked source and chronological context. |
| MILESTONE_NOT_OBSERVED_ACHIEVED | milestones | MP3 | Review the exact linked source and chronological context. |
| APPROVAL_IDENTITY_OR_SCOPE | milestones | MP3 | Review the exact linked source and chronological context. |
| MILESTONE_NOT_ELIGIBLE | milestones | MP3 | Review the exact linked source and chronological context. |


Independent supplied-record construction study. Approved contract scope, measured work, authorised pricing, certification, retained balances, issued invoices and actual cash remain distinct. The desk observes supplied records and does not issue approvals, certificates, invoices or payments.
