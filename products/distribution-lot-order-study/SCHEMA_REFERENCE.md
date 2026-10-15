# Source schema

Every canonical cell is text. A selected unmapped cell is null and remains unknown. Each row begins with id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id and source_ref. Business IDs remain stable across the explicit revision chain. Header-only observed empty families are supported.

| Family | Purpose | Business identity |
|---|---|---|
| operators | Named operating business | operator_id |
| warehouses | Physical storage sites | warehouse_id |
| products | Material, grade and base unit | product_id |
| parties | Actual supplier/customer identities | party_id |
| people | Named participants | person_id |
| authorities | Original scoped grants | authority_id |
| unit_conversions | Dated documented physical conversion | conversion_id |
| policies | Warehouse/material QA and ranking method | policy_id |
| customer_rules | Approved product/customer date requirement | rule_id |
| purchase_lines | Original supplier order lines | purchase_line_id |
| receipts | Actual receipt and disposition | receipt_id |
| lots | Immutable physical lot identity | lot_id |
| opening_balances | Original stock observations | opening_id |
| transfers | Distinct departure and arrival | transfer_id |
| repack_jobs | Completed same-material process | repack_job_id |
| repack_inputs | Actual physical consumption | repack_input_id |
| repack_outputs | Actual output lots | repack_output_id |
| certificates | Original certificate editions | certificate_id |
| certificate_reviews | Named decision on exact bytes | certificate_review_id |
| lot_holds | Actual QA restriction | hold_id |
| hold_events | Hold opening/release history | hold_event_id |
| lot_state_events | Observed QA state decision | state_event_id |
| lot_state_inputs | Exact source evidence for QA state | state_input_id |
| order_lines | Original customer requirements | order_line_id |
| order_events | Actual cancellation/completion/state | order_event_id |
| decision_cases | Frozen allocation context | decision_case_id |
| decision_inputs | Complete exact known inputs | decision_input_id |
| allocation_proposals | Supplied allocation output | proposal_id |
| decision_reviews | Named review of complete proposal basis | decision_review_id |
| allocations | Actual allocation/override | allocation_id |
| picks | Actual warehouse picking | pick_id |
| dispatches | Actual dispatch and acceptance | dispatch_id |
| dispatch_lines | Exact order/allocation/pick/lot lineage | dispatch_line_id |
| returns | Physical customer return | return_id |
| return_events | Observed return disposition | return_event_id |
| writeoffs | Actual stock removal | writeoff_id |
| cost_entries | Posted category/currency transaction | cost_id |
| population_members | Whole lot/receipt/order membership | member_id |
| effort | Observed recurring active work | effort_id |

## Exact family columns

### operators

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, operator_id, name, valid_from, valid_to

### warehouses

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, warehouse_id, operator_id, name, valid_from, valid_to

### products

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, product_id, operator_id, name, material_id, base_unit, grade, valid_from, valid_to

### parties

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, party_id, operator_id, name, party_type, valid_from, valid_to

### people

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, person_id, operator_id, name, valid_from, valid_to

### authorities

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, authority_id, person_id, permission, operator_id, warehouse_id, granted_by, granted_at, valid_from, valid_to

### unit_conversions

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, conversion_id, product_id, unit, base_unit, factor_to_base, basis_document_id, valid_from, valid_to

### policies

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, policy_id, operator_id, warehouse_id, material_id, ranking_rule, certificate_kinds, alert_days, method_document_id, valid_from, valid_to

### customer_rules

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, rule_id, customer_id, product_id, minimum_remaining_days, date_kind, policy_record_id, approved_by, approved_at, valid_from, valid_to

### purchase_lines

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, purchase_line_id, operator_id, warehouse_id, supplier_id, external_order_ref, external_line_ref, product_id, ordered_at, expected_at, quantity, unit, approved_by

### receipts

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, receipt_id, purchase_line_record_id, lot_id, warehouse_id, received_at, quantity, unit, supplier_ref, received_by, disposition

### lots

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, lot_id, operator_id, physical_key, product_id, supplier_id, supplier_lot, created_at, manufacture_at, expiry_at, retest_at, date_kind, origin_kind

### opening_balances

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, opening_id, lot_record_id, warehouse_id, observed_at, quantity, unit, counted_by

### transfers

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, transfer_id, lot_record_id, from_warehouse_id, to_warehouse_id, sent_at, received_at, quantity, unit, dispatched_by, received_by, external_ref

