# Definitions and economic interpretation

## Agree the source boundary

A study uses one evidence side, a declared as-of instant, one currency, a normalised physical quantity unit and one accounting basis. Period starts are inclusive and ends exclusive. Fiscal/calendar definitions and actual duration remain visible. A full period that has not ended by cutoff is incomplete.

An extract's available_at is the time that complete edition existed and was available to the study, independently of when this desk captured it. An edition arriving later is excluded from an earlier known-at view. Choose an actual earlier retained edition to study earlier knowledge. Editing a record creates a new complete derived edition with its correction time; it does not silently rewrite earlier evidence.

The input tables are a neutral contract for supplied exports. They do not assert that a particular ERP exposes these columns natively, that multiple systems are disconnected, or that a named integration is installed.

## Output, process and physical yield

Every SKU has a site, comparison key, process specification, gross_good or net_good output basis, good-output definition and optional physical-yield definition. Retain recipe, moisture, cook loss, additions, rework, grades and by-products when they define the real process.

Units use an exact positive numerator/denominator conversion for that SKU. For example, a gram-to-kilogram rule is 1/1000. No automatic currency conversion is performed. Distinct production slice_keys must describe disjoint output populations within SKU and period. A second export name is not evidence of a second lot.

Good quantity is the sum of included, source-defined accepted output converted to the study unit. Physical yield is that quantity divided by valid supplied input quantity. Missing or zero denominator produces an undefined ratio. A ratio above one is retained with a definition-review finding, since additions and different physical conventions can matter. Yield is never automatically turned into lost-material value, recovered margin or cash.

Compared strata require exactly one SKU per selected comparison key on each side, matching process specification, gross/net basis, good definition, output scope and quantity unit. A yield delta additionally requires matching input scope and yield definition. Rosina-style pasta/protein or raw/cooked products require their actual separate strata; generic weight alone does not make them comparable.

## Costs, allocations and active hours

Direct labour includes permanent, agency and other_direct categories. Each cost row identifies its accounting period, currency, accounting basis and canonical economic_pool_id. That pool identity spans systems: payroll and agency records for the same economic cost cannot both be included.

A site-specific cost can allocate only to that site's SKU. A declared shared pool may have blank site_id and allocate across named sites/SKUs. Exact shares must sum to one for a nonzero included pool. Allocated and unallocated amounts remain visible. Signed credits remain signed. An invalid or unresolved pool suppresses the affected cost rate instead of disappearing.

Coverage requires one named, dated, source-backed record for each site/period/dataset. Complete and observed_zero are distinct. Unknown inclusion, incomplete categories, conflicting zero attestations and unresolved parent identities stay visible. Zero can be established by observed-zero coverage; missing values are not converted to zero.

Active hours are separate actual person-work observations, with worker type and canonical population identity. They are not elapsed line time or waiting duration. Signed adjustments are allowed when explicitly typed and source-backed; a negative resulting active-hours population remains unresolved.

## Matched rate comparisons

Let q0 and q1 be the reference/current good quantities and r0 and r1 their direct-labour cost per normalised output unit.

- Signed rate change: r1 − r0.
- Fixed-reference-volume cost change: sum((r1 − r0) × q0).
- Actual-current-volume cost change: sum((r1 − r0) × q1).
- Reference-mix weighted rate change: fixed-reference-volume change / sum(q0).

These are different measures. Positive means a higher direct-labour cost rate; negative means a lower rate. The actual-current exposure uses current volume, while the reference-mix view holds reference output composition fixed. Neither is a recovered-cash total or a causal claim.

Cross-site periods must use the same boundaries. Baseline/current periods must not overlap. Full actual duration remains visible and no monthly/annual extrapolation is applied. Different product mixes are compared within declared matched strata before combining their selected exposures.

## Ledger margin and benefits

Gross margin is the actual supplied net sales minus COGS of the same period, currency and accounting basis. Labour already inside COGS is never subtracted again. Margin percentage is undefined when net sales are nonpositive.

The benefit register separates potential declarations, finance-accepted realised_cash and unmonetized_capacity. Accepted realised cash requires an actual named acceptance, date, source and independent economic scope. Duplicate accepted canonical pools suppress that accepted cash total. Potential and capacity remain separate and are never added to gross-margin or rate changes. An empty cash register remains unknown; an explicit finance-accepted zero is a different observation.

## Exact numbers and review

Decimal inputs are parsed as exact reduced rational values. The report carries numerator, denominator and a rounded decimal display. Display precision is twelve decimal places; exported JSON retains the full exact ratio. Inputs use ordinary decimal strings, not floating point or exponent notation.

Operations and finance acceptance applies to the complete current study digest, including configuration, originals, selected mappings and attached bytes. Any changed study evidence makes prior reviews historical. Review records never hide source exceptions or independently establish economic causality.
