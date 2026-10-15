# Canonical source families

Each template contains the exact supported headers. Map supplied exports deliberately; missing source columns remain unavailable. Dates are source-backed ISO timestamps with offsets. Decimal and quantity values stay literal strings. Do not infer technical procedures, cadence, signatures, authority, tax or payment from an absent field.

The common immutable-source fields are `id`, `record_key`, `revision`, `supersedes_id`, `record_status`, `recorded_at`, `available_at`, `source_document_id` and `source_ref`. Each family then supplies its separate business identities and operating facts. `DOMAIN_CONTRACT.md` explains the technical model; `COMMERCE.md` and `ADAPTER_CONTRACT.md` explain the commercial joins.

## organisations

Template: `templates/organisations.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,organisation_id,name,kind,valid_from,valid_to
```

## sites

Template: `templates/sites.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,site_id,customer_id,parent_site_id,name,department,address,valid_from,valid_to
```

## people

Template: `templates/people.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,person_id,organisation_id,name,role,valid_from,valid_to
```

## technical authorities

Template: `templates/technical_authorities.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,authority_id,person_id,permission,customer_id,site_id,manufacturer,model,procedure_id,valid_from,valid_to,granted_by,granted_at
```

## assets

Template: `templates/assets.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,asset_id,customer_id,site_id,parent_asset_id,manufacturer,model,serial,tag,ownership,configuration_json,configuration_document_id,valid_from,valid_to
```

## identity links

Template: `templates/identity_links.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,identity_link_id,source_system,source_identity,asset_id,customer_id,confirmed_by,confirmed_at,valid_from,valid_to
```

## procedures

Template: `templates/procedures.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,procedure_id,manufacturer,model,action,title,version_label,form_document_id,required_items_json,requires_signature,requires_closed_deficiencies,requires_completed_work,approved_by,approved_at,valid_from,valid_to
```

## eligibility

Template: `templates/eligibility.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,eligibility_id,manufacturer,model,action,procedure_id,status,decided_by,decided_at,valid_from,valid_to,reason
```

## obligations

Template: `templates/obligations.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,obligation_id,asset_id,procedure_id,action,due_at,cadence_text,basis,authorised_by,authorised_at,valid_from,valid_to
```

## cases

Template: `templates/cases.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,case_id,customer_id,site_id,asset_id,received_at,requested_action,inclusion,exclusion_reason,expected_packet,reported_status,closed_at
```

## inspections

Template: `templates/inspections.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,inspection_id,case_id,asset_id,procedure_record_id,procedure_sha256,configuration_sha256,started_at,completed_at,inspector_id,reported_result,signature_document_id,signed_at
```

## inspection items

Template: `templates/inspection_items.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,inspection_item_id,inspection_id,item_key,answer,observed_at,observer_id,evidence_document_id,notes
```

## deficiencies

Template: `templates/deficiencies.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,deficiency_id,case_id,asset_id,inspection_id,inspection_item_id,description,observed_at,state,state_at,resolution,work_id,reinspection_id,requires_reinspection,decided_by,decision_document_id
```

## work

Template: `templates/work.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,work_id,case_id,asset_id,deficiency_id,procedure_record_id,procedure_sha256,action,performed_at,completed_at,technician_id,quantity,unit,disposition,result_document_id
```

## certificates

Template: `templates/certificates.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,certificate_id,case_id,asset_id,inspection_id,procedure_record_id,procedure_sha256,work_ids_json,purpose,reported_disposition,document_id,issued_at,signed_by,signed_at,supersedes_certificate_id
```

## certificate events

Template: `templates/certificate_events.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,certificate_event_id,certificate_id,case_id,asset_id,event,effective_at,actor_id,recipient,recipient_customer_id,document_id,external_ref,supersedes_event_id
```

## custody events

Template: `templates/custody_events.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,custody_event_id,case_id,asset_id,rental_id,event,effective_at,from_party,to_party,actor_id,external_ref,evidence_document_id
```

## reports

