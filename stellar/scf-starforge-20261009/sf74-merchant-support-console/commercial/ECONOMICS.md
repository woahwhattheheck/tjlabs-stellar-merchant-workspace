# Private quotation economics

The Commercial desk can now assess the delivery cost and monthly care capacity of a saved quotation. Open the original case, select a sealed quote edition, and use **Private economics**. The quotation remains the authority for implementation fees and recurring care fees. Its customer prices, recorded responses and implementation tasks are unchanged.

This is an operator planning assessment. It does not create a sale, payment, invoice, customer acceptance, Work record, Installation or Forecast row.

## Work from the original quote

1. Select the saved quotation. The assessment retains its ID, sealed SHA-256, original case identity and source bindings.
2. Enter an as-of date and the implementation delivery hours and monthly care hours you want to assess. These are estimates for this assessment; entering them does not replace the accepted work plan.
3. Enter the actual cash labor cost per hour only if known. Use the separate planning-value rate to value contributor time without representing it as cash payable.
4. Add each other cost with its stable line ID, label, amount and original source or explicit assumption. Implementation lines apply once to the complete implementation; care lines apply to one full month. Include provider, hosting, referral, payment and other costs in the applicable scope. Do not count the same labor both in an hourly rate and an additional cost line.
5. Leave an unknown amount blank. Enter zero for an explicit zero. Select **Complete** cost coverage only when all other costs in your stated scope have been included. An empty complete list asserts that there are no other costs in that scope; an empty incomplete list leaves the total unknown.
6. Enter monthly hours available for this care work and hours committed to other work. Other commitments exclude the proposed contract. Keep the source, date and availability assumptions with those values.
7. Review the cash and planning-value scenarios, effort sensitivities and capacity. Save with the named operator and original request UUID. A repeated request with the same inputs reopens its original result; a changed request or case revision needs a fresh review.

The interface retains editable draft inputs and an interrupted save request. Its draft JSON download contains private assumptions and any pending original request. A saved assessment can seed another assessment of the same quote or a newly selected quote, but each saved assessment remains immutable.

## Calculation and interpretation

The assessment calls `evaluateWorkshareEconomics` in the existing SF47 `cohort_planning.mjs`. Its fee, hours, labor and other-cost calculations use the same exact-decimal `workshareResult` used by the operating model. The additive entry point validates a single workshare without requiring a grant cohort, buyer assignment or payment target.

For each explicitly selected effort increase:

- Adjusted hours = base hours × (1 + effort increase / 100).
- Labor cost = adjusted hours × the selected hourly input.
- Total cost = labor cost + all declared other costs, when the required inputs are known.
- Contribution = the original quoted fee − total cost.
- Contribution margin = contribution / quoted fee. A zero fee has no defined percentage margin.
- Break-even hours = (quoted fee − other costs) / hourly input. An unknown or zero hourly input has no finite calculated result; a negative result means other costs already exceed the fee.

Cash-cost and planning-value results are **alternative views of the same work**. Do not add them together. A planning value such as USD 95 per hour does not establish an actual wage, invoice, contributor payment or financing requirement. Cash-cost contribution remains unknown when the cash inputs needed by the original model remain unknown.

The engine preserves full decimal products. Displayed division results use the original model's rounding: margin percentages use six decimal places and break-even hours use twelve, with half-up rounding. Capacity uses an exact integer floor, not the rounded break-even value.

Monthly care capacity is the whole number of identical contracts that fit:

`floor((available monthly hours − other committed monthly hours) / adjusted hours per contract)`

The result includes this proposed contract, assumes identical care hours and has no customer-demand meaning. Negative remaining hours are reported as overcommitted. Unknown inputs remain unknown. Zero hours per contract does not create a finite capacity ceiling.

Monthly care fees come from the quote's `recurringServiceUsd`. The assessment keeps the original SF97 route-pricing review and `routeUsageUsd` separately. It does not add route revenue to care contribution, recalculate route fees, prorate a monthly care invoice, or infer a fee from grant purchase counts. Use the existing Pricing workspace for route profitability and revised usage assumptions.

## Retention and receiving

A saved assessment is an `ECONOMICS` document in the original commissioning material journal, with material kind `commercial-quote-economics`. The original case writer owns optimistic revision checks, request replay and complete bytes. Reading an assessment verifies its sealed digest and recalculates the retained result from the exact quote and original inputs.

The original quote-only Markdown and JSON exports stay customer-facing. Private assessments are separate JSON/report downloads. The complete operator case/source package contains those private assumptions along with all original quotation and case history. Share that full package only with the intended receiving operator.

The JSON assessment has:

```text
schema, id, createdAt, quoteId, quoteSha256, sha256
review:
  schema, input, quote
  implementation: cash, valuation, knownOtherCostsUsd, missingInputs, scope, costCoverage
  care: cash, valuation, knownOtherCostsUsd, missingInputs, scope, costCoverage
  capacity: availableHoursMonthly, committedOtherHoursMonthly,
            remainingHoursMonthly, maxWholeCareContracts, status, source, cases, scope
  routeEconomics, issues, scope, reviewSha256
```

`review.input` retains every original assumption. Workshare results retain `cases` with effort increase, hours, labor cost, total cost, contribution and margin; `breakEvenHours`; and known/unknown other-cost coverage. Amounts and hours are decimal strings or null. Whole care capacity is an integer string or null.

The existing SF47 commercial source reader exposes the complete assessments and those associated with the selected quote. Receiving accepted work still requires the actual original customer response and accepted scope. The assessment does not bypass those requirements or fill missing Forecast cash costs. See [complete receiving and CLI instructions](./ECONOMICS_RECEIVING.md).

## Programmatic use

Use the existing `openCaseCommercial` model:

- `previewEconomics({id, scope, expectedRevision, input})` returns the complete deterministic review.
- `saveEconomics({id, scope, expectedRevision, input, requestId, actor, reviewSha256})` writes through the original case/material operation and returns its complete view plus `assessmentId`.
- `downloadEconomics({id, scope, revision, assessmentId, kind: 'JSON' | 'REPORT'})` returns the original complete body and byte/SHA-256 descriptor.
- `read({id, revision})` exposes `economics.assessments` and `economics.latestByQuote`.

The original `merchant-commercial economics` CLI uses these same interfaces. See its `--help` and the receiving guide for exact source, request and output arguments.

## Validation scope

The source calculation was exercised in connected V8 with an explicitly synthetic quote and original unchanged workshare arithmetic. It preserved unknown cash costs, exact zero, separate planning value, fee/effort sensitivity, capacity at increased hours, assessment sealing, same-source reopening, relocation and rejection of changed quote/assessment bytes. This source execution is not a native customer, case-writer, browser or sales result.

The source-owned receiving journey exercises the complete original case writer, private assessment, full package, receiving and SF47 read. Record its actual process result and files when run; source availability alone does not establish completion.

The published planning examples remain in [the original commercial-economics guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/fe5d1680f8286813559cb815dac7064afdcaa309/stellar/scf_2026/sf47_budget_model/workspace/examples/commercial-economics/README.md). Their quoted commercial proposals and explicit assumptions are examples, not defaults for another customer.
