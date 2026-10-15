# Canonical source schema

All cells are text or null. A null means the original field was unobserved. CSV empty strings are retained as observed blanks. Immutable id identifies the exact version; record_key identifies its business lineage; revision and supersedes_id retain its dated version chain. Natural family IDs remain separate. Dates are actual UTC ISO instants or the specifically permitted observed empty interval end. Consult DOMAIN_CONTRACT.md for supported meanings and exact chronology.

## operators

Natural identity: operator_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | operator_id |
| 11 | name |
| 12 | valid_from |
| 13 | valid_to |

## sites

Natural identity: site_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | site_id |
| 11 | operator_id |
| 12 | name |
| 13 | valid_from |
| 14 | valid_to |

## suppliers

Natural identity: supplier_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | supplier_id |
| 11 | operator_id |
| 12 | name |
| 13 | legal_identity |
| 14 | valid_from |
| 15 | valid_to |

## people

Natural identity: person_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | person_id |
| 11 | operator_id |
| 12 | name |
| 13 | valid_from |
| 14 | valid_to |

## authorities

Natural identity: authority_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | authority_id |
| 11 | person_id |
| 12 | permission |
| 13 | operator_id |
| 14 | site_id |
| 15 | granted_by |
| 16 | granted_at |
| 17 | valid_from |
| 18 | valid_to |

## items

Natural identity: item_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | item_id |
| 11 | operator_id |
| 12 | name |
| 13 | specification |
| 14 | base_unit |
| 15 | valid_from |
| 16 | valid_to |

## unit_conversions

Natural identity: conversion_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | conversion_id |
| 11 | item_id |
| 12 | unit |
| 13 | base_unit |
| 14 | factor_to_base |
| 15 | basis_document_id |
| 16 | valid_from |
| 17 | valid_to |

## fx_rates

Natural identity: fx_rate_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | fx_rate_id |
| 11 | operator_id |
| 12 | from_currency |
| 13 | to_currency |
| 14 | rate_to_target |
| 15 | observed_at |
| 16 | valid_from |
| 17 | valid_to |
| 18 | basis_document_id |
| 19 | approved_by |
| 20 | approved_at |

## currency_treatments

Natural identity: currency_treatment_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | currency_treatment_id |
| 11 | source_family |
| 12 | source_record_id |
| 13 | reporting_currency |
| 14 | actual_rate_record_id |
| 15 | constant_rate_record_id |
| 16 | approved_by |
| 17 | approved_at |
| 18 | reason |

## policies

Natural identity: policy_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | policy_id |
| 11 | operator_id |
| 12 | site_id |
| 13 | reporting_currency |
| 14 | effect_method |
| 15 | one_time_treatment |
| 16 | recurring_treatment |
| 17 | method_document_id |
| 18 | approved_by |
| 19 | approved_at |
| 20 | valid_from |
| 21 | valid_to |

## initiatives

Natural identity: initiative_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | initiative_id |
| 11 | operator_id |
| 12 | site_id |
| 13 | owner_id |
| 14 | description |
| 15 | category |
| 16 | started_at |
| 17 | ended_at |
| 18 | policy_record_id |

## initiative_events

Natural identity: initiative_event_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | initiative_event_id |
| 11 | initiative_record_id |
| 12 | event_at |
| 13 | state |
| 14 | actor_id |
| 15 | reason |

## baselines

Natural identity: baseline_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | baseline_id |
| 11 | initiative_record_id |
| 12 | item_id |
| 13 | baseline_kind |
| 14 | period_start |
| 15 | period_end |
| 16 | unit_price |
| 17 | unit |
| 18 | currency |
| 19 | specification |
| 20 | delivery_terms |
| 21 | payment_terms |
| 22 | inputs_complete |
| 23 | expected_inputs |
| 24 | prepared_by |

## baseline_inputs

Natural identity: baseline_input_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | baseline_input_id |
| 11 | baseline_record_id |
| 12 | family |
| 13 | record_id |
| 14 | row_sha256 |

