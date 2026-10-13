# Property and lease continuity operating guide

This module belongs to the original Bluewave / IDA partner application. It performs local source intake, reviewed mapping, independent target-return reconciliation, attributed decisions and recorded rehearsal/cutover/receiving. It does not write to Salesforce, Docusign CLM, Centros, ArcGIS or any tenant. The partner's actual supported writer remains separate.

The source is the issued 28-page IDA RTP, resource 8912550 / document 8912599, plus the retained conditional workshare:
https://www.etenders.gov.ie/epps/cft/downloadContractDocument.do?documentId=8912599&resourceId=8912550
https://app.notion.com/p/3f8dd7723100818b98a5dbc6637714b1

The qualification deadline has passed. This application supports a prospective implementation workshare; it does not constitute a bid, appointment, accepted order, source permission or successful tenant commissioning.

## Use the complete actual population

Create an empty workspace and choose your named operator. Upload original UTF-8 CSV, JSON or JSONL exports without modifying their bytes. Select SOURCE or independently retrieved TARGET, actual platform, dataset family, actual extraction UUID/time/method/reference, effective cutoff and complete population scope. A source capture precedes the selected original load; a target capture follows its completed returned outcome and binds its operation UUID.

JSON selects a complete array using an explicit JSON Pointer. JSONL retains every nonblank original line as one object; blank records fail rather than disappear. CSV requires unique nonempty headers and equal field counts. CSV values remain strings. A selected nonempty null token is interpreted explicitly; an empty string remains distinct from absent or null. If quoting distinguishes a literal occurrence of the chosen null token from null, use a lossless JSON source or an unambiguous export contract instead.

A header-only CSV or empty selected JSON array establishes zero rows only when the original expected denominator is zero. An unknown denominator remains unknown. A partial selection or change feed remains PARTIAL or DELTA and cannot establish a complete full-population receiving result. A complete export must be FULL with a known denominator matching every retained record.

Original metadata is an operator observation with source references. Declaring independent acquisition is not automatic proof of platform origin. Retain the actual native read/export and load-return references. Identical bytes from two legitimately independent exports are allowed; different hashes by themselves also do not establish independence.

## Review exact identity and field mapping

Create an immutable mapping edition for one declared dataset family and source/target authority. Select corresponding composite JSON Pointer keys. Each key preserves text/integer/boolean type. No matching by display name, proximity, aggregate total or a convenient first duplicate is performed.

Give the mapping an explicit identityNamespace. This is the agreed population namespace, not a guessed vendor field. Relationship scopes explicitly name sourcePlatform, targetPlatform and identityNamespace. A Docusign document can therefore reference its Salesforce property without treating equal strings from different populations as the same identity. KPN project identity remains separate from property hierarchy.

Map every field selected by the signed inventory, leaving unmapped original fields available in the source viewer. Declare EXACT, TEXT, DECIMAL, DATETIME or BOOLEAN plus required/null semantics. Decimal input must be an exact string. Floating-point values are not converted to money. Decimal comparison is exact and permits semantically equal strings such as 10.00 and 10, while preserving both original values in the source. Currency is a separate exact three-letter field; no exchange rate or aggregation is inferred. Offset date/time fields compare instants, while source bytes preserve original timezone spelling.

Semantic roles make full-population checks explicit:

| Family | Required roles and authority |
|---|---|
| Property | identity; optional parent. Reviewed Salesforce PMS target. |
| Rental space | identity and property, with explicit property reference scope. |
| Lease | identity, rentalSpace, leaseStatus, effectiveStart and effectiveEnd. Explicit LIVE/ACTIVE states and selected inclusive/exclusive end boundary. |
| Project | projectId and property. KPN identity is independently reconciled. |
| Document | documentId, documentVersion, property, documentHash and documentBytes. Target is Docusign CLM. |
| Finance | identity, counterparty, currency and amount. Source authority is Centros; a Salesforce target is a visibility mirror. |
| Spatial | identity, crs and units. Source authority is ArcGIS. No coordinate conversion or spatial write is performed. |

Document version reconciliation compares the original declared metadata, byte count and digest from retained complete exports. It does not itself download every controlled document or certify a signature. Preserve actual controlled bytes and signature/version evidence through the approved source route. A matching filename is insufficient. The application never relabels metadata-only inventory as a locally verified 100 GB document archive.

Save the mapping, then record an actual APPROVED or REJECTED review with original evidence. A correction creates a later mapping edition and a separate review. Earlier mappings, approvals and reports remain intact.

## Reconcile the original load against an independent return

Record the actual authorized writer, native operation UUID, start/completion times, original reference, input SHA and actual SUCCESS/PARTIAL/FAILED/UNKNOWN outcome. The exact load input must be one of the retained evidence files. A transport acknowledgement or unknown financial request must not be labeled a successful posting.

