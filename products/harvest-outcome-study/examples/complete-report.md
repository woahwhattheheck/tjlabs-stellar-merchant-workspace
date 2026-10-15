# Complete authored harvest, quality and physical-disposition study

Data class: authored_course

Source scope: Fictional six-batch harvest, original model outputs, actual authored dispatch and later quality observations

Returned scope: Complete returned source tables and full physical/context/effort histories

Selected edition: 01278a26caa445cff745206705c13caaac14f55be3e85d7307ef5e976c1cdbd7

Comparison: selected_fields_match; review: unreviewed

| Kind | Original rows | Returned rows |
|---|---:|---:|
| growers | 1 | 1 |
| sites | 1 | 1 |
| crops | 2 | 2 |
| locations | 1 | 1 |
| loggers | 1 | 1 |
| people | 4 | 4 |
| buyers | 3 | 3 |
| protocols | 1 | 1 |
| invoice_lines | 1 | 1 |
| authorities | 9 | 9 |
| population_members | 6 | 6 |
| effort | 96 | 96 |
| harvest_batches | 6 | 6 |
| harvest_transfers | 2 | 2 |
| harvest_dispositions | 2 | 2 |
| harvest_storage | 7 | 7 |
| harvest_temperatures | 6 | 6 |
| harvest_models | 1 | 1 |
| harvest_forecasts | 4 | 4 |
| harvest_forecast_inputs | 12 | 12 |
| harvest_quality | 6 | 6 |
| harvest_demands | 3 | 3 |
| harvest_plans | 1 | 1 |
| harvest_plan_lines | 3 | 3 |
| harvest_plan_reviews | 1 | 1 |
| harvest_dispatches | 3 | 3 |
| harvest_outcomes | 5 | 5 |
| harvest_credits | 1 | 1 |

## Differences

Every selected canonical field matches through the explicit identity maps.

## Retained photo and document bytes

No mapped record pairs have retained attachment bytes.

189 mapped record pairs have no retained attachment bytes on either side; the complete per-record inventory is included in comparison.json.

Unobserved means neither side supplied retained attachment bytes. Matching record references do not establish matching photo or document contents.

## Operator review

No review recorded for this edition.

# Harvest and Outcome Study

Source state: observed.

## Complete physical-batch population

Observed 6; included 6; excluded 0; unresolved 0; expected 6. Complete: true.

## Physical inventory

| Batch source | Unit | Created quantity | Transferred | Dispatched | Warehouse dispositions | Remaining | Valid |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | kg | 100 | 100 | 0 | 0 | 0 | true |
| A1 | kg | 60 | 0 | 50 | 0 | 10 | true |
| A2 | kg | 40 | 0 | 40 | 0 | 0 | true |
| B | kg | 80 | 0 | 60 | 0 | 20 | true |
| C | kg | 50 | 0 | 0 | 0 | 50 | true |
| D | kg | 30 | 0 | 0 | 7 | 23 | true |

## Supplied forecast outcomes

Declared holdout forecasts 4; valid 4; unresolved 0; observed endpoints 3. Distinct valid original harvest families 3. Mean distance to observed censoring interval 0.666666666667 hours. Average distance from the prediction to the observed censoring interval; a lower bound on absolute error, not a measured exact-endpoint MAE.

| Forecast | Batch | Outcome state | Lower observed hours | Upper observed hours | Error lower bound | Different protocol observations |
| --- | --- | --- | --- | --- | --- | --- |
| FC-A1 | A1 | interval_censored | 24 | 48 | 2 |  |
| FC-A2 | A2 | interval_censored | 30 | 36 | 0 |  |
| FC-B | B | right_censored | 60 | unresolved | 0 |  |
| FC-C | C | unobserved | unresolved | unresolved | unresolved |  |

## Reviewed plans and actual dispatch

Valid complete reviewed plans 1; actual dispatches 3; recorded plan deviations 0. Proposed allocation never consumes physical stock.

- SHIP-A1: 50 kg dispatched; 50 dispositioned; 0 unknown; complete true.
- SHIP-A2: 40 kg dispatched; 30 dispositioned; 10 unknown; complete false.
- SHIP-B: 60 kg dispatched; 60 dispositioned; 0 unknown; complete true.

## Observed commercial amounts

### observed sold value

- USD: 320.
### posted credits

- USD: 20.

## Whole recurring work

Complete comparison true. Baseline 288 person-minutes; current 210; signed current-minus-baseline −78. Matched subset and all observed current effort remain in the full analysis.

## Source issues

No unresolved source issue in the selected complete scope.


Supplied harvest, prediction, quality, dispatch and commercial records. Whole crop and model suitability is retained with the source protocol; imported predictions remain distinct from actual observed outcomes.
