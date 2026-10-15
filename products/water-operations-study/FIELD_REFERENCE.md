# Canonical water records

Use DOMAIN_HEADERS.json and the exact templates as the import contract. Every original value remains literal text; mapping availability distinguishes unknown columns from observed blanks. Supporting document IDs refer to exact retained bytes. Names are not automatic identity matches.

## Shared version fields

`id` identifies an immutable row version. `record_key` identifies its continuing source record. `revision` is a positive integer; every later version names `supersedes_id`. `record_status` is active or void. `recorded_at` and `available_at` are actual source times. `source_document_id` and `source_ref` retain provenance. These fields do not replace the family’s separate business identity.

## organisations

Template: `templates/organisations.csv`. Complete authored input: `examples/operations-csv/organisations.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,organisation_id,name,kind,valid_from,valid_to
```

## systems

Template: `templates/systems.csv`. Complete authored input: `examples/operations-csv/systems.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,system_id,organisation_id,pws_id,name,class,service_connections,connections_as_of,valid_from,valid_to
```

## locations

Template: `templates/locations.csv`. Complete authored input: `examples/operations-csv/locations.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,location_id,system_id,name,purpose,parent_location_id,valid_from,valid_to
```

## assets

Template: `templates/assets.csv`. Complete authored input: `examples/operations-csv/assets.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,asset_id,system_id,location_id,name,kind,registry_status,registry_as_of,valid_from,valid_to
```

## source_use

Template: `templates/source_use.csv`. Complete authored input: `examples/operations-csv/source_use.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,source_use_id,system_id,asset_id,interval_start,interval_end,use_status,quantity,unit,observed_by
```

## people

Template: `templates/people.csv`. Complete authored input: `examples/operations-csv/people.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,person_id,organisation_id,name,role,credential_ref,valid_from,valid_to
```

## authorities

Template: `templates/authorities.csv`. Complete authored input: `examples/operations-csv/authorities.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,authority_id,person_id,system_id,permission,valid_from,valid_to,granted_at,granted_by
```

## schedules

Template: `templates/schedules.csv`. Complete authored input: `examples/operations-csv/schedules.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,schedule_id,system_id,location_id,purpose,activity,parameter,unit,cadence_text,approved_at,approved_by,valid_from,valid_to
```

## obligations

Template: `templates/obligations.csv`. Complete authored input: `examples/operations-csv/obligations.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,obligation_id,system_id,location_id,schedule_record_id,schedule_sha256,activity,window_start,window_end,due_at,required_record_kind,parameter,unit,cancelled_at,cancellation_authorised_by,cancellation_reason
```

## field_readings

Template: `templates/field_readings.csv`. Complete authored input: `examples/operations-csv/field_readings.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,reading_id,system_id,location_id,asset_id,obligation_id,parameter,value_text,qualifier,unit,observed_at,observer_id,instrument_id,method,original_document_id
```

## reading_reviews

Template: `templates/reading_reviews.csv`. Complete authored input: `examples/operations-csv/reading_reviews.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,reading_review_id,reading_record_id,reading_sha256,reviewed_at,reviewer_id,decision,notes
```

## operational_events

Template: `templates/operational_events.csv`. Complete authored input: `examples/operations-csv/operational_events.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,operational_event_id,system_id,asset_id,event,effective_at,actor_id,actual_procedure_ref,description,evidence_document_id
```

## reports

Template: `templates/reports.csv`. Complete authored input: `examples/operations-csv/reports.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,report_id,system_id,document_label,claimed_period_start,claimed_period_end,generated_at,as_of,prepared_by,expected_members,population_complete,required_roles,purpose,document_id,supersedes_report_id
```

## report_inputs

Template: `templates/report_inputs.csv`. Complete authored input: `examples/operations-csv/report_inputs.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,report_input_id,report_id,family,record_id,extract_id,row_sha256,document_id,role,period_exception_reason
```

## report_reviews

Template: `templates/report_reviews.csv`. Complete authored input: `examples/operations-csv/report_reviews.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,report_review_id,report_id,role,reviewer_id,reviewed_at,decision,report_basis_sha256,notes
```

## dispatch_events

Template: `templates/dispatch_events.csv`. Complete authored input: `examples/operations-csv/dispatch_events.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,dispatch_event_id,report_id,system_id,event,effective_at,actor_id,recipient,channel,external_ref,prior_dispatch_event_id,document_id
```

## handovers

Template: `templates/handovers.csv`. Complete authored input: `examples/operations-csv/handovers.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,handover_id,system_id,from_person_id,to_person_id,prepared_at,effective_at,purpose,expected_items,items_complete,document_id
```

## handover_items