### repack_jobs

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, repack_job_id, operator_id, warehouse_id, material_id, started_at, completed_at, input_complete, expected_inputs, output_complete, expected_outputs, loss_quantity, loss_unit, reason, completed_by

### repack_inputs

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, repack_input_id, job_record_id, lot_record_id, quantity, unit, consumed_at

### repack_outputs

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, repack_output_id, job_record_id, lot_record_id, quantity, unit, produced_at

### certificates

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, certificate_id, lot_record_id, certificate_kind, issuer_id, certificate_ref, issued_at, valid_until, method_document_id

### certificate_reviews

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, certificate_review_id, certificate_record_id, certificate_sha256, lot_record_id, policy_record_id, reviewed_at, reviewed_by, decision, notes

### lot_holds

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, hold_id, lot_record_id, warehouse_id, raised_at, raised_by, reason

### hold_events

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, hold_event_id, hold_record_id, event_at, state, reviewed_by, notes

### lot_state_events

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, state_event_id, lot_record_id, warehouse_id, event_at, state, policy_record_id, inputs_complete, expected_inputs, reviewed_by, reason

### lot_state_inputs

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, state_input_id, state_event_record_id, family, record_id, row_sha256

### order_lines

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, order_line_id, operator_id, warehouse_id, customer_id, external_order_ref, external_line_ref, product_id, ordered_at, due_at, quantity, unit, rule_record_id, approved_by

### order_events

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, order_event_id, order_line_record_id, event_at, state, actor_id, reason

### decision_cases

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, decision_case_id, operator_id, warehouse_id, policy_record_id, decided_at, order_population_complete, expected_order_lines, lot_population_complete, expected_lots, input_population_complete, expected_inputs, generated_by, purpose

### decision_inputs

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, decision_input_id, decision_case_record_id, family, record_id, row_sha256

### allocation_proposals

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, proposal_id, decision_case_record_id, order_line_record_id, lot_record_id, quantity, unit, proposed_at, supplied_score, score_unit, reason

### decision_reviews

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, decision_review_id, decision_case_record_id, decision_basis_sha256, reviewed_at, reviewed_by, decision, notes

### allocations

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, allocation_id, order_line_record_id, lot_record_id, warehouse_id, quantity, unit, allocated_at, decision_review_record_id, proposal_record_id, override_reason, allocated_by

### picks

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, pick_id, allocation_record_id, lot_record_id, warehouse_id, quantity, unit, picked_at, picked_by, external_ref

### dispatches

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, dispatch_id, operator_id, warehouse_id, customer_id, dispatched_at, accepted_at, carrier_ref, dispatched_by

### dispatch_lines

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, dispatch_line_id, dispatch_record_id, order_line_record_id, allocation_record_id, pick_record_id, lot_record_id, quantity, unit

### returns

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, return_id, dispatch_line_record_id, warehouse_id, received_at, quantity, unit, received_by, external_ref

### return_events

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, return_event_id, return_record_id, event_at, state, reviewed_by, reason

### writeoffs

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, writeoff_id, lot_record_id, warehouse_id, posted_at, quantity, unit, reason, external_ref, posted_by

### cost_entries

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, cost_id, operator_id, warehouse_id, lot_record_id, order_line_record_id, posted_at, kind, amount, currency, external_ref, posted_by

### population_members

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, member_id, population_kind, family, record_id, operator_id, warehouse_id, population_key, included, exclusion_reason

### effort

id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id, source_ref, effort_id, member_id, phase, method, person_id, started_at, ended_at, person_minutes, work_key, matched_group_id, population_complete, phase_complete

## Explicit vocabulary

Physical quantities use nonnegative decimal strings; movements require positive quantity. Currency codes use three uppercase letters. Booleans in source rows are true or false strings. Revision numbers are positive integers. Known open intervals use a blank valid_to; unknown/unmapped fields remain null. Actual conversions require a positive decimal factor and retained basis document.

Policy ranking is FEFO or FIFO. Certificate kinds are a JSON array. Receipt disposition is accepted, quarantined or rejected. Hold state is open or released. QA state is released, quarantined or rejected. Customer date kind is expiry, retest or none; lots may explicitly retain unknown. Certificate/decision review decisions are accepted or rejected. Study-level acceptance uses accepted or revise. Order states are open, cancelled or completed. Return states are quarantined, restocked or disposed.

Population kinds lot, receipt and order reference lots, receipts and order_lines respectively. A declared exclusion includes its actual reason. All eight effort phases are documented in DOMAIN_CONTRACT.md and editable in the operating plan.
