# Recurring route service study

Data class: authored_course; as of 2026-10-14T00:00:00Z

Population: 8 included scheduled obligations, 0 explicitly excluded, 0 unresolved. Denominator: 8. Revisit attempts retain their original scheduled stop.

| Measure | Count | Whole scheduled denominator |
|---|---:|---:|
| service_recorded | 5 | 8 |
| device_proof_complete | 4 | 8 |
| office_report_complete | 3 | 8 |
| billing_ready | 3 | 8 |

## Scheduled stops

| Stop | Scope | Attempts | Service recorded | Device proof | Office report | Billing ready | Issues |
|---|---|---|---|---|---|---|---|
| S1 | included | A1 | true | true | true | true |  |
| S2 | included | A2, A2R | true | true | true | true |  |
| S3 | included | A3 | false | false | false | false |  |
| S4 | included | A4 | false | false | false | false |  |
| S5 | included | A5 | true | true | true | true |  |
| S6 | included | A6 | true | false | false | false |  |
| S7 | included |  | false | false | false | false | NO_ATTEMPT_OBSERVED |
| S8 | included | A8 | true | true | false | false |  |

## Position observations

A1-P: within_reported_radius; distance 0 m; reported position radius 10 m; site uncertainty 5 m; age 0 seconds; fresh true.
A2R-P: within_reported_radius; distance 0 m; reported position radius 10 m; site uncertainty 5 m; age 0 seconds; fresh true.
A5-P: within_reported_radius; distance 0 m; reported position radius 10 m; site uncertainty 5 m; age 0 seconds; fresh true.
A6-P: overlap; distance 0 m; reported position radius 60 m; site uncertainty 5 m; age 0 seconds; fresh true.
A8-P: within_reported_radius; distance 0 m; reported position radius 10 m; site uncertainty 5 m; age 0 seconds; fresh true.

## Actual invoices

AUTH-001 / USD 100; reconciled true; actual net receipts 100; 

## Observed operating effort

3 paired scheduled stops: 84 → 72 person-minutes; signed change −12. All observed current effort 96. Paired active person-time only, with every declared phase. Negative change means less observed effort. All current rows remain separately visible; no extrapolated cash savings.

## Source exceptions

- NO_ATTEMPT_OBSERVED / stops / S7: Scheduled obligation requires reconciliation.
- AFTER_PHOTOS_INCOMPLETE / reports / R5A: Report retains its actual supplied evidence and unresolved inputs.
- SIGNATURE_INCOMPLETE / reports / R8: Report retains its actual supplied evidence and unresolved inputs.

A recorded location, signature, photo or completion statement does not independently prove that service happened. Findings reconcile supplied records and declared proof rules. Reports, readiness, invoices and payments are separate observations; this tool publishes no customer report and writes no accounting system.