Select complete source/target pairs with their reviewed mapping editions. Source and target must share the explicit accepted population scope. Every target acquisition binds the exact load operation and follows its completed observation. Every source acquisition precedes the load.

The report preserves expected and observed populations separately. It classifies MATCHED, MISSING, EXTRA, CONFLICT, DUPLICATE and UNVERIFIED, retains original one-based row locations and source digests, and shows every selected field difference. Duplicates are displayed in full; no member wins silently. Null, empty, absent and typed values remain distinct.

Cross-population checks cover missing property/rental-space references, property cycles, duplicate semantic identity, document-version identity, currency/decimal values, supplied CRS/units and explicit lease states/intervals. Overlapping LIVE/ACTIVE lease intervals and more than one such lease at the reviewed cutoff are blocking. A date alone cannot make a terminated or otherwise declared nonactive lease active.

An incomplete export remains usable as original evidence: its declared denominator and declared completeness are retained unchanged, beside the actual observed count. Verified completeness requires FULL scope, an explicit complete declaration, a known denominator and matching actual row count. A declared count mismatch, partial/delta input or unparseable identity produces a blocking finding. Where the opposite population's full identity set is not established, an unmatched row is UNVERIFIED rather than MISSING or EXTRA. A missing property or rental-space reference is likewise UNVERIFIED when the relevant platform/namespace population is incomplete or absent.

Original JSON non-integer numbers are parsed as their exact numeric tokens without conversion to binary floating point. EXACT mappings compare complete type-tagged trees, distinguishing numbers from text, booleans, null, arrays and customer objects. Numeric notation is retained literally under EXACT; choose an explicit decimal-string mapping when business rules call for decimal normalization. Non-integer numeric tokens cannot silently enter TEXT, DECIMAL, DATETIME or identity fields as strings. Safe integer keys remain integers, and unsafe integers retain their exact Python integer value for comparison.

HTTP source rows expose precise non-integer tokens and unsafe integers as explicit originalJsonNumber descriptors, together with numberTokens entries identifying each exact JSON Pointer, numeric kind and lexeme. A customer's similarly shaped object has no numeric token at that location, so it cannot masquerade as a number. Reports carry the same display descriptors and full-report numberTokens, while EXACT mapped values additionally carry their full typed exact tree. The original unmodified file remains downloadable. Neither the browser nor report JSON is asked to represent a high-precision value as a rounded native JavaScript number.

Every finding has a deterministic identity. Record REQUIRE_CORRECTION or, for a reviewable discrepancy, an explicit ACCEPT_EXCEPTION with named reason and evidence. Acceptance preserves the discrepancy; it does not turn it into a match. Coverage, identity, invalid types, hierarchy and active-lease blockers cannot be waived. Correct their source/mapping in a later edition and perform the same explicit original workflow.

Full JSON and HTML reports include all selected rows. UI row and finding pages provide stable offsets over the same frozen report. The stored event retains exact pair/approval references, counts and report SHA; full rows are regenerated from original immutable blobs instead of copied through every workspace revision.

## Record the two actual rehearsals

Rehearsal one references a REHEARSAL_1 reconciliation and its actual outcome. ACCEPTED requires no nonwaivable blockers and a current explicit acceptance decision for every remaining reviewable discrepancy.

Rehearsal two references the accepted first rehearsal, a later full source acquisition for each same population, the original next reconciliation and a distinct actual load operation. Matching unchanged content is permitted when its independent later acquisition is genuine. Corrected mappings must descend from the original reviewed mappings. The second rehearsal covers the complete original population; it cannot silently omit difficult datasets.

REJECTED outcomes remain saved as actual observations. Recording an outcome does not execute a migration or claim that an absent native run occurred.

## Authorize and receive the cutover

A cutover plan freezes both accepted rehearsals, the agreed effective cutoff and change window, named authority, explicit continuing-write/delta policy, rollback or forward-correction procedure, and actual recovery evidence. The exact second-rehearsal mapping editions remain the production selection.

Plan creation checks the currently accepted second-rehearsal report and its exact mapping approvals. Release authorization repeats those current checks, including each original finding's latest disposition. Accepted final receiving checks the complete final report's current finding dispositions and exact mapping approvals, and retains the authorization's frozen rehearsal releaseBasis as history. A later mapping rejection blocks acceptance; an original rehearsal discrepancy that was requested to be corrected does not block a final population in which it is actually fixed. Earlier approvals, findings and outcomes remain historical records. Corrected first-rehearsal mappings remain historical when a later accepted second-rehearsal edition supersedes them.