Template: `templates/handover_items.csv`. Complete authored input: `examples/operations-csv/handover_items.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,handover_item_id,handover_id,family,record_id,extract_id,row_sha256,document_id,responsibility,next_due_at
```

## handover_acknowledgements

Template: `templates/handover_acknowledgements.csv`. Complete authored input: `examples/operations-csv/handover_acknowledgements.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,acknowledgement_id,handover_id,acknowledged_at,person_id,decision,handover_basis_sha256,notes
```

## tasks

Template: `templates/tasks.csv`. Complete authored input: `examples/operations-csv/tasks.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,task_id,system_id,obligation_id,responsible_person_id,assigned_at,due_at,description,source_packet_id
```

## task_events

Template: `templates/task_events.csv`. Complete authored input: `examples/operations-csv/task_events.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,task_event_id,task_id,event,effective_at,actor_id,record_family,record_id,prior_event_id,reason
```

## effort

Template: `templates/effort.csv`. Complete authored input: `examples/operations-csv/effort.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,effort_id,member_id,system_id,phase,method,person_id,started_at,ended_at,person_minutes,work_key,matched_group_id,population_complete,phase_complete
```

## source_documents

Template: `templates/source_documents.csv`. Complete authored input: `examples/operations-csv/source_documents.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,document_id,filename,media_type,sha256,bytes,origin,observed_at
```

## population_members

Template: `templates/population_members.csv`. Complete authored input: `examples/operations-csv/population_members.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,member_id,system_id,obligation_id,scheduled_at,included,exclusion_reason,population_key,scope_tag
```

## lab_laboratories

Template: `templates/lab_laboratories.csv`. Complete authored input: `examples/operations-csv/lab_laboratories.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,laboratory_id,name,valid_from,valid_to,scope_document_id
```

## lab_orders

Template: `templates/lab_orders.csv`. Complete authored input: `examples/operations-csv/lab_orders.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,order_id,system_id,schedule_id,location_id,purpose,ordered_at,ordered_by,valid_from,valid_to
```

## lab_order_lines

Template: `templates/lab_order_lines.csv`. Complete authored input: `examples/operations-csv/lab_order_lines.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,order_line_id,order_record_id,analyte,method,unit,maximum_reporting_limit,due_at
```

## lab_samples

Template: `templates/lab_samples.csv`. Complete authored input: `examples/operations-csv/lab_samples.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,sample_id,order_record_id,system_id,location_id,purpose,collected_at,collector_id,container_id
```

## lab_custody_events

Template: `templates/lab_custody_events.csv`. Complete authored input: `examples/operations-csv/lab_custody_events.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,custody_event_id,sample_record_id,sequence,event_type,from_party_id,to_party_id,event_at,actor_id,condition,receipt_ref
```

## lab_accessions

Template: `templates/lab_accessions.csv`. Complete authored input: `examples/operations-csv/lab_accessions.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,accession_id,sample_record_id,laboratory_record_id,lab_sample_id,received_at,received_by,disposition,rejection_reason,custody_event_record_id
```

## lab_reports

Template: `templates/lab_reports.csv`. Complete authored input: `examples/operations-csv/lab_reports.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,report_id,laboratory_record_id,system_id,lab_report_ref,issued_at,coverage_start,coverage_end
```

## lab_results

Template: `templates/lab_results.csv`. Complete authored input: `examples/operations-csv/lab_results.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,result_id,report_record_id,accession_record_id,order_line_record_id,analyte,method,unit,value_text,qualifier,reporting_limit,detection_limit,analysed_at
```

## lab_amendments

Template: `templates/lab_amendments.csv`. Complete authored input: `examples/operations-csv/lab_amendments.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,amendment_id,report_record_id,prior_report_record_id,prior_report_sha256,prior_result_record_id,prior_result_sha256,action,replacement_result_record_id,reason,authorised_at,authorised_by
```

## lab_reviews

Template: `templates/lab_reviews.csv`. Complete authored input: `examples/operations-csv/lab_reviews.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,review_id,result_record_id,result_sha256,reviewed_at,reviewed_by,decision,comment
```

## lab_report_inputs

Template: `templates/lab_report_inputs.csv`. Complete authored input: `examples/operations-csv/lab_report_inputs.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,input_id,target_report_id,result_record_id,result_sha256,review_record_id,selected_at,selected_by
```

## lab_sample_links

Template: `templates/lab_sample_links.csv`. Complete authored input: `examples/operations-csv/lab_sample_links.csv`.

```csv
id,record_key,revision,supersedes_id,record_status,recorded_at,available_at,source_document_id,source_ref,link_id,sample_record_id,prior_sample_record_id,relationship,reason,linked_at,linked_by
```

