# Procurement Savings Reconciliation Study Desk — complete operating contract

## Delivered purpose and boundary

Build an offline source-native workbench for a consecutive procurement savings reconciliation. Preserve the original tracker, actual AP/ERP lines, supporting commercial and baseline documents, explicit mappings and the complete dated Finance decision. This is an editable companion for an actual policy and source-file study. ProcSave's existing calculator, tracker, methodology and dashboard remain the buyer's own products.

The maintained application uses 33 exact canonical families in schema.cjs. The supplied source-view module enforces original documents, explicit availability, complete source-family counts, stable business lineage and immutable version identities. Common cells are text or null; an unmapped canonical cell remains null. All decimal arithmetic uses rational.cjs, all times use study-time.cjs, and all reporting currencies remain explicit.

## Original identity and chronology

Keep operator, site, supplier legal identity, item/specification, original supplier/contract/item labels, initiative, actual transaction and retained record version separate. Context has effective intervals. Recorded time and original availability are distinct from the transaction or decision time. A later source amendment must not validate an earlier baseline, mapping, calculation or Finance decision.

Economic purchase identity is source_system plus external_transaction_ref plus external_line_ref, scoped to operator/site. Identical aliases count one economic purchase while all originals remain retained. Conflicting economic values make the affected contribution unresolved. Apply the same rule to adjustments and cost postings. Canonical record_key/natural ID revisions retain their exact lineage.

Authorities are named source records with procurement, finance, data or operations permissions and optional site scope. Source context and original grant evidence must exist at the relevant time. Baseline approval and Finance review require Finance authority; mapping review and procurement submission require procurement authority. Ordinary import remains source capture, not the invention of an approval.

## Baseline, terms and forecast

Each initiative names its actual policy, owner and scope. Baselines name the item, actual period, baseline kind, price/unit/currency, specification and delivery/payment terms. Kinds are historical_paid, contract, budget, market and opening_quote. A baseline is reviewed with the exact original baseline row and complete baseline-input hash set. Accepted/rejected decisions and comparable/normalized/unresolved comparability are explicit. Simultaneous conflicting decisions and later invalid decisions remain unresolved.

Commercial terms identify supplier, item, original price/unit/currency and effective interval. A source-backed scope_adjustment reduces the baseline comparison price by its stated amount per base unit. Preserve each adjustment's basis, reviewer, sign and currency; do not invent a normalization from the description. An asserted comparable baseline with incompatible actual item/specification/terms needs an explicit supported reconciliation.

A forecast preserves the original approved planned quantity and claimed amount for its exact period. Recomputed forecast and submitted forecast are separate outputs. Missing or contradictory original forecasts stay visible. Partial periods are not annualized.

## Actual spend, matching and overlap

spend_lines retain positive original purchase quantities, source unit prices and actual net item amounts. Actual net_amount is the observed monetary amount; display the original price-times-quantity difference so rounding or other pricing components cannot disappear. Do not silently add tax, freight or other unrelated charges. Monetary sources that lack the required item basis remain unresolved for a like-for-like calculation.

A mapping case names the actual spend record, initiative, supplier, item and commercial terms. It freezes a complete input set. The named mapping review binds the exact mapping basis. Proposed or rejected mappings do not become accepted assignments.

An assignment allocates an explicit quantity of that actual purchase to one initiative. Across initiatives the assigned quantity cannot exceed the original available quantity. Retain unassigned quantities and ambiguous mappings in the complete transaction population. Reuse of one economic purchase through an alias must not create another benefit. No confidence score substitutes for the named accepted mapping.

Credits, returns, rebates and corrections are signed spend_adjustments. Their original quantity and amount remain separate. adjustment_assignments explicitly attribute signed quantity and amount to an existing assignment; do not silently spread a credit across initiatives. Complete attributed sums cannot exceed or contradict the original adjustment. A named original reversal is retained, not removed as a duplicate purchase.

## Currency and actual policy

Never sum unlike currencies. fx_rates are dated, original, approved source rates with source/target currency and actual validity. currency_treatments bind a specific source record to its reporting currency, actual rate and constant-comparison rate. Matching reporting currency uses exact one without a guessed external rate. A foreign amount needs an exact source-backed treatment.

Retain original monetary amounts, constant-currency comparison values, actual converted values and their FX difference separately. Missing or conflicting rates/treatments keep the affected comparison unknown. A later rate observation cannot rewrite an earlier frozen report. FX and indexation must not be silently attributed to procurement price performance; unsupported effects remain outside a complete claimed decomposition.

Policies explicitly choose current_price_volume_with_interaction or baseline_price_volume, and each of one_time_treatment/recurring_treatment chooses subtract or report_only. The source method document and named Finance approval govern the actual study. The first course can use one currency plus a separate explicitly converted case; never manufacture a current market rate.

## Calculation and exact bridge

Use one complete calculation case per chosen initiative/period/source cutoff. Freeze the complete inputs known at decided_at, their exact source-row hashes and declared count. Inputs include actual context, original baseline/review, terms, forecast, mapping/reviews, assignments, adjustments, costs and policy. Calculation cases/inputs, later submissions/Finance reviews and population/effort rows are outside their own recursive input basis. Every source selected for a result must be frozen; an omitted needed original remains unresolved.

