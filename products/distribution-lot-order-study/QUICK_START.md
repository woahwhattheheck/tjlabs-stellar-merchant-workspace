# Receive and run a complete study

## Start with the actual boundary

Use one named operator and one completed consecutive period. Leave warehouse_id blank to include all that operator's warehouses. Enter the real source cutoff separately. The source cutoff can be later than the physical period so late-recorded observations remain distinguishable from what was known at an earlier decision.

Declare the complete inventory of source rows, including superseded versions and explicitly empty families. Declare the expected lot/receipt/order members. Explain any exclusions and retain them in population_members.

## Prepare actual source context

Retain the named operator, warehouses, products, parties and people. Products require actual material IDs, grade and base unit. Authorities retain the actual grant, person, role, effective interval and optional warehouse scope. Use procurement for purchase approvals, warehouse for stock movements, qa for certificate/hold/release decisions and operations for customer orders, allocation review and postings.

Policies identify the actual warehouse/material method, FIFO or FEFO, and a JSON array of required certificate kinds. For example, ["analysis"] declares one kind; it is an example value, not a universal requirement. Customer rules identify the exact customer/product and approval. Never fill a missing rule with a guessed number of days.

## Import original and returned editions

The CSV intake shows each original header. Map each canonical field deliberately. Use the same source column once. Where an actual field was not observed, leave its mapping empty; do not substitute an empty string that asserts a known blank.

Import both sides for all 39 families. The selection view records which original extract is in use. Identity maps connect source-version IDs explicitly; the unique-ID helper only maps identities present once on each side. The comparison reports changed fields and retained document-byte differences.

## Attach and bind evidence

Add each original document with its actual availability and media type. Link it to the exact row and side. Certificate reviews require the SHA256 of the certificate source document's actual bytes. QA-state and allocation-decision inputs require the canonical source-row hash. Decision reviews require the hash of the full case, input population and supplied proposals.

The record editor and native bind-record command copy these exact bindings into a pending record. They preserve the supplied actor and actual review time. A stale prepared record is rejected when its selected extract changes.

## Read operational results

The physical view shows lot, warehouse, product, base unit, on-hand quantity, returned stock awaiting disposition and QA state. Expand repacking to see the actual input/output/loss balance, transfers for in-transit stock, and each decision for its complete frozen population and eligible ranking.

An observed dispatch can be physically real while its compliant fulfilment remains unresolved. Keep the original dispatch. Resolve the actual approval, certificate, pick or customer-rule source through a retained correction. The desk never repairs missing operating history by inventing an event.

Check whole-line outcomes and the full order grouping. Review each product/unit separately. The commercial view shows original postings and their currency. Recurring work shows baseline, current and the signed change, along with missing phases and increased work.

## Correct, review and recover

Select an existing record to prepare a correction. Keep its source identity, add an explicit revision and predecessor where the underlying business record changed, and explain the original evidence. The prior extract remains retained.

A study-level review binds its current digest. Use the configured QA and operations roles and the actual reviewer's name. Changing scope, originals, selected rows, notes or records requires a new review of that edition.

Use Save complete file before moving devices or closing a memory-only session. Save & recover exposes retained editions and competing branches. Opening a branch preserves the branch you leave. Export the study ZIP for full originals and readable results, and the source ZIP for the maintained application.
