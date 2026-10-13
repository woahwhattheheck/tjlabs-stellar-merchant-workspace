# Definian migration acceptance workshare

**Proposed implementation workshare: USD 9,600 over 15 business days.**  
**Commercial status: proposed scope; acceptance and customer inputs have not been received.**  
**Delivery owner:** the existing Definian opportunity and publishing owner in Sales, thread 1791872726.629159.  
**Product:** the complete Definian Migration Acceptance workspace and its original dlt/DuckDB runtime.

## The useful contribution to Definian's delivery team

Definian's published migration overview identifies repeatable conversion, post-load reconciliation, inconsistent legacy data and changing specifications as practical delivery concerns. Its modernization services also include governance, data quality, migration and data engineering. These are stated service areas; they do not establish a private customer requirement or an agreed purchase. Sources: [Data Migration Services Overview](https://www.definian.com/articles/data-migration-services-overview) and [Data Modernization](https://www.definian.com/solutions/modernization), read 13 October 2026.

This workshare supplies a complete acceptance workbench for one agreed migration slice. The team can retain the original files, execute the selected native pipeline, compare every business row, inspect related-object integrity, make attributed exception decisions, correct source data, and hand the entire editable history to a receiving operator. Definian's consultants and customer data owners keep the mapping decisions and business sign-off.

The practical fit is the boundary between a migration team's source/mapping work and the evidence its receiving customer needs to review. The application complements the team's existing delivery process. No integration with proprietary Applaud interfaces has been selected or implemented in this scope.

## Fixed implementation scope

The proposed fee covers one customer workspace, one agreed migration slice and two receiving installations on the same selected Linux/Python platform:

- Up to four complete source resources, supplied as CSV, JSON arrays or NDJSON, with all resulting business tables and child-table mappings named in the accepted scope.
- One pinned original dlt 1.31.0/DuckDB runtime, its complete portable runtime package, and independent receiving on a matching interpreter and platform.
- A complete retained input register, immutable source editions, explicit column types and mappings, primary keys, NULL rules, native pipeline plans and attributed plan review.
- Original native extraction, normalization and loading, followed by fresh full destination verification. Complete native state, closed files and original stage receipts remain available.
- Exact typed parity for every agreed business table and every row multiplicity. The plan records deliberate exclusions such as native metadata columns; a business table cannot disappear from acceptance implicitly.
- Business keys and required fields, parent/child relationships, duplicate-parent ambiguity and orphan detection, plus grouped counts and exact integer/decimal sums on both sides.
- Separate required and reviewable findings. An acknowledgement records review. An accepted exception resolves only a finding that the frozen rule edition explicitly made reviewable. Required identity, parity and native-completeness failures remain blocking.
- One planned correction cycle and one subsequent confirmation cycle against the same agreed mappings and business rules. Changed source bytes become new editions; earlier reports and decisions remain available.
- A reviewed retained consumer selection and its original rollback, complete named handoffs, independent fresh receiving, returned forward history, same/older receiving and cold reopening.
- The complete operator UI, CLI/API, editable source, runtime/source manifests, full native result files, business reports, decision editions, operator instructions and commissioning handover.

For quoting, propose a commissioning envelope of **250,000 business rows in total across the agreed normalized tables and 128 MiB of literal source files in total**. These are proposed workshare boundaries, not claims about measured throughput. Phase 1 confirms the actual full-population export sizes, retained-history footprint and host resources. Wider datasets, more resources or additional normalization tables receive an explicit scope/host adjustment before the fixed scope is accepted.

The installed software's own limits remain authoritative. A higher software cap does not promise that an arbitrary dataset fits the chosen host or the fixed fee.

## Five delivery phases

The phase amounts allocate the proposed work; they are not five separate invoice milestones.

| Phase | Active business days | Proposed allocation | Practical completion |
|---|---:|---:|---|
| 1. Intake and rule selection | 3 | USD 1,600 | Complete input register, independently reviewed expected tables, mapping inventory, selected host/runtime and named required/reviewable rules accepted by the delivery owner. |
| 2. Native migration | 3 | USD 2,400 | Original native extract/normalize/load course and fresh full verification retained for the selected input edition. Failures retain their original job and result. |
| 3. Acceptance, exceptions and correction | 4 | USD 2,400 | Full measured report, attributed dispositions, correction edition and fresh verification; required failures resolved and remaining permitted exceptions deliberately accepted. |
| 4. Receiving and rollback | 3 | USD 2,000 | Complete named package received independently, original consumer rollback demonstrated, returned history received without loss, older named package still reproducible. |
| 5. Handover | 2 | USD 1,200 | Receiving operator opens the selected edition, retrieves the full source/native/report files, demonstrates the normal continuation path, and accepts the handover register. |
| **Total** | **15** | **USD 9,600** | **One complete agreed migration acceptance workshare.** |

Days are active delivery days after agreed scope, complete inputs, access and the initial payment are available. Waiting for customer extracts, business decisions, host access or correction files is recorded as an input hold and does not silently consume implementation days. The owner maintains the original delivery calendar and records revised dates when a hold changes it.

## Payment proposal

