# Complete authored equipment-service workflow

Data class: authored_course

Source scope: Fictional original customer, site, unit, technical and commercial records.

Returned scope: Fictional returned mappings and actual-record observations for the complete eight-case course.

Selected edition: 67b819854c39b49ac9f3d3f9a5ac7f22435b201c0c968c7f2ae51513371fdd0f

Comparison: selected_fields_match; review: unreviewed

| Kind | Original rows | Returned rows |
|---|---:|---:|
| organisations | 3 | 3 |
| sites | 2 | 2 |
| people | 3 | 3 |
| technical_authorities | 6 | 6 |
| assets | 11 | 11 |
| identity_links | 11 | 11 |
| procedures | 8 | 8 |
| eligibility | 8 | 8 |
| obligations | 1 | 1 |
| cases | 8 | 8 |
| inspections | 8 | 8 |
| inspection_items | 8 | 8 |
| deficiencies | 3 | 3 |
| work | 3 | 3 |
| certificates | 4 | 4 |
| certificate_events | 4 | 4 |
| custody_events | 2 | 2 |
| reports | 1 | 1 |
| report_inputs | 8 | 8 |
| report_reviews | 2 | 2 |
| effort | 144 | 144 |
| source_documents | 55 | 55 |
| commerce_authorities | 9 | 9 |
| commerce_quote_lines | 1 | 1 |
| commerce_approvals | 1 | 1 |
| commerce_work_allocations | 1 | 1 |
| commerce_sales_lines | 2 | 2 |
| commerce_policies | 2 | 2 |
| commerce_entitlements | 1 | 1 |
| commerce_replacements | 1 | 1 |
| commerce_invoice_lines | 4 | 4 |
| commerce_credits | 1 | 1 |
| commerce_warranty_claims | 1 | 1 |
| commerce_warranty_events | 2 | 2 |
| commerce_rentals | 1 | 1 |
| commerce_rental_events | 2 | 2 |
| commerce_payments | 1 | 1 |

## Differences

Every selected canonical field matches through the explicit identity maps.

## Retained photo and document bytes

No mapped record pairs have retained attachment bytes.

333 mapped record pairs have no retained attachment bytes on either side; the complete per-record inventory is included in comparison.json.

Unobserved means neither side supplied retained attachment bytes. Matching record references do not establish matching photo or document contents.

## Operator review

No review recorded for this edition.

# Equipment Service and Entitlement Study

Source state: observed. All results describe supplied records, not an equipment release.

## Complete intake

Observed 8; included 8; excluded 0; unresolved 0; expected 8. Population complete: true.

| Case | Customer unit | Reported status | Inspections | Work | Valid customer deliveries | Packet record chain |
| --- | --- | --- | --- | --- | --- | --- |
| CASE-REPLACE | OLD | replacement supplied | 1 | 1 | 0 | false |
| CASE-FIRST | FIRST | recorded service | 1 | 1 | 1 | true |
| CASE-REPAIR | HOIST | recorded service | 2 | 1 | 1 | true |
| CASE-RENTAL | MONITOR | recorded service | 1 | 0 | 1 | true |
| CASE-DECLINED | DECLINED | repair declined | 1 | 0 | 0 | false |
| CASE-UNSUPPORTED | UNSUPPORTED | model not supported | 1 | 0 | 0 | false |
| CASE-UNKNOWN | UNKNOWN | recorded service | 0 | 0 | 0 | false |
| CASE-SENSOR | SENSOR | recorded service | 1 | 0 | 1 | true |

## Actual document events

- DEL-FIRST — delivered / CASE-FIRST / FIRST at 2026-10-02T11:10:00.000Z: record binding supported.
- DEL-HOIST — delivered / CASE-REPAIR / HOIST at 2026-10-02T11:10:00.000Z: record binding supported.
- DEL-MONITOR — delivered / CASE-RENTAL / MONITOR at 2026-10-02T11:10:00.000Z: record binding supported.
- DEL-SENSOR — delivered / CASE-SENSOR / SENSOR at 2026-10-02T11:10:00.000Z: record binding supported.

## Commercial amounts

Quotes, invoices, credits, warranty settlements, rental accrual and observed cash remain separate. Exact full line and authority results are retained in service/analysis.json.

### quoted

- CAD: 176; complete true.
### approved quote

- CAD: 88; complete true.
### completed sales

- CAD: 1500; complete true.
### issued invoices

- CAD: 1158; complete true.
### approved unposted credits

### posted credits

- CAD: 50; complete true.
### observed net cash

- CAD: 88; complete true.
### modelled rental accrual

- CAD: 20; complete true.

## Recurring active work

Whole-population comparison complete: true. Baseline 288 person-minutes; current 232; signed current-minus-baseline −56.

Matched subset: 288 → 232 person-minutes. All observed current work: 232. An incomplete whole population is not a demonstrated whole-business saving.

## Frozen reports

- REPORT-FINAL: source inputs true, population true, named reviews true, overall true.

## Source issues

- SERVICE_ELIGIBILITY_UNRESOLVED — inspections/inspection-INS-UNSUPPORTED: Retained actual source context requires review


Independent supplied-record equipment service study. It compares actual identities, approved source editions, performed work, commercial observations and delivered documents. Record-chain completeness is not an equipment serviceability or safety-release decision.