Template: `templates/reports.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,report_id,generated_at,as_of,prepared_by,customer_id,site_id,population_start,population_end,expected_cases,population_complete,required_roles,purpose
```

## report inputs

Template: `templates/report_inputs.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,report_input_id,report_id,family,record_id,extract_id,row_sha256,document_id,role
```

## report reviews

Template: `templates/report_reviews.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,report_review_id,report_id,role,reviewer_id,reviewed_at,decision,report_basis_sha256,notes
```

## effort

Template: `templates/effort.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,effort_id,case_id,phase,method,person_id,started_at,ended_at,person_minutes,work_key,matched_group_id,population_complete,phase_complete
```

## source documents

Template: `templates/source_documents.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,document_id,filename,media_type,sha256,bytes,origin,observed_at
```

## commerce authorities

Template: `templates/commerce_authorities.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,authority_id,person_id,role,customer_id,valid_from,valid_to,authority_document_id
```

## commerce quote lines

Template: `templates/commerce_quote_lines.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,quote_line_id,quote_id,case_id,asset_id,action,catalogue_item,description,quantity,unit,currency,unit_price,tax_amount,issued_at,valid_until,issued_by,authority_id
```

## commerce approvals

Template: `templates/commerce_approvals.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,approval_id,quote_line_record_id,quote_line_sha256,customer_id,approved_quantity,decision,decided_at,decided_by,authority_id,decision_document_id
```

## commerce work allocations

Template: `templates/commerce_work_allocations.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,allocation_id,approval_record_id,work_id,case_id,asset_id,action,quantity,unit,performed_at
```

## commerce sales lines

Template: `templates/commerce_sales_lines.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,sale_line_id,sale_id,customer_id,asset_id,catalogue_item,quantity,unit,currency,unit_price,tax_amount,sold_at,sale_status,sale_document_id
```

## commerce policies

Template: `templates/commerce_policies.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,policy_id,policy_type,service_action,maximum_uses,maximum_credit,currency,valid_from,valid_to,approved_by,approved_at,authority_id,policy_document_id
```

## commerce entitlements

Template: `templates/commerce_entitlements.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,entitlement_id,policy_record_id,sale_line_record_id,case_id,work_id,asset_id,used_at,approved_by,approved_at,authority_id,approval_document_id
```

## commerce replacements

Template: `templates/commerce_replacements.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,replacement_id,case_id,old_asset_id,new_asset_id,assessment_work_id,replacement_sale_record_id,decision_at,approved_by,authority_id,decision_document_id
```

## commerce invoice lines

Template: `templates/commerce_invoice_lines.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,invoice_line_id,invoice_id,customer_id,case_id,asset_id,basis_type,basis_record_id,quantity,unit_price,tax_amount,currency,issued_at,invoice_document_id
```

## commerce credits

Template: `templates/commerce_credits.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,credit_id,invoice_line_record_id,policy_record_id,replacement_record_id,amount,currency,decision,approved_at,approved_by,authority_id,posted_at,credit_document_id
```

## commerce warranty claims

Template: `templates/commerce_warranty_claims.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,claim_id,case_id,asset_id,manufacturer,submitted_at,claim_document_id
```

## commerce warranty events

Template: `templates/commerce_warranty_events.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,warranty_event_id,claim_id,event_type,amount,currency,occurred_at,decided_by,authority_id,event_document_id,provider_transaction_id
```

## commerce rentals

Template: `templates/commerce_rentals.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,rental_id,case_id,customer_id,customer_asset_id,rental_asset_id,currency,rate,billing_unit_minutes,minimum_units,agreement_at,accepted_by,authority_id,agreement_document_id
```

## commerce rental events

Template: `templates/commerce_rental_events.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,rental_event_id,rental_id,event_type,asset_id,occurred_at,recorded_by,authority_id,event_document_id
```

## commerce payments

Template: `templates/commerce_payments.csv`

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,payment_id,invoice_id,customer_id,currency,amount,payment_type,paid_at,provider_transaction_id,payment_document_id
```