Record the actual named authorization before the production load. Successful production and its independent returned population must fit the authorized window/cutoff and complete original cohort. Accepted final receiving references a CUTOVER reconciliation, its original load and the previous second-rehearsal reconciliation, and retains actual delta and recovery evidence.

A rejection can be recorded after the change window, without pretending that a failed or overrun attempt met success prerequisites. Rejected receiving always names the original plan and a reason; its reconciliation may be absent when an independent return was unavailable. An optional loadObservation retains actual known operation identity, writer, original reference, outcome, times, input and evidence. Unknown identifiers or times stay null. NOT_STARTED and RUNNING cannot claim completion. If a reconciliation is selected, it must be an actual CUTOVER edition linked to this plan's second rehearsal. A separate load observation must refer to that same operation. Failure, missing-return or recovery evidence is required, but an absent recovery result is never fabricated. A rejected record cannot create an accepted cutover or editable handover.

An accepted final cutover uses the same discrepancy rules as rehearsal acceptance. It does not issue a financial transaction, change a lease or send a platform request. A recovery attachment is recorded evidence; the operator must supply the real exercise and authorized decision, not a fabricated success.

Finally record the receiving operator, actual received/reopened times, original independent correction/reopen reference and evidence. Editable handover follows an accepted cutover and does not imply that every customer policy or procurement obligation has been certified.

## Complete history and portable receiving

The host's existing SQLite workspace owns compare-and-swap, request replay, first results, blob custody and archive receiving. The domain accepts the exact requestId/kind/actor/at/body envelope. Every retained item stores its complete original body, actor/time/request, global sequence, derived result and SHA. Imported-state validation replays those complete original commands against actual blob bytes and compares every result and collection. Supplied counts or hashes alone cannot fabricate a prior accepted workflow.

There is one application and one existing workspace store. No new reconciliation database, background worker or tenant gateway is introduced. The full original sources, mappings, decisions and portable history remain editable through later attributed commands.

## Deliberate local working-cohort bounds

This local product accepts at most 64 MiB per blob, 256 MiB distinct original blobs per validation, 25,000 rows per dataset, 100,000 source-plus-target rows per reconciliation, 32 population pairs, 64 MiB complete report and 8 MiB current state. The shared receiver also bounds cumulative history and archives. These are explicit local operating limits, not claims about IDA's actual inventory.

The commercial estimate's up-to-25,000 primary rows and controlled-document allowance do not bound related history or mean that 100 GB fits in a local package. Agree a complete working cohort with all required related populations and individually account for excluded records/versions/interfaces. Capacity errors do not truncate sources or turn exclusions into success. The prime's approved controlled-document system remains the custodian of the larger estate.

## Pure API

new_state(id,title,created_at)
apply(state,command,read_blob) -> (next_state,outcome)
validate_state(state,read_blob) -> counts and state SHA
view(state,read_blob,as_of=None) -> complete saved wrappers plus summary
source_rows(state,source_id,read_blob,offset=0,limit=100)
report(state,reconciliation_id,read_blob)
report_rows(state,reconciliation_id,read_blob,offset=0,limit=100,status=None)
finding_rows(state,reconciliation_id,read_blob,offset=0,limit=100,severity=None)
report_html(state,reconciliation_id,read_blob)

read_blob receives a SHA and returns exact bytes. No API performs network I/O. source_rows and report_rows preserve full values with stable one-based original row locations; offset is zero-based. A later operating view does not rewrite historical acceptance.

## Cutover receiving body and current release bindings

cutover.close uses exactly id, planId, reconciliationId, decision, deltaEvidence, recoveryEvidence, note, reason and loadObservation. reason is required text. ACCEPTED requires reconciliationId and loadObservation:null. REJECTED permits reconciliationId:null. loadObservation is null or {operationId,startedAt,completedAt,writer,reference,inputSha256,outcome,evidence}; identifiers, times and inputSha256 may be null where unknown. Outcomes are NOT_STARTED, RUNNING, SUCCESS, PARTIAL, FAILED and UNKNOWN. A known inputSha256 must resolve one of that observation's exact retained evidence files. When rejection has no complete return, actual evidence must exist in at least one of deltaEvidence, recoveryEvidence or loadObservation.evidence.

Plan and release results freeze releaseBasis with reportSha256, actual discrepancy decisionIds, acceptedWithExceptions and current mappingApprovals [{id,sha256,mappingId}]. Accepted receiving preserves that original authorization releaseBasis and freezes current final-report checks in acceptance using the same report/approval shape. Rejection has acceptance:null and releaseBasis:null, preserving any known original authorization and reconciliation identities separately. These are observations and release decisions within this application; they never dispatch platform operations.
