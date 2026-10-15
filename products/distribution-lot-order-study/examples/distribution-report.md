# Distribution Lot and Order Study

Source state: observed.

## Complete population

Observed 12; included 12; excluded 0; unresolved 0. Complete: true.

## Actual physical stock

| Lot | Warehouse | Product / unit | Physical quantity | Pending returned quantity | QA state |
|---|---|---|---:|---:|---|
| LOT-A | W-EAST | BULK / kg | 10 | 0 | released |
| LOT-C | W-EAST | BULK / kg | 30 | 0 | held |
| LOT-E | W-WEST | BULK / kg | 30 | 0 | released |
| LOT-B | W-EAST | BULK / kg | 55 | 5 | released |
| LOT-D | W-EAST | PACK / kg | 50 | 0 | released |
| LOT-E | W-EAST | BULK / kg | 20 | 0 | released |

Stock reconciliation complete: true. Repacking, in-transit stock and each original movement remain in the full analysis.

## Supplied allocation decisions

- DECISION-EARLY: complete frozen population true; accepted eligible proposals false.
- DECISION-EAST-SAFE: complete frozen population true; accepted eligible proposals true.
- DECISION-LATE: complete frozen population true; accepted eligible proposals true.
- DECISION-WEST: complete frozen population true; accepted eligible proposals true.

## Actual order outcomes

| Order line | State | Required | Dispatched | Accepted | Returned | Compliant full |
|---|---|---:|---:|---:|---:|---|
| ORDER-1 | open | 50 | 25 | 25 | 0 | false |
| ORDER-2 | open | 50 | 50 | 50 | 5 | true |
| ORDER-3 | open | 30 | 30 | 30 | 0 | true |
| ORDER-4 | open | 10 | 10 | 10 | 0 | true |
| ORDER-5 | open | 25 | 0 | 0 | 0 | false |
| ORDER-6 | cancelled | 10 | 0 | 0 | 0 | false |

Whole compliant line fraction unresolved. Each product/unit and customer order remains separate in the full analysis.

## Posted commercial values

- writeoff/GBP: 60.
- sale/GBP: 500.
- credit/GBP: 50.

## Complete recurring work

Complete comparison true. Baseline 324 active person-minutes; current 300; signed change −24. All current observations and increased phases are retained.

## Source issues

No unresolved source issue in the selected scope.
