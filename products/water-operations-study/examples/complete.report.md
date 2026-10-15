# Complete authored three-system water operations workflow

Data class: authored_course

Source scope: Fictional approved schedules, originals, field logs and complete laboratory source

Returned scope: Fictional returned tables and actual packet observations; no real utility records

Selected edition: 1bff9d089c64a30a4fa8f1de5c482e5c44aac50d3edc91d160ad7411d7a4239a

Comparison: selected_fields_match; review: unreviewed

| Kind | Original rows | Returned rows |
|---|---:|---:|
| organisations | 1 | 1 |
| systems | 3 | 3 |
| locations | 3 | 3 |
| assets | 4 | 4 |
| source_use | 2 | 2 |
| people | 6 | 6 |
| authorities | 14 | 14 |
| schedules | 12 | 12 |
| obligations | 9 | 9 |
| field_readings | 3 | 3 |
| reading_reviews | 3 | 3 |
| operational_events | 1 | 1 |
| reports | 4 | 4 |
| report_inputs | 9 | 9 |
| report_reviews | 2 | 2 |
| dispatch_events | 2 | 2 |
| handovers | 1 | 1 |
| handover_items | 1 | 1 |
| handover_acknowledgements | 1 | 1 |
| tasks | 2 | 2 |
| task_events | 2 | 2 |
| effort | 144 | 144 |
| source_documents | 0 | 0 |
| population_members | 9 | 9 |
| lab_laboratories | 1 | 1 |
| lab_orders | 3 | 3 |
| lab_order_lines | 4 | 4 |
| lab_samples | 6 | 6 |
| lab_custody_events | 16 | 16 |
| lab_accessions | 5 | 5 |
| lab_reports | 4 | 4 |
| lab_results | 5 | 5 |
| lab_amendments | 2 | 2 |
| lab_reviews | 5 | 5 |
| lab_report_inputs | 4 | 4 |
| lab_sample_links | 1 | 1 |

## Differences

Every selected canonical field matches through the explicit identity maps.

## Retained photo and document bytes

No mapped record pairs have retained attachment bytes.

294 mapped record pairs have no retained attachment bytes on either side; the complete per-record inventory is included in comparison.json.

Unobserved means neither side supplied retained attachment bytes. Matching record references do not establish matching photo or document contents.

## Operator review

No review recorded for this edition.

# Water Operations Study

observed. Supplied operational and reporting records only; no treatment command or statutory compliance determination.

## Scheduled-work population

Observed 9; included 9; excluded 0; unresolved 0; expected 9. Complete: true.

| Member | System | Obligation | Included | Evidence fulfilled | Issues |
| --- | --- | --- | --- | --- | --- |
| MEM-S-A1 | SYS-A | OB-S-A1 | true | true |  |
| MEM-S-A2 | SYS-A | OB-S-A2 | true | true |  |
| MEM-S-A3 | SYS-A | OB-S-A3 | true | false |  |
| MEM-S-A4 | SYS-A | OB-S-A4 | true | true |  |
| MEM-S-B1 | SYS-B | OB-S-B1 | true | true |  |
| MEM-S-C1 | SYS-C | OB-S-C1 | true | false |  |
| MEM-READ-SYS-A | SYS-A | OB-READ-SYS-A | true | true |  |
| MEM-READ-SYS-B | SYS-B | OB-READ-SYS-B | true | true |  |
| MEM-READ-SYS-C | SYS-C | OB-READ-SYS-C | true | true |  |

## Registered inventory and actual period use

Registered status is retained separately from whether an asset was observed in use. No count of active or standby registry rows is substituted for a period-use statement.

- WELL-SYS-A: 2026-10-15T08:00:00.000Z to 2026-10-15T09:30:00.000Z; used; 1200 US gal; source binding true.
- STANDBY-A: 2026-10-15T08:00:00.000Z to 2026-10-15T09:30:00.000Z; not_used; 0 US gal; source binding true.

## Laboratory custody and amendments

Valid collected samples 6; accepted accessions 4; rejected 1; effective usable results 4. Earlier report inputs needing current amendment/review reconciliation: 1. Nondetect and other qualifiers remain literal observations, not numeric zero.

## Reports and actual dispatch

- TARGET-SYS-A / October 2026 report label; data morning 15 October: claimed 2026-10-15T08:00:00.000Z to 2026-10-15T09:35:00.000Z, cutoff 2026-10-15T10:30:00.000Z. Inputs true; population true; named reviews true; complete true.
- TARGET-SYS-B / Authored operational packet — October 2026: claimed 2026-10-15T08:00:00.000Z to 2026-10-15T09:35:00.000Z, cutoff 2026-10-15T10:30:00.000Z. Inputs false; population false; named reviews false; complete false.
- TARGET-SYS-C / Authored operational packet — October 2026: claimed 2026-10-15T08:00:00.000Z to 2026-10-15T09:35:00.000Z, cutoff 2026-10-15T10:30:00.000Z. Inputs false; population false; named reviews false; complete false.
- SEND-A / sent / 2026-10-15T10:40:00.000Z: actual event binding supported.
- RECEIVE-A / received / 2026-10-15T10:45:00.000Z: actual event binding supported.

## Active recurring work

Whole-population comparison complete: true. Baseline 432 person-minutes; current 315; signed current-minus-baseline −117. Matched subset and unpaired work remain separate in the full analysis. There is no capacity-to-cash extrapolation.

## Source issues

- REPORT_TIME_OR_PREPARER — reports / DRAFT-SYS-B
- REPORT_ORIGINAL_UNAVAILABLE — reports / DRAFT-SYS-B
- REPORT_POPULATION_UNRECONCILED — reports / DRAFT-SYS-B
- REPORT_INPUT_BINDINGS_UNRESOLVED — reports / DRAFT-SYS-B
- REPORT_REVIEW_UNRESOLVED — reports / DRAFT-SYS-B
- REPORT_TIME_OR_PREPARER — reports / DRAFT-SYS-C
- REPORT_ORIGINAL_UNAVAILABLE — reports / DRAFT-SYS-C
- REPORT_POPULATION_UNRECONCILED — reports / DRAFT-SYS-C
- REPORT_INPUT_BINDINGS_UNRESOLVED — reports / DRAFT-SYS-C
- REPORT_REVIEW_UNRESOLVED — reports / DRAFT-SYS-C


Independent supplied-record water operations study. It retains approved schedules, readings, laboratory custody and amendments, historical reporting inputs and actual dispatch. Record-chain completeness is not a treatment decision or regulatory compliance determination.
