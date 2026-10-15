# Calculation and interpretation

Amounts are decimal strings converted to reduced rational numbers. Inputs accept up to eighteen fractional decimal places without exponent notation. The calculation retains exact fractions and rounds half away from zero once per charge to currency cents. Display rounding never changes the stored source or fraction. Use a currency with a two-decimal minor unit; this edition does not implement foreign-exchange conversion or currency-specific non-cent units.

## Storage

For daily-prorated monthly storage, each day's count is multiplied by its actual dated monthly rate and divided by the number of days in that calendar month. Exact amounts accumulate within each applicable rate line before charge rounding. Daily storage uses the observed daily count and daily rate. Snapshot-month storage uses one explicitly declared valid calendar day. Changes of billing basis or snapshot day inside a month require source review.

The retained public example has 38 pallets on days 1–24 and 40 on days 25–30: 1,152 pallet-days. At 22 per month, the exact charge is 844.80. A change from 22 to 24 on day 16 uses 570 pallet-days at 22 and 582 at 24, producing 883.60. A rough half-month average of 883.20 differs by 0.40 because it ignores the actual count distribution.

A missing day or duplicate whole count suppresses the complete client subtotal. Observed partial charges remain visible. Missing daily data is never assumed zero and never automatically carried forward.

## Event charges and minimum

Normal service quantities use their actual matching unit and per-unit rate. Order/shipment events use one event charge. Additional picks are max(child units minus included units, zero), with an explicit matching additional-unit rate. Fulfilled line items consolidate only within the declared actual source/client/warehouse/day/fulfilment group.

The client/month minimum comes from the month-end complete card and applies once across that client's declared warehouse scope. Declare a zero minimum explicitly when no minimum applies. The shortfall is calculated only after a complete subtotal; missing source information cannot be disguised by applying a minimum.

Rate versions are complete cards, not implicit patches. An exact warehouse line and a wildcard line cannot both match without an ambiguity. Missing rates and unit mismatches remain exceptions.

## Actual records and next-period corrections

Actual invoice subtotal, tax and total must reconcile. Actual lines bind exact proposed charge keys, code, unit, quantity and rounded amount. Unknown, repeated or missing charge identities remain visible even when grand totals happen to match. Actual invoice currency must match the client and study before comparison.

A later source edition for an already issued period is visible as a post-issue discrepancy. The raw importer refuses replacement once an issued invoice for that month is retained. Signed next-period adjustments preserve original_invoice_id, original_service_date, posting effective_date, amount, currency, actual approver and reason. They do not modify prior invoice originals.

Accounting observations retain both observed and recorded timestamps and the actual account/provider identities. Multiple accounts need an explicit account selection; tied observations are ambiguous. Paid requires an actual zero-balance observation. A proposal is never counted as an issued invoice or received cash.

## Whole-work effort

Observe disjoint active person-minute slices for both methods and every declared recurring phase. Include extraction, mapping, reconciliation, exceptions, review, correction, duplicate entry and handover where performed. Missing phases remain unknown; different covered phase sets suppress the difference. Renaming a file does not make the same person/time/phase slice new work.

The signed difference is study minus existing-process active minutes. Negative means less observed active effort for this case; it is not automatically labour cost saved or a causal claim about a product. The authored six-phase example is 60 versus 48 minutes, a difference of −12.