## baseline_reviews

Natural identity: baseline_review_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | baseline_review_id |
| 11 | baseline_record_id |
| 12 | baseline_basis_sha256 |
| 13 | reviewed_at |
| 14 | reviewed_by |
| 15 | decision |
| 16 | comparability |
| 17 | notes |

## commercial_terms

Natural identity: term_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | term_id |
| 11 | initiative_record_id |
| 12 | supplier_id |
| 13 | item_id |
| 14 | unit_price |
| 15 | unit |
| 16 | currency |
| 17 | specification |
| 18 | delivery_terms |
| 19 | payment_terms |
| 20 | valid_from |
| 21 | valid_to |
| 22 | agreed_by |
| 23 | agreed_at |

## forecasts

Natural identity: forecast_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | forecast_id |
| 11 | initiative_record_id |
| 12 | baseline_record_id |
| 13 | term_record_id |
| 14 | approved_at |
| 15 | approved_by |
| 16 | period_start |
| 17 | period_end |
| 18 | planned_quantity |
| 19 | unit |
| 20 | forecast_amount |
| 21 | currency |
| 22 | notes |

## spend_lines

Natural identity: spend_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | spend_id |
| 11 | operator_id |
| 12 | site_id |
| 13 | source_system |
| 14 | external_transaction_ref |
| 15 | external_line_ref |
| 16 | transaction_at |
| 17 | posted_at |
| 18 | supplier_ref |
| 19 | contract_ref |
| 20 | item_ref |
| 21 | quantity |
| 22 | unit |
| 23 | unit_price |
| 24 | net_amount |
| 25 | currency |

## spend_adjustments

Natural identity: adjustment_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | adjustment_id |
| 11 | spend_record_id |
| 12 | source_system |
| 13 | external_transaction_ref |
| 14 | external_line_ref |
| 15 | posted_at |
| 16 | kind |
| 17 | quantity_delta |
| 18 | amount_delta |
| 19 | unit |
| 20 | currency |
| 21 | reason |

## mapping_cases

Natural identity: mapping_case_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | mapping_case_id |
| 11 | spend_record_id |
| 12 | initiative_record_id |
| 13 | supplier_id |
| 14 | term_record_id |
| 15 | item_id |
| 16 | decided_at |
| 17 | inputs_complete |
| 18 | expected_inputs |
| 19 | proposed_by |

## mapping_inputs

Natural identity: mapping_input_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | mapping_input_id |
| 11 | mapping_case_record_id |
| 12 | family |
| 13 | record_id |
| 14 | row_sha256 |

## mapping_reviews

Natural identity: mapping_review_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | mapping_review_id |
| 11 | mapping_case_record_id |
| 12 | mapping_basis_sha256 |
| 13 | reviewed_at |
| 14 | reviewed_by |
| 15 | decision |
| 16 | notes |

## assignments

Natural identity: assignment_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | assignment_id |
| 11 | spend_record_id |
| 12 | initiative_record_id |
| 13 | mapping_review_record_id |
| 14 | assigned_quantity |
| 15 | unit |
| 16 | assigned_at |
| 17 | assigned_by |

## adjustment_assignments

Natural identity: adjustment_assignment_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | adjustment_assignment_id |
| 11 | adjustment_record_id |
| 12 | assignment_record_id |
| 13 | quantity_delta |
| 14 | amount_delta |
| 15 | unit |
| 16 | currency |
| 17 | attributed_at |
| 18 | attributed_by |

## scope_adjustments

Natural identity: scope_adjustment_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | scope_adjustment_id |
| 11 | baseline_record_id |
| 12 | term_record_id |
| 13 | amount_per_base_unit |
| 14 | currency |
| 15 | basis_document_id |
| 16 | approved_at |
| 17 | approved_by |
| 18 | reason |

## costs

