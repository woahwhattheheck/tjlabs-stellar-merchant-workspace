# Source intake and canonical records

The exact authoritative columns are in DOMAIN_HEADERS.json, Core.FIELDS and the 24 CSV templates. Planning worksheets supplied with a customer programme are separate; map them deliberately if their fields describe an actual recorded observation.

## Families

| Family | Retained meaning |
| --- | --- |
| organisations | Actual operator, customer or service organisation and monetary convention |
| people | Named person, organisation, role and actual authority interval |
| assets | Distinct physical asset identity, class, serial and service dates |
| configurations | Time-specific attachment, fuel, capacity and source configuration |
| identity_links | Approved source-system asset key to physical asset for a declared interval |
| source_clocks | Source timezone, correction, uncertainty, validity and approval |
| application_profiles | Useful-output definition and comparable job conditions |
| assignments | Actual asset, configuration, operator, application, job and contract window |
| work_intervals | Operating, idle, unavailable or rental-calendar observations and meter pairs |
| output_records | Accepted, rejected or unknown period/cumulative production and coverage |
| telemetry | Actual values, timestamps, provider event keys, aggregation and coverage |
| maintenance | Supplied inspection, finding, action and completion records |
| incidents | Actual event chronology, assignment and retained pre-event source selection |
| downtime_intervals | Distinct asset or job interruption, open state and replacement reference |
| cost_entries | Original document-line allocations, expense/credit state and economic basis |
| accounting_events | Actual payment/refund allocations and original external transaction |
| review_questions | Explicit application, population, historical decision and knowledge cutoff |
| assessments | Actual named finding with an exact source-version set |
| comparison_members | Every included, excluded or unresolved assignment and coverage declaration |
| outcome_labels | Separately dated unknown, disputed or confirmed outcome |
| reports | Frozen question, historical cutoff, preparer and population statement |
| report_inputs | Exact retained family/extract/row/revision/hash and dependency role |
| effort | Actual distinct recurring/setup work, person-time and matching group |
| source_documents | Original document metadata, exact digest, size and source locator |

## Version and parent identity

Every row carries id, record_key, revision, supersedes_id, record_status, recorded_at, available_at, source_document_id and source_ref. The id is an immutable version-row identifier. The family-specific identifier names the continuing business object. Use a new row id for a revision and retain its actual predecessor. Duplicate current business IDs or conflicting revision branches require review.

Do not merge reused fleet numbers, supplier labels or filenames without source-supported identity. Keep the actual serial, assignment and configuration. Crosswalks use version ids; parent reconciliation follows their family-specific business identities.

## Original bytes, unmapped values and chronology

CSV originals retain exact UTF-8 text, BOM, line endings, byte length and SHA-256. Binary originals retain their exact bytes. The mapped canonical view does not replace that original. Unmapped columns yield null; a mapped empty source cell remains an empty string. The export availability manifest makes this distinction explicit even where a flat CSV alone cannot.

Use explicit-offset ISO timestamps, such as 2026-10-12T08:20:00Z. Event time states when the observation occurred. recorded_at states when the source recorded it. available_at states when the source version became available. The extract's availability also applies. A past effective time cannot overcome a later record or extract availability.

source_clocks retains the original source timestamp separately from the normalized timestamp. Enter the actual correction and uncertainty with the approving person's source record. The application does not infer a timezone from a later failure. Nonzero clock uncertainty remains visible and prevents complete interval accounting where exact endpoints are required.

## Output, cost and cash coverage

Enter explicit coverage_start and coverage_end for each output increment. Accepted zero across the whole window is a real observation. A missing record, unknown quality or later acceptance is unresolved, even if comparison_members says output_coverage_complete=true. For cumulative readings preserve the explicit prior reading and the interval covered by the increment.

Cost coverage is an actual source completeness declaration. Costs are grouped by currency, tax basis and economic basis. Enter the original document_line_total rather than calculating it from imported allocations. Accounting uses its own original transaction_amount and global processor/external_transaction_id. Each cash allocation identifies the reconciled cost and matching asset/job. Preserve proposed or estimated amounts with their actual status.

## Historical selection and reports

review_questions.source_selection_json and incidents.pre_event_selection_json map exact canonical family names to retained extract IDs. The ordinary record form provides selectors for these maps; source-selection in the native CLI exports the current map. When no historical map is supplied, selected current extracts must themselves satisfy the cutoff.

report_inputs uses target_revision, target_document_id and row_sha256 for the referenced record; its own revision and source_document_id describe the input-manifest row. The exact binding helper avoids manual hash transcription. Include dependencies and their earlier source editions. An assessment source_versions_json contains objects with family, id, revision and sha256; its retained rows and containing extracts must be available at the question cutoff.

Preserve the whole consecutive assignment inventory. An incident shortlist is useful for case reconstruction but does not establish a complete performance denominator.