- **USD 4,800** when the scope, input register, owners and start date are accepted.
- **USD 4,800** when the complete agreed native acceptance and editable handover are accepted.

No payment, purchase order or commercial acceptance is recorded by this document. The original opportunity owner owns quotation, customer correspondence and any invoice. A package generated by the reference programme does not itself establish either payment milestone.

The second milestone requires the agreed complete result and receiving evidence. Open customer input holds, unresolved required findings or missing receiving artifacts remain visible in the handover register until resolved or the scope is expressly revised.

## What the customer supplies

The customer and Definian jointly nominate a migration lead, a business data owner, a receiving operator and a host/access owner. They provide the complete selected source populations, their export boundaries and original provenance; independently reviewed expected values; mapping and key semantics; decimal scales, units and currencies; NULL conventions; relationship policies; and authority for each reviewable exception.

The input register in [COMMISSIONING.md](COMMISSIONING.md) gives the exact delivery fields. Credentials are provisioned by the existing host/access owner through the agreed private route. They are kept outside source archives and working handoffs.

A customer may choose to use existing Applaud or ERP exports as the retained input boundary. Producing those exports, interpreting proprietary formats and configuring live system connectors must be assigned explicitly to the existing system owner. The source format alone does not prove an implemented live connector.

## Responsibility split

| Work | Implementation team | Definian/customer owner |
|---|---|---|
| Installation and portable receiving | Supply the complete selected product/runtime; commission the two agreed installations; retain exact receipts and handover. | Supply the authorized host, matching platform/interpreter, access, retention destination and named operator. |
| Source and expected-data meaning | Preserve literal bytes, typed mappings and all measured outcomes; surface inconsistencies. | Confirm complete export scope, expected values, business keys, units, NULL conventions and source correction authority. |
| Native migration and reconciliation | Operate the selected original engine and retain the full stage/comparison history. | Approve the exact plan and deliberate continuation decisions when an original effect is uncertain. |
| Business exceptions | Implement the declared required/reviewable policy and retain attributed decisions. | Decide whether a specific reviewable finding is acceptable; provide reason and named accountable actor. |
| Correction cycle | Receive the corrected edition, update only the agreed mappings where authorized, rerun the required native stages and verify the full result. | Correct customer-owned source data and confirm the corrected expected population. |
| Retained consumer selection and rollback | Demonstrate selection and rollback inside the delivered workbench. | Own any external production system switch, its change window and operational approval. |
| Ongoing operation | Deliver editable source, instructions and the included handover correction window. | Own scheduled runs, access lifecycle, backups, retention, source freshness and ordinary day-to-day review. |

## Change and correction policy

Every correction starts with a finding or defect reference, affected source/plan/report identity, proposed change, owner and acceptance evidence. Source-data corrections produce new immutable source editions. Rule changes produce a new rule edition. A result is recalculated against its own frozen inputs so the earlier record remains understandable.

The fixed fee includes the planned correction and confirmation cycles within the accepted four-resource slice. An implementation defect in the agreed deliverable is corrected within that scope. A new connector, new business object, materially different source semantics, changed platform, additional correction cycle or larger population is a scope change. The owner agrees its impact before that additional work starts.

Include a **10-business-day handover correction window** after acceptance for defects in the delivered, agreed workflow. The handover register records each issue, its impact and planned resolution. Ongoing monitoring, new migrations, continuous on-call operation and future engine upgrades are separately agreed services.

## Acceptance evidence

The customer receives the complete evidence, not only summary counts or screenshots:

1. The accepted source register and full source files with byte/hash identities.
2. The selected original runtime identity, portable archive and installation/receiving receipts.
3. Complete compiled native and business-rule plans, including all table mappings.
4. Original native job/stage history and closed database/state files.
5. Full typed observations and comparison reports for every agreed population.
6. Every business finding, complete failed-row identities and attributed disposition editions.
7. The corrected final edition and fresh verification that supports its selected consumer.
8. Original selection/rollback history, named handoffs and independent fresh/forward/same/older receiving results.
9. Full editable source, operator and commissioning documents, cold-reopen evidence and handover ownership.

A screenshot demonstrates a view; the complete underlying files establish what was measured and retained. The acceptance decision names the exact delivered revision and artifact identities.

## Current product and demonstration status

The complete application and reference programme are authored. The reference uses the unchanged original dlt fruitshop resources: 13 customers, 3 inventory categories, 6 inventory items and 100 purchases, **122 rows in total**. It deliberately introduces a documented orphan edition, demonstrates required and reviewable handling, then reloads the corrected original source before final verification and receiving.

At preparation of this scope, **the Definian native reference course has not run**. Its actual completion will be established by the original receiving journal, complete source-bound CUSTOMER_RESULT.json, original native receipts and all retained artifact identities. These reference results will remain distinct from a paid customer's commissioning result.

## Agree the start

The original opportunity owner can turn this proposal into the agreed workshare by recording the selected four-resource slice, named tables and volumes, host/runtime selection, accountable owners, required/reviewable policies, delivery dates and the two payment milestones. The accepted input register then starts Phase 1 and remains the reference for the complete handover.
