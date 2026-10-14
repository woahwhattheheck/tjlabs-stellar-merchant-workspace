# Platform handover for the lead

This operator prepares changes from retained complete exports. The destination platform lead owns actual API execution, automation behavior and final client acceptance.

## HubSpot implementation decisions

Use actual record IDs from the selected portal. Obtain writable property metadata and account-specific enum values. Preserve custom unique source IDs when creating new records, then retain the assigned HubSpot IDs in the crosswalk before relationship work. A batch transport response is not sufficient evidence that every record succeeded; retain per-record results and re-export the selected population.

The documented object APIs distinguish creation, updates and upserts. Partial upsert using contact email has restrictions; the proposal therefore does not infer email as a universal identity key. Object batch reads do not return associations through the associations parameter; obtain the directed relationship export separately. Actual association categories and type IDs must come from the intended direction and portal.

Primary references checked 2026-10-14:
- https://developers.hubspot.com/docs/api-reference/legacy/crm/using-object-apis
- https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associate-records/guide
- https://developers.hubspot.com/docs/api-reference/crm-custom-objects-v3/basic/patch-crm-v3-objects-objectType-objectId

## Workshare boundary

We prepare the retained input contract, transformation/identity mapping, two rehearsal comparisons, cutover change decisions, ordered proposals, guarded reversal and one final observed-target reconciliation. The lead approves business meaning, portal schema, execution window and actual platform writes. Client workshops, account access and calendar arrangements remain with the lead. The workshare is delivered asynchronously through written inputs, review and handover.

Expected fields and affected-record before-values must be checked again at the actual execution window. An export-based plan cannot provide an atomic platform compare-and-swap guarantee. Existing workflow side effects, external integrations, associated activities and undocumented properties are outside the selected snapshot contract and must be considered by the lead.
