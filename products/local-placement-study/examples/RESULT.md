# Local placement operating study

As of 2026-10-15T00:00:00Z

Authored or supplied records only. Actual authority, displayed creative, unique viewer estimates, responses and cleared cash are separate. Estimates are not automatically additive. Prior report inputs are evaluated at generation; later observations remain available for later editions. Capacity changes do not establish realised financial savings.

## Complete scheduled population

| Included | Late-added | Unresolved | Completed / denominator | Pending |
|---|---|---|---|---|
| 8 | 0 | 0 | 2 / 8 | 0 |

| Schedule | Placement | Window | Actual state | Complete displays | Ad seconds | Issues |
|---|---|---|---|---|---|---|
| S1 | P1 | 2026-10-12T09:00:00Z–2026-10-12T09:01:00Z | observed_complete | 1 | 15 |  |
| S2 | P1 | 2026-10-12T09:10:00Z–2026-10-12T09:11:00Z | incomplete_or_unresolved | 0 | 0 |  |
| S3 | P1 | 2026-10-12T09:20:00Z–2026-10-12T09:21:00Z | incomplete_or_unresolved | 0 | 0 |  |
| S4 | P1 | 2026-10-12T11:10:00Z–2026-10-12T11:11:00Z | no_observed_delivery | 0 | 0 | ASSET_NOT_OPERATIONAL |
| S5 | P1 | 2026-10-12T12:10:00Z–2026-10-12T12:11:00Z | observed_complete | 1 | 15 |  |
| S6 | P1 | 2026-10-12T10:30:00Z–2026-10-12T10:31:00Z | incomplete_or_unresolved | 0 | 0 | COMPETING_CATEGORY_OVERLAP |
| S7 | PB | 2026-10-12T09:00:00Z–2026-10-12T09:01:00Z | failed_or_partial | 0 | 0 |  |
| S8 | PP | 2026-10-12T09:00:00Z–2026-10-12T09:01:00Z | cancelled_or_partial | 0 | 0 |  |

## Actual inventory and eligible placements

| Asset | Venue | Format | State | Available | Operating seconds | Ad-visible seconds | Issues |
|---|---|---|---|---|---|---|---|
| SCREEN | V1 | screen | restored | true | 14400 | 30 |  |
| BENCH | V2 | bench | operational | true | 18000 | 0 |  |
| PLANTER | V2 | planter | operational | true | 18000 | 0 |  |

| Placement | Venue | Booking supported | Current eligible | Issues |
|---|---|---|---|---|
| P1 | V1 | false | true |  |
| PB | V2 | true | true |  |
| PP | V2 | true | true |  |
| PC | V1 | false | false | PLACEMENT_CHRONOLOGY_OR_WINDOW, COMPETING_CATEGORY_OVERLAP |

## Display observations

| Event | External identity | Schedule | Kind / mode | Counted | Replay | Seconds | Issues |
|---|---|---|---|---|---|---|---|
| PLAY1 | event-PLAY1 | S1 | play_completed / ad_panel | true | false | 15 |  |
| ACK2 | event-ACK2 | S2 | player_ack / ad_panel | false | false | 0 |  |
| OVERRIDE3 | event-OVERRIDE3 | S3 | play_completed / override | false | false | 15 | PLAY_MODE_NOT_PLANNED, AD_NOT_VISIBLE |
| PLAY5 | event-PLAY5 | S5 | play_completed / ad_panel | true | false | 15 |  |
| PLAY6 | event-PLAY6 | S6 | play_completed / ad_panel | false | false | 15 | PLAY_PERMISSION_OR_INVENTORY_UNSUPPORTED |
| FAIL7 | event-FAIL7 | S7 | failed / ad_panel | false | false | 0 |  |
| CANCEL8 | event-CANCEL8 | S8 | cancelled / ad_panel | false | false | 0 |  |

## Separate estimates and responses

| Estimate | Method | Supplied estimated views | Observed | Issues |
|---|---|---|---|---|
| EST1 | Authored operator traffic model; not unique people | 25 | true |  |
| EST2 | Authored alternate overlapping estimate | 30 | true |  |

Actual distinct response observations: 1. No causal or unique-viewer conversion is inferred.

## Immutable customer report editions

| Report | Generated | Published | Inputs supported at generation | Completed play inputs | Issues |
|---|---|---|---|---|---|
| R1 | 2026-10-12T12:20:00Z | 2026-10-12T12:21:00Z | false | 1 | REPORT_INPUT_UNSUPPORTED |
| R2 | 2026-10-12T12:35:00Z | 2026-10-12T12:36:00Z | true | 2 |  |

## Issued invoices and cleared money

| Invoice | Currency | Issued total | Line-reconciled | Net recorded receipts | Issues |
|---|---|---|---|---|---|
| AUTH-001 | USD | 249.00 | true | 249 |  |

## Full recurring work

Current minus baseline active person-minutes for complete matched periods and cohort keys. Negative means less observed work; positive means more. All current work is separate, including unmatched observations. No cash saving or causal effect is inferred.

| Paired placements | Baseline minutes | Current minutes | Signed change | All observed current minutes |
|---|---|---|---|---|
| 2 | 60 | 52 | −8 | 52 |

## Source and operating exceptions

| Code | Kind / ID | Source | Detail |
|---|---|---|---|
| PLACEMENT_CHRONOLOGY_OR_WINDOW | placements / PC | placements-returned.csv:5 | Review the retained original and exact effective/recorded context. |
| COMPETING_CATEGORY_OVERLAP | placements / PC | placements-returned.csv:5 | Review the retained original and exact effective/recorded context. |
| PLAY_MODE_NOT_PLANNED | play_events / OVERRIDE3 | play_events-returned.csv:4 | Review the retained original and exact effective/recorded context. |
| AD_NOT_VISIBLE | play_events / OVERRIDE3 | play_events-returned.csv:4 | Review the retained original and exact effective/recorded context. |
| PLAY_PERMISSION_OR_INVENTORY_UNSUPPORTED | play_events / PLAY6 | play_events-returned.csv:6 | Review the retained original and exact effective/recorded context. |
| REPORT_INPUT_UNSUPPORTED | reports / R1 | reports-returned.csv:2 | Review the retained original and exact effective/recorded context. |
