# Service commerce adapter contract

## Entry point

analyze(records, options) is synchronous and returns a plain JSON-compatible result. Amounts use exact rational decimal arithmetic and expose numerator, denominator and readable decimal. All canonical scalar inputs are text. Unknown mapped values may be null; observed blanks are empty text.

records contains all fifteen keys exported by KINDS. Each value is a complete selected family array of either flat canonical rows or {values,source,extract_available_at}. The complete canonical fields are exported in FIELDS and provided as CSV headers.

options:
- as_of: explicit ISO timestamp including offset.
- extract_available_at: map from every family to the selected source edition's actual availability. A per-row extract_available_at overrides it.
- expected_counts: original record count for every declared family, including retained revision rows.
- population_complete: explicit boolean declaration for this selected supplied-record scope.
- resolve(kind,id,time): historical service context, described below.
- document(id,time): one retained original document available at time.

Completeness requires that every declared family count reconciles with the records actually available at the cutoff, and that all reconstructed relationships are valid. This is completeness within the supplied scope. The caller's full intake register establishes whether that scope covers the business population.

## Historical context

The resolve callback returns one exact, historically valid object or null. It must resolve record/extract availability, revision conflicts, effective dates and required domain validity. A later correction cannot silently rewrite the older context.

Required shapes:
- case: case_id,customer_id,asset_id.
- asset: asset_id,customer_id,ownership; ownership provider identifies an owned rental asset.
- person: person_id.
- work: work_id,case_id,asset_id,performed_at,action,quantity,unit,disposition.

The returned identity must match the requested identity. A work object represents the actual supplied performed-work observation, with its technical validity established by the service model. The replacement-fee path specifically requires disposition unrepairable on the linked assessment; the commerce module does not diagnose equipment.

The document callback returns the original {id,available_at,...} or null. Its ID and actual availability are checked again. The caller retains complete bytes, source metadata and any hash/length checks. Merely returning a filename is insufficient.

## Revision and evidence rules

Every family has immutable id, stable record_key, positive revision, supersedes_id, active or void record_status, recorded_at, available_at, source_document_id and source_ref. Extract availability is separate from record availability. An explicit complete predecessor chain is required. Multiple current leaves or duplicate immutable/business IDs are unresolved.

A field holding an immutable record reference ends in record_id. It identifies the source edition that actually supported the decision. Historical decisions are evaluated using what was known when they occurred. Later cancellation or correction remains separately retained.

hashRow(kind,row) hashes canonical named fields in sorted-key JSON, preserving strings and null. Use it when preparing a quote approval. It returns the SHA-256 text, not a caller-supplied digest object.

## Authority and scope

Authority roles are quote,customer_approval,policy,entitlement,replacement,credit,warranty,rental,custody. A source record binds a person and either an exact customer ID or an explicit supplied wildcard. The validity interval is inclusive at valid_from and exclusive at valid_to. Empty valid_to is open ended.

Authority does not arise from an email address or job title. The actual retained authority document and person must be available for the event. Policy approval requires its documented policy authority. Customer line approvals and rental agreements require their own supplied customer authority.

## Approval and physical work

Each quote row describes one line, exact quantity/unit, currency, unit price and explicit tax amount. An approval names that immutable row, canonical hash, approved quantity, decision time and original decision document. Declined/revoked approvals have zero approved quantity.

A work allocation binds the approval edition available at the actual work time to a performed-work observation available by the allocation record's available_at. The work may be recorded after physical work starts or completes. Its case, asset, action, unit, quantity and performed_at must still agree; work_observed_as_of identifies the reference cutoff. Aggregate consumption cannot exceed an approval or the performed work. Current independent approvals cannot exceed the same quoted quantity.

All active invoice lines together, across invoice IDs and immutable basis revisions, may not exceed their allocation's quantity or proportionate approved line amount. Serialized sale invoices likewise cannot multiply the supplied sale quantity or amount; diagnosis quantities cannot multiply the observed work. Partial approval does not authorize the entire quotation.

## Purchase benefits and replacement

A serialized purchase line describes one physical unit and its actual customer. A first-service policy supplies its exact permitted action and maximum uses. The benefit binds the purchase and policy editions available at its actual approval, the asset, service case and performed work observed by its recorded availability. Policy effectivity must include approval and use. Duplicate work and excess use remain unresolved.

A replacement links an old customer unit, its actual unrepairable assessment, a different new unit and the completed replacement purchase. The old unit's identity is retained.

A replacement-fee credit binds the original diagnosis charge, the policy edition, qualifying replacement and dated credit authority. Credit amount, aggregate credits and policy limits must reconcile. Approved/unposted credit and a posted credit are separate outcomes.

## Warranty

A warranty request is distinct from the manufacturer's decision and actual settlement. Approved and declined events refer to the exact claim. Payment/refund events require a provider transaction identity, source document, consistent currency and one valid approved decision actually available at the individual payment/refund event time. A later-entered approval cannot retrospectively validate an earlier settlement.

An unsettled approved balance is not cash. A contradictory decision history remains visible for correction. The actual broad service model should supply manufacturer's authority records and original event evidence.

## Rentals

The customer's serviced asset and the provider-owned rental asset remain separate. A supplied accepted agreement contains rate, currency, billing-unit minutes and minimum units. The engine rounds elapsed custody upward to the explicit billing unit and applies the supplied minimum.

An issue and return event must identify the rental asset. The customer's repaired unit arriving cannot close the rental. An open rental is measured through the analysis cutoff and shows an unknown return time. Its modelled accrual is separate from actual rental invoices and payment.

Conflicting simultaneous custody for the same provider asset is unresolved. Current implementation models one issue/return cycle per agreement; repeat hires need separate rental IDs and original agreements.

## Money and presentation

Keep quoted amounts, approved scope, completed sales, issued invoices, approved credit, posted credit, net observed cash and rental accrual separate. Group by currency. An unresolved row makes its category incomplete; known_amount is only the sum of valid retained rows.

A duplicate payment provider transaction cannot multiply observed cash. Zero is a valid explicit amount where permitted; an empty or missing price remains unknown. A complete source population and an observed source event are required before presenting a category as complete.

The ordinary application should show the source record and issue beside each derived amount. Preserve all original rows, including ones that cannot presently support a calculation.
