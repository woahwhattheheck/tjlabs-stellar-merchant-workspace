# Complete procurement reconciliation course

Open **Procurement_Savings_Reconciliation_Study_Desk.html** and choose **Open complete authored workflow**. The course contains four fictional initiatives at one operator/site, through the source cutoff **12 October 2026, 00:00 UTC**. It supplies the original records needed to inspect every result and to practice corrections, source binding, review, export and reopening.

The complete study contains **462 canonical observations across 33 families**, imported as **66 original CSV files** on the source and returned sides. It retains **469 original supporting documents**, **924 explicit document links** and the full four-initiative membership. All supplied identities, people, prices, quantities, approvals and work observations are authored training records.

## Start with the complete population

In **Population & work plan**, inspect the four included initiative members and each family's declared source count. The paused fourth initiative remains in the population. Its missing calculation and submission keep the whole reported monetary total unresolved. Supported amounts from the other initiatives remain visible as subtotals.

In **Initiatives & reconciliation**, inspect I1 through I4, their source identities and status history, then the complete economic transaction and allocation accounts. The original tracker, AP observations, agreements and Finance decisions are retained together. An alias is an additional observation of an economic event; it does not create another purchase.

## 1. Component purchase price — I1

The comparable baseline is USD 100 per component and the new commercial term is USD 92. Planned quantity is 10,000. The actual receipt/purchase allocation of 8,000 units has an explicitly attributed 100-unit return, leaving 7,900 units and USD 726,800 net actual spend.

| Reconciliation item | USD |
| --- | ---: |
| Planned baseline spend | 1,000,000 |
| Actual constant-currency spend | 726,800 |
| Planned-to-actual spend difference | 273,200 |
| Realized price effect | 63,200 |
| Volume effect at current price | 193,200 |
| Price/volume interaction | 16,800 |
| One-time allocated cost | 10,000 |
| Recurring allocated cost | 2,000 |
| Calculated net benefit | 51,200 |

The bridge balances: **63,200 + 193,200 + 16,800 = 273,200**. The volume and interaction terms explain the spend movement. The price calculation uses the actual attributed net quantity.

The original procurement submission retains USD 63,200 price and USD 51,200 net. Finance first accepts that submission, then records an explicit adjusted decision of **USD 63,000 price and USD 51,000 net**. Both decisions remain visible; the later available decision governs the current accepted amount. Inspect its exact submission binding in **Observed records → finance_reviews**.

## 2. Imported grade-B terms — I2

A pack contains 10 kg under the retained unit-conversion source. Baseline EUR 50/kg and new term EUR 55/kg translate at the approved constant rate 1.2 to USD 60/kg and USD 66/kg. Actual attributed quantity is 100 kg; planned quantity is 200 kg.

The realized price effect is **USD −600**. The explicit USD 1,000 recurring cost allocation makes calculated net **USD −1,600**. The independently documented future-price avoidance is **USD 600**. It remains a separate measure.

Actual FX uses the approved rate 1.3, giving USD 7,150 actual-rate spend against USD 6,600 at constant currency. The displayed FX difference is **USD −550** under the application's benefit-oriented sign convention. Inspect the retained exact rate and currency-treatment records before comparing these amounts.

The baseline-to-actual spend bridge is **−600 + 6,600 − 600 = 5,400**. Lower quantity reduces spend while the purchase price worsens. The source forecast remains EUR −1,000; its supplied currency stays attached.

## 3. Service scope normalization — I3

The retained scope adjustment establishes a comparable baseline of USD 100 and new term of USD 90. Planned quantity 100 and actual attributed quantity 80 produce a recomputed forecast of USD 1,000 and realized price effect of **USD 800**.

The source tracker forecast remains **USD 3,000**. Its disagreement with the recomputation is visible. Finance rejects recognition of this submission under the supplied decision; the arithmetic and rejected submission remain retained.

The spend bridge balances at USD 2,800: 800 price +1,800 volume +200 interaction.

## 4. Paused secondary allocation — I4

I4 retains its explicit share of a source purchase and its paused status. It has no completed frozen calculation or procurement submission. Keep it in the population and inspect the resulting unresolved whole totals. Excluding it would change the study's declared coverage.

The accepted net subtotal from the available Finance decisions is **USD 49,400**: 51,000 for I1 and −1,600 for I2. A rejected decision and an absent decision remain distinct. Read the metric-specific completeness alongside every subtotal.

## Inspect the shared-cost account

The original recurring transaction is **USD 3,000**, allocated explicitly as USD 2,000 to I1 and USD 1,000 to I2. Each allocation retains its own stable allocation key, original transaction reference, currency, period and supporting instruction. The engine checks each signed allocation as well as the total. Offsetting excessive allocations cannot hide behind a net sum.

Purchases, their aliases, signed adjustments and cost allocations each have their own original identities. A credit posted in a later period remains available as a signed economic event rather than disappearing because the original purchase belongs to an earlier period. The focused domain course includes this period-boundary case.

## Inspect all eight work phases

The example supplies 64 work observations: four members × eight phases × two methods, paired in 32 matched groups.

| Phase | Existing process, all four members | Study process, all four members | Change |
| --- | ---: | ---: | ---: |
| Source capture | 32 | 24 | −8 |
| Supplier mapping | 32 | 24 | −8 |
| Evidence retrieval | 24 | 16 | −8 |
| Reconciliation | 48 | 32 | −16 |
| Exception resolution | 20 | 16 | −4 |
| Procurement submission | 16 | 12 | −4 |
| Finance review | 20 | 28 | +8 |
| Correction | 8 | 16 | +8 |
| **Total active person-minutes** | **200** | **168** | **−32** |

The increased Finance and correction work remains included. These are authored observations for learning the comparison, with setup unobserved. For an operating study, enter actual observations for the same consecutive population and preserve unpaired or missing work.

## Practice a complete correction

1. Save the complete session before editing.
2. Open an observed returned record and preserve its exact original identity. Record a reason and the actual availability of the corrected source edition.
3. Inspect **Return comparison**. Field differences and linked document bytes are evaluated separately.
4. For a newly supplied business decision, retain the new immutable version, actual predecessor and original availability. Use the appropriate source-binding helper for baseline inputs/reviews, mapping inputs/reviews, calculation inputs, submissions or Finance reviews.
5. Recompute and inspect the exact frozen basis. A later amendment cannot retroactively support an earlier decision.
6. Add the named whole-study procurement and Finance reviews against the current study edition.
7. Download the complete session, report ZIP and maintained application source. Reopen the session and inspect saved forms and previous editions.

A source binding establishes which retained inputs the decision refers to. The source records still carry the responsible person's actual authority, time and business decision.

## Files and continuation

- `examples/complete.study.json` is the complete directly openable study.
- `examples/raw-course.json` retains the original authored records before application import.
- `examples/build-course.cjs` rebuilds those originals and the complete study.
- `course/originals/` contains every exact imported CSV and an index.
- `course/documents/` contains every supporting text original, plus names, byte digests, availability and all links in its index.
- `templates/` contains all 33 canonical CSV headers.
- `verification/procurement-course.cjs` exercises the business cases and whole Core/session continuation.
- `operator/browser-course.cjs` executes the generated HTML handlers with supplied browser services.
- `operator/native-course.cjs` executes the maintained native command source with supplied filesystem services.
- `NATIVE.md` gives commands for an ordinary Node installation, including deterministic HTML/source builds and complete directory exports.

The package's executed result records identify their actual runtime and source versions. The same maintained source is used by the offline interface and the native continuation commands.
