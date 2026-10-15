# Complete 28-family source contract

## Source identity and chronology

Each row has an immutable id, stable record_key, explicit revision and predecessor, active/void status, original recorded_at and available_at, retained source_document_id and source_ref. A known blank differs from an unmapped null. Context and physical sources keep their exact original documents. The full selected export must exist by the assessment cutoff. Historical checks use documented row availability and context at the actual event.

Growers, sites, crops, locations, loggers, people, buyers, protocols and invoice_lines are dated context. Sites belong to growers, locations to sites, loggers to locations and people to growers. The declared crop unit is literal; there is no implicit conversion between cases, trays, counts and mass. Protocols retain a crop, method document and original quality meaning. That declared crop must match the evaluated forecast and quality batch. Cultivar, pack suitability and model calibration remain original source qualification.

Authorities name a person, permission, grower-or-buyer scope, granting person, grant time and validity interval. Supported engine roles are warehouse, quality-assessor, route-planner and finance. A buyer-specific permission cannot authorize a grower allocation. Existing website titles do not create authority records.

Invoice lines bind their original source document, buyer, currency, gross amount and exact physical dispatch. A credit cannot be moved onto another shipment merely because the buyer and currency match.

## Physical, forecast and observed outcomes

HARVEST_ADAPTER_CONTRACT.md describes all 16 original engine families. Physical lot identity persists across metadata revisions. All simultaneous split/merge consumption must fit the source stock. Actual dispatch is retained separately from approval and plan deviations. Whole-batch storage, known logger summaries and gaps remain explicit; missing temperatures are not interpolated.

Models bind retained artifact and training manifest originals. Forecasts bind the exact model and supplied feature rows known at their original prediction time. Shared original harvest roots stay in the same training/evaluation family. Whole-batch representative quality observations establish interval, left or right censoring; partial portions and absent follow-up remain unobserved. Commercial return or credit does not become a precise failure time.

## Population and full recurring work

population_members identifies every created physical batch in the declared creation window, including derived lots, held stock, explicit exclusions and unresolved identities. One member binds one stable physical lot. The population is a count of work items, not an instruction to add root and derived quantities as new original produce.

The application requires exact source row counts for all 28 selected families, including retained revisions. Missing or malformed potentially in-scope members remain unresolved. A complete fraction or whole-work comparison requires the full selected source and physical population.

effort records active person-minutes, actual start/end, person, member, phase, method, stable work_key and matched_group_id. All eight recurring phases are source_capture, temperature_reconciliation, model_preparation, forecast_review, allocation, outcome_follow_up, commercial_reconciliation and correction. Both methods must retain every phase, actual zero where supported, increased work and incomplete follow-up. Duplicate work, overlapping active intervals and work outside the declared population prevent a whole-population saving. Matched-subset results and all observed current work remain visible.

## Application review and recovery

A named review binds the whole selected study digest. Any changed original, mapping, selection, source field or scope requires a new review. Original images and documents retain exact bytes. Browser drafts and pending failed imports remain in the complete session or emergency export; competing saved branches are retained for explicit selection.

The ordinary application supplies no external model service. Import the original prediction output and its documents. Real farm permission, model suitability and operation decisions remain in the corresponding actual source and agreement.

## Historical quality protocol

Models retain the exact resolved protocol version and original method-document digest at release. Forecasts require that same protocol basis at origin. Each observed assessment retains the protocol version in force at its actual assessment time. Endpoint scoring uses whole observations with the exact forecast protocol basis; assessments under a different version remain visible with their original basis and a protocol-version issue. All declared forecast rows stay in the denominator. A revised protocol is not silently treated as the earlier endpoint definition.
