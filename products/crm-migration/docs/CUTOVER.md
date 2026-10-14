# Delivery lead cutover worksheet

| Decision | Record |
| --- | --- |
| Population and freeze | Source/target portal and system, approved filters, extraction timestamp/timezone, all pages/files, archived/deleted-record policy |
| Import recipe | Object order, unique identifiers, crosswalk construction, deduplication settings, stage/pipeline dictionaries, target automation settings |
| Associations | Complete directed type mapping from the actual portal, primary-company rules, explicit ignored types and reason |
| First rehearsal | Configuration/run ID, input file identities, population/field/association/currency findings, correction owners |
| Second rehearsal | Corrected input editions, new run ID, all original findings retained, decision and reason |
| Operational checks | Permissions, workflows, owner assignment, consent, required custom objects/activities/files and platform-specific behavior outside the mapped scope |
| Rollback | Exact pre-load snapshot/export, import batch identifier, target-specific reversal/restore steps, accountable operator and decision authority |
| Window | Start/end/timezone, freeze communications, staffing, abort conditions and acceptable recovery window |
| Acceptance | Named delivery lead, reviewed exact scope, remaining approved exceptions, receiving walkthrough and complete source location |
| Aftercare | First-live-cycle reconciliation owner, support contact and agreed closeout period |

A zero-finding rehearsal establishes agreement under its explicit exports and configuration. The delivery lead combines it with platform receiving and operational checks when choosing the production release.