Let B be the supported comparable baseline price per base unit; T the supported new commercial price; Qp the original planned quantity; Qa the supported attributed net actual quantity; A the actual attributed net amount, all expressed in the declared comparison currency. The named-source outputs are:
- Planned baseline spend = B × Qp.
- Recomputed forecast price benefit = (B − T) × Qp.
- Contracted benefit on actual quantity = (B − T) × Qa.
- Actual price adherence difference = T × Qa − A.
- Actual realized price difference = B × Qa − A, retaining both components above.
- Under current_price_volume_with_interaction: volume at new price = (Qp − Qa) × T and interaction = (B − T) × (Qp − Qa).
- The exact bridge is planned baseline spend minus actual amount = actual realized price difference + new-price volume + interaction.
- Under baseline_price_volume: volume at baseline price = (Qp − Qa) × B and interaction is zero; the same whole bridge reconciles.

Keep FX/scope adjustments separately identified before applying this bridge. Do not combine different item/base-unit categories into a fictitious average unit price. Multi-item initiatives need separate item comparisons and monetary aggregation only after each supported item is complete; a case tied to one baseline/term item may not silently absorb another item.

For the published simple example B=100, T=92, Qp=10,000, Qa=8,000, A=736,000, the exact bridge is 264,000 = 64,000 + 184,000 + 16,000. All four outputs retain their separate meanings.

## Costs, avoidance, submissions and Finance

Costs retain their actual original transaction, currency, one_time or recurring kind, attributable period and allocation basis. transaction_amount is the signed amount of the whole original transaction; amount is the explicit signed amount allocated to this initiative; allocation_key is the stable identity of that allocation within the original transaction. Deduplicate original aliases by transaction identity plus allocation_key. All allocations of one transaction must agree on transaction_amount, currency, posted_at and kind. Signed allocated totals may not exceed or contradict the original transaction amount. Retain the unallocated remainder and every conflicting allocation; never infer a split. Do not prorate an overlapping cost without an explicit source-backed allocation. Actual negative reversals remain signed. Apply the policy's treatment and show original gross price difference, supported cost totals and net result separately. Zero is observed zero only when the complete source population supports it.

Avoidance uses a credible documented future price, the actual new terms, supported quantity and exact period. Report it separately from realized price difference and cash receipt. A documented supplier increase can produce positive avoidance and negative realized price difference at the same time.

A procurement submission binds the complete calculation basis and stores the original submitted price, net and avoidance amounts. Finance decisions bind the exact submission row, actor, time and original decision. Decisions are accepted, adjusted, rejected or revise. Original calculated, submitted and approved values remain separate, with adjusted or rejected history preserved. Approved amounts must retain their own meaning and currency. No named review on an older input edition approves a later corrected one.

## Complete population and recurring work

population_members refers to initiatives. Include every initiative active or observed in the consecutive operator/site period, including cancelled, pending, ambiguous, rejected, partially realized and negative outcomes. Explicit justified exclusions remain visible. Family/source completeness and initiative coverage are separate. A missing member, unknown component or unresolved Finance decision keeps the corresponding complete total unknown while showing the supported subtotal.

Observe source_capture, supplier_mapping, evidence_retrieval, reconciliation, exception_resolution, procurement_submission, finance_review and correction for every included member under both named methods. Preserve signed active person-minutes and increased work. Separate setup/unpaired work in the report; do not present an unmeasured setup as zero or convert minutes into cash. Pending forms, complete original bytes, history and competing branches must survive ordinary/native export and reopen.

## Engineering API and ownership

Revenue owns procurement-engine.cjs, procurement-effort.cjs, procurement.cjs, the full authored raw course and operating/business peer. Root owns Core/session, complete ordinary operator, native commands and final source integration.

Engine exports analyze(records,options), hashRow, baselineBasis(case,inputs), mappingBasis(case,inputs) and calculationBasis(case,inputs). Basis helpers use deterministic JSON with the original case and input rows sorted by immutable id. Engine output exposes source metadata/records, exact computations and historical queries, keeping private functions outside the serializable result.

Domain exports empty, validate, analyze(w,rows,selected), report(result), exports(w,result), sourceBindings(w,rows,selected,side,kind,value), FIELDS, IDS, KINDS and phases. Configuration uses side, as_of, population_start/end, operator_id, site_id, population_key, population_complete, expected_members, source_population_complete, expected_counts, required_review_roles (procurement/finance), required_effort_phases, baseline_method/current_method and notes.

Serializable domain output has status, population (complete,observed,included,excluded,unresolved,expected,members), operating, initiatives, calculations, mappings, transactions, adjustments, costs, approvals, currency_totals, effort and issues. Give each initiative a stable initiative_record_id, name, state, reporting_currency and complete flag; keep the full per-source account under operating and complete calculation results under calculations.

sourceBindings supports baseline_inputs/mapping_inputs/calculation_inputs row_sha256, baseline_reviews baseline_basis_sha256, mapping_reviews mapping_basis_sha256, submissions calculation_basis_sha256 and finance_reviews submission_sha256. Bind exact current selected source rows; preserve supplied names and actual event times.

The full authored course must populate every family (including explicit empty arrays where actually unused), preserve original documents and source cutoffs, reconcile independent physical/monetary inputs, retain every initiative and eight work phases, and exercise signed/overlap/late-correction/FX/scope/Finance history. Do not reuse the separate six-initiative research teaching workbook as if it were this full operating course.
