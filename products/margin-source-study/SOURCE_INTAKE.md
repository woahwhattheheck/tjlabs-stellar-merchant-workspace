# Margin Source Study Desk — implementation contract

An independent supplied-extract study for agreed sites, SKUs and accounting periods. Original source-system records, explicit identities and named operations/finance decisions govern the study.

## Source and known-at boundary

Every original/returned CSV, mapping, explicit ID crosswalk, binary supporting original, correction and complete working session is retained. Each extract has available_at separate from captured_at. An edition available after the as-of cutoff is displayed as later evidence and excluded from that cutoff's calculations. Select an actual retained earlier edition to study earlier knowledge; a later consolidated export cannot recreate missing historical values.

## Defined measures

Use explicit site/SKU identity, matched process specification, gross/net good-output definition, declared mass basis, exact supplied unit conversion and accounting currency. Currency conversion is outside the initial model; foreign amounts remain visible and unresolved for the configured currency. All source periods retain starts/ends and actual fiscal/calendar definitions.

Direct labour is the selected non-overlapping permanent, agency and other-direct cost pools allocated to a SKU divided by its normalised good output. Canonical economic_pool_id spans source systems: a payroll record and agency invoice covering the same economic cost must not both be counted. Allocation shares preserve their source basis, exact arithmetic and unallocated remainder.

Yield is a declared physical output/input ratio within the named process specification. Wet/cooked output, additions, rework, grade and by-product conventions must be defined and matched; output/input is not automatically lost material or cash. Active hours and permanent/temp source scope remain separately visible.

ERP gross margin uses net sales minus the actual COGS of the same declared accounting scope and period. Labour components already inside COGS are never subtracted again. Observed direct-cost comparisons are separate decomposition views.

## Comparisons and benefit register

Match explicit comparable SKU/spec strata before any cross-site or baseline/current rate comparison. Retain signed changes. Fixed-reference-volume and actual-current-volume cost exposures are distinct estimands; periods and product mixes remain visible. No silent annualisation or causal claim.

Potential declarations, finance-accepted realised cash and unmonetised capacity are separate benefit-register kinds. Canonical economic pools prevent overlapping realised claims from summing. Benchmark labour/yield/COGS views are never added into a recovery total. Missing source categories or partial coverage remain unknown; zero requires an actual observed-zero source attestation.

## Operating delivery

The complete deliverable will include ordinary industrial forms, source imports and mappings, cost allocation/reconciliation, current calculations, full source-bound operations/finance review, compact full-session recovery, source/report/CSV exports, native commands and a clearly authored three-site course. Existing source preservation and session primitives are reused without private prospect research.

## Canonical supplied-extract columns

### sites

`id, name, system_label, currency, external_ref`

### periods

`id, label, starts_at, ends_at, calendar_basis, external_ref`

### skus

`id, site_id, local_sku, comparison_key, process_spec, output_basis, good_definition, yield_definition, external_ref`

### units

`id, sku_id, source_unit, basis_unit, factor_numerator, factor_denominator, source_ref`

### production

`id, site_id, sku_id, period_id, slice_key, good_quantity, good_unit_id, input_quantity, input_unit_id, output_scope, input_scope, included, exclusion_reason, source_ref`

### costs

`id, site_id, period_id, economic_pool_id, cost_category, currency, amount, accounting_basis, included, exclusion_reason, source_ref`

### allocations

`id, cost_id, sku_id, share_numerator, share_denominator, allocation_basis, source_ref`

### hours

`id, site_id, sku_id, period_id, economic_pool_id, worker_type, active_hours, entry_type, included, exclusion_reason, source_ref`

### coverage

`id, site_id, period_id, dataset, status, reviewed_by, reviewed_at, source_ref`

### finance

`id, site_id, period_id, economic_pool_id, net_sales, cogs, currency, accounting_basis, included, exclusion_reason, source_ref`

### benefits

`id, site_id, period_id, economic_pool_id, kind, amount, currency, capacity_quantity, capacity_unit, status, accepted_by, accepted_at, independence_basis, source_ref`


Shared cost pools may leave site_id blank and allocate across named SKUs/sites. Every included economic pool must reconcile exactly; source-system aliases must use one canonical pool identity. Distinct production slice_keys denote disjoint output populations, not duplicate exports of the same lot. Source output_scope and good_definition must match across compared strata; input_scope and yield_definition must also match before a physical yield change is shown. Different recipe/moisture/cook-loss conventions remain separate strata. Coverage is explicitly reviewed for each site, period and dataset. A blank observation is not zero.

Operations and finance reviews bind the complete selected study digest. Each configured role must accept the current edition; changing a source, selection, mapping or study plan expires current acceptance while retaining the original review. Historical roles remain readable after role settings change.


## Practical import order

Sites and periods; SKUs; exact unit rules; production; costs and allocations; active hours; coverage; finance; benefits. Originals can arrive in another order and unresolved links remain visible until reconciled.

All IDs are literal text. Numeric values are decimal strings. Period/availability/review times use real UTC ISO timestamps. Included values are true, false or unknown. Excluded records keep a reason. Do not infer zero from an empty export without an actual named coverage statement.

Coverage datasets are production, permanent, agency, other_direct, hours and finance. Each site/period/dataset needs one distinct complete or observed_zero row, reviewed_by, reviewed_at and source_ref. Keep the original extraction instructions and signed/approved workpapers as supporting originals where supplied.

Benefit kind values are potential, realised_cash and unmonetized_capacity. Only actual finance_accepted realised_cash records with accepted_by/accepted_at and source-backed independence are summed. Record capacity quantity and unit separately from money.

The same physical cost appearing under ERP, payroll and agency aliases must share an economic pool identity. A shared source invoice allocated to multiple sites is one cost record with separate allocation shares, not one copied full amount per site.

The empty templates are input headers; examples/input contains the complete fictional fixture, not plant data. Complete supplied exports can contain arbitrary original columns; map the fields actually supplied and retain the rest in the original.
