# Water laboratory handover adapter contract

Module water-lab.cjs exports FIELDS, KINDS, IDS, hashRow(row), analyze(records, options). The 12 families and their complete fields are in lab-schema.cjs. Input rows are scalar strings or nulls, either flat or wrapped as {values,source,extract_available_at}. Common version fields match the recurring-work model.

Options: as_of (explicit ISO 8601 offset), extract_available_at (per-family ISO), expected_counts (per-family integer), population_complete (boolean), resolve(kind,id,at), document(id,at), authorize(role,personId,systemId,at).

resolve kinds:
- system: {id,available_at}
- location: {id,system_id,purpose,available_at}
- schedule: {id,system_id,approved_at,valid_from,valid_to,available_at}
- person: {id,available_at}
- report: {id,system_id,interval_start,interval_end,purpose,available_at}

document returns {id,available_at}. authorize returns {authorized:true,available_at,source_document_id}, with roles collector, lab-receiver, lab-reviewer or report-preparer. A callback must resolve what was known at the passed instant. Source availability and exact ID are checked, not inferred from latest data.

External lab identity and scope are explicit laboratory rows with scope-document and valid interval. Custody party IDs are opaque recorded parties; the expected recipient for laboratory receipt is the laboratory_id, with a valid receiving event and exact sample join. Accepted accessions require a recorded receiving actor and matching accepted custody receipt.

Result qualifiers: eq, lt, le, gt, ge, nd, present, absent, invalid. Original value text, method, unit, detection and reporting limits remain visible. Nondetect is not numeric zero. Maximum reporting limit on the requested order line concerns whether the requested analysis was reported at the requested resolution; no health or treatment threshold is inferred.

Reports have retained immutable versions. A successor report explicitly accounts for every earlier usable result through lab_amendments: replace, withdraw or carry_forward. Each action binds prior report/result hashes; replacements bind the actual successor result. A partial correction must explicitly carry forward unchanged results. New analytes may be added with valid order lines. Historical views retain the report/result set known at their cutoff.

lab_reviews binds exact result hash and accepted/rejected/needs_review at the actual reviewer decision. lab_report_inputs binds target report, exact result and review at selected_at. An earlier report input remains historically valid when a later laboratory amendment arrives; it is also marked superseded for current-source purposes, so the current report preparer can reconcile it.

Separate outputs retain sample custody status, accepted/rejected accessions, result intervals/qualifiers, effective report result sets, amendment history, human reviews, target-report bindings, population completeness and unresolved source/domain issues. Full source provenance and record hashes travel with every finding.

Custody events include an explicit positive sequence. Sequence starts at one for collection, remains consecutive and nondecreasing in event time, and connects each from/to custodian. Laboratory receipt closes the chain. Conflicting laboratory-sample identities are unresolved across laboratory record revisions. Report selection uses the latest unambiguous review decision known then, while preserving historical inputs after later review or result changes.

Canonical cell availability: an explicit empty string is a mapped blank, including an explicitly open valid_to interval. A null or missing canonical cell remains unknown and is retained as null in row hashing; the affected row is excluded with CANONICAL_CELL_UNAVAILABLE. Unknown values must be resolved or mapped from original source before that row can support downstream conclusions. Other source rows remain inspectable.

Extract and event chronology have different meanings. extract_available_at is the availability of the complete selected export edition and must be no later than the overall assessment cutoff. Original row.available_at governs historical decisions inside that edition. A faithful later export may therefore preserve earlier documented decisions; it does not move the original source availability forward to export time. Adapters must supply original availability, not invent it from export time. An accepted accession, its recorded disposition and its custody receipt must be available at analysed_at before supporting that analysis. The report itself can be issued after analysis.
