# Calculation and record interpretation

## Identity, editions and chronology

The exact thirty-family import contract is DOMAIN_HEADERS.json and templates/*.csv. Each family uses its original named ID. Duplicate identities remain unresolved before joins. A changed extract, source document or observation is retained as a new edition with its prior original.

An evaluation has a decision boundary and a knowledge boundary. Actual events must have occurred by the decision boundary and been recorded and available by the knowledge boundary. A report evaluates its own original boundaries. Selecting a line cannot bypass the issue time or project identity of its parent document.

Authority is checked at actual acceptance, instruction, approval, certification or delivery-acceptance time. Permission vocabulary is explicit and is mapped from supplied authority evidence. A current job title alone is not approval. Later expiry does not rewrite an earlier supported signature.

Contract editions have explicit acceptance, effective intervals and predecessor links. Contradictory current heads are unresolved. A termination stops new work according to its recorded effective scope without erasing existing actual accounting history.

## Exact monetary calculation

Amounts, quantities and rates remain source decimal strings. Calculations use rational integer arithmetic. Projects declare currency, decimal precision, rounding_mode (half_up, half_even or toward_zero) and tax_rounding (line or total_by_rate).

Tax and percentage values use 21 for21%, not0.21. Inclusive prices are reversed using the actual supplied tax rate. Missing rate, currency or amount basis remains unknown. Different currencies are not combined and no conversion is inferred.

Discounts are none, percent or fixed. A fixed contract discount is allocated proportionally over eligible line nets, then remaining currency units follow largest remainder and stable line-ID order. Tax grouping includes the actual tax code and rate. The calculation report retains expected amounts alongside the original posted line/document totals.

A lump-sum contract line takes its actual accepted line_net. It does not invent measured physical quantities. Actual invoice quantities remain their source values.

## Approved work and billing basis

The contract declares measured_progress, milestone, lump_sum or mixed billing and explicit certification_required, retention_applicable and deposit_applicable. false means the actual contract makes the phase not applicable. unknown remains unresolved.

Variation instruction, quantity approval and price approval are independent records. Approved quantity with no supported price is visible as unpriced work. A zero price is never substituted.

Measurements are period movements with actual units and intervals. Their explicit replacement links retain old observations. Claims and certificate lines use period or cumulative quantity modes. Current cumulative certified net is reduced by the latest valid earlier certified net for the same project, scope and unit. The first opening zero requires explicitly complete contract history; otherwise the source opening balance is retained and reconciled.

A claim is not a certificate. A certificate is not an invoice. A rejected, cancelled or unresolved claim remains in the consecutive source population. An actual reversal remains a signed business effect referencing its original.

## Milestones

payment_milestones retains the actual signature, start, progress, reception, date or other condition and source. Amount basis is fixed, percent or balance. It refers to accepted contract net, accepted contract gross, or an explicit semicolon-separated scope list.

Balance subtracts earlier scheduled obligations on the same declared basis. Actual achievement and authorised approval are separate from the scheduled amount. Missing reception evidence remains missing.

Invoices consume actual milestone capacity, including same-time invoices. Credits restore their recorded effect. A gross milestone is compared on gross, without charging tax a second time. If a claim requires a net allocation from a gross milestone, that allocation remains unresolved until supplied explicitly.

## Retention, deposits and actual cash

Retention observations distinguish held, release_due, released, received and reversed. A due release is not received cash. Received retention must join an eligible globally reconciled accounting observation. An external transaction conflict cannot clear retention merely because one raw row resembles a receipt.

Invoice retention deductions and deposit applications form part of the actual line arithmetic. They are not subtracted again from the same invoice total. Actual deposit invoicing, receipt and application remain separate source events.

Invoice/credit document magnitudes are retained; credit_note supplies the negative document effect and references the original. Customer refunds and reversals reference preceding cash and cannot silently create a second positive receipt. An adjustment or deposit application is not cash.

External transaction identity is processor plus external_transaction_id across both customer and supplier families. Duplicate observations of one identical transaction count once. Conflicting allocations make every affected projection unresolved. An explicit allocation_group must carry the same source-backed transaction_amount, currency, event and original source; allocations must reconcile to that whole total. Future observations remain outside the earlier cash result.

## Supplier commitments and cost

A commitment is separate from an accepted delivery, a supplier invoice and a payment. Explicit predecessor links connect revised purchase orders. Independent orders for the same supplier and item do not borrow each other's deliveries or invoices.

A supplier invoice consumes its explicitly linked quantity. Outstanding uninvoiced commitment uses the remaining quantity at the actual agreed rate. Actual invoice price variance remains actual cost; it does not consume additional unpurchased units.

Forward committed cost is actual supplier invoice net plus remaining uninvoiced commitment. A delivery moves exposure to delivered-uninvoiced work but does not itself create an actual supplier invoice. Supplier payments are cash, separate from cost.

## Complete population, reports and review

The half-open claim-period-start window and selected projects define the source population. Unknown identity or period suppresses the complete denominator. Draft, rejected, unpaid and unresolved entries remain visible.

report_inputs binds the exact canonical row hash and follows parent chronology and project lineage. A later parent invoice cannot leak through a directly selected line into an earlier report. Original attachment comparisons remain separate from literal field comparisons.

The source comparison preserves exact string differences. The ordinary report lists actual attachment comparisons and a count of record pairs with neither-side bytes; comparison.json retains the complete inventory.

Operations and finance review the exact complete study digest. Editing any selected source, mapping, plan or original-document context expires that edition's current review while retaining its history.

## Practical interpretation

Canonical temporal boundaries require actual UTC instants. Date-only original values remain preserved and unresolved where their within-day order matters. The application does not invent timezone precision.

This is a supplied-record study and independent reconciliation tool. It does not issue certificates, approvals, invoices or payments, and it does not infer statutory VAT, legal retention, payment rights or causal labour savings. MEASUREMENT.md describes complete recurring work and the separation of active minutes from elapsed waiting.


A disputed retention cash link makes the affected received amount and released-but-not-received balance unresolved. The retention summary carries completeness, source issues and affected event IDs; independently established held or released amounts remain visible.