Natural identity: cost_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | cost_id |
| 11 | initiative_record_id |
| 12 | posted_at |
| 13 | kind |
| 14 | amount |
| 15 | transaction_amount |
| 16 | allocation_key |
| 17 | currency |
| 18 | source_system |
| 19 | external_transaction_ref |
| 20 | external_line_ref |
| 21 | period_start |
| 22 | period_end |
| 23 | allocation_basis_document_id |
| 24 | posted_by |

## avoidance_cases

Natural identity: avoidance_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | avoidance_id |
| 11 | initiative_record_id |
| 12 | term_record_id |
| 13 | future_unit_price |
| 14 | unit |
| 15 | currency |
| 16 | period_start |
| 17 | period_end |
| 18 | quantity |
| 19 | basis_document_id |
| 20 | approved_at |
| 21 | approved_by |
| 22 | reason |

## calculation_cases

Natural identity: calculation_case_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | calculation_case_id |
| 11 | initiative_record_id |
| 12 | decided_at |
| 13 | period_start |
| 14 | period_end |
| 15 | policy_record_id |
| 16 | baseline_record_id |
| 17 | term_record_id |
| 18 | forecast_record_id |
| 19 | inputs_complete |
| 20 | expected_inputs |
| 21 | generated_by |

## calculation_inputs

Natural identity: calculation_input_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | calculation_input_id |
| 11 | calculation_case_record_id |
| 12 | family |
| 13 | record_id |
| 14 | row_sha256 |

## submissions

Natural identity: submission_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | submission_id |
| 11 | calculation_case_record_id |
| 12 | calculation_basis_sha256 |
| 13 | submitted_at |
| 14 | submitted_by |
| 15 | price_amount |
| 16 | net_amount |
| 17 | avoidance_amount |
| 18 | currency |
| 19 | notes |

## finance_reviews

Natural identity: finance_review_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | finance_review_id |
| 11 | submission_record_id |
| 12 | submission_sha256 |
| 13 | reviewed_at |
| 14 | reviewed_by |
| 15 | decision |
| 16 | approved_price_amount |
| 17 | approved_net_amount |
| 18 | approved_avoidance_amount |
| 19 | currency |
| 20 | notes |

## population_members

Natural identity: member_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | member_id |
| 11 | family |
| 12 | record_id |
| 13 | operator_id |
| 14 | site_id |
| 15 | population_key |
| 16 | included |
| 17 | exclusion_reason |

## effort

Natural identity: effort_id.

| Position | Canonical field |
|---:|---|
| 1 | id |
| 2 | record_key |
| 3 | revision |
| 4 | supersedes_id |
| 5 | record_status |
| 6 | recorded_at |
| 7 | available_at |
| 8 | source_document_id |
| 9 | source_ref |
| 10 | effort_id |
| 11 | member_id |
| 12 | phase |
| 13 | method |
| 14 | person_id |
| 15 | started_at |
| 16 | ended_at |
| 17 | person_minutes |
| 18 | work_key |
| 19 | matched_group_id |
| 20 | population_complete |
| 21 | phase_complete |

## Exact binding families

| Family | Bound source | Output field |
|---|---|---|
| baseline_inputs | Exact original source row | row_sha256 |
| mapping_inputs | Exact original source row | row_sha256 |
| calculation_inputs | Exact original source row | row_sha256 |
| baseline_reviews | Original baseline and complete input set | baseline_basis_sha256 |
| mapping_reviews | Original mapping case and complete input set | mapping_basis_sha256 |
| submissions | Original calculation case and complete input set | calculation_basis_sha256 |
| finance_reviews | Exact original submission row | submission_sha256 |

## Explicit cost allocation

costs.transaction_amount is the signed whole original transaction. costs.amount is this initiative's explicit attributed portion. costs.allocation_key identifies that portion within the transaction. Duplicate aliases use the same key; distinct allocations use different keys. Original total, currency, posting time and kind must agree across allocations. Preserve the remainder and every original allocation basis. There is no inferred proportional split.
