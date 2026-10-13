# Property continuity — operator guide

This application prepares and reviews one property-system continuity release. It keeps the original files, mapping decisions, independently returned target data, reconciliation findings, rehearsals, cutover decisions and editable handover together in a saved case.

Start with the accepted source inventory and the partner's actual field contracts. Keep the original case for the whole release. Later source files, mappings and decisions become later editions so the team can reopen an earlier result and see exactly what it used.

## Open the application

Use Python 3.11 or later. The application uses the Python standard library. Work from the complete application source directory containing `source-selection.json`, `bluewave/` and `public/`.

For a new programme, choose one workspace UUID and retain it. Replace the example workspace UUID and title with the actual case:

```bash
python -m bluewave.cli create --workspace ../property-case --id 19fdfc35-569b-4bf3-a05b-9d7f726d8d40 --title "Property continuity programme"
python -m bluewave.cli serve --workspace ../property-case --source-root . --selection source-selection.json
```

The server prints its local application URL. Open that exact URL in a browser on the same machine. Use the existing workspace path when returning to the programme. The server selects an available local port; press Ctrl+C in its terminal to close it cleanly.

Open **Source editions**, enter **Operator reference** and **Operator name**, then choose **Use this operator**. These values identify the person making each saved decision. The application retains its working case in the workspace directory and keeps interrupted browser requests and drafts in that browser's local storage.

### Navigate the case

| Section | Main action |
|---|---|
| Source editions | **Import original population**, inspect its original rows and retain independent target returns |
| Mappings | **Create mapping**, select keys and typed fields, then **Review mapping** |
| Reconciliations | **Create reconciliation**, select the original load evidence, inspect compared rows and **Record decision** on findings |
| Rehearsals | **Record rehearsal** against the exact first or second reconciliation |
| Cutover | **Plan cutover**, **Record authorization** and **Record cutover result** |
| Handover | **Record receiving** after the recipient's actual reopening and correction |
| History | Read each original command, operator, revision and saved result |
| Saved requests | **Recover original** after an interrupted save |
| Export and receive | **Export this saved revision** or **Receive complete archive** into a separate workspace |

The header and workspace list show the saved workspace name alongside the programme title. An independently received copy keeps the original programme identity and starts its own editable history in a separate location. Select the intended original or receiving workspace before continuing a saved request; drafts, requests, source uploads and downloads remain bound to that specific workspace.

Editors preserve drafts. Use **Save** for a new attributed edition. **Use current revision** keeps the draft while you review a newer saved state. **Discard draft** removes an unsubmitted draft. Resolve a pending original request before rebasing or discarding its draft.

## 1. Establish the working case

Name the programme, the source estate, the target implementation and the people responsible for each population. Record the source cutoff and the relevant time zone. Record whether each delivery is a complete snapshot, a selected population or a change feed. A file containing no rows and a file that has not arrived require different decisions.

Agree the population before reviewing results. The baseline covers primary property, lease and project records, their dependent rows, the agreed transaction history, and each controlled document version. Record the owner and intended treatment of anything excluded from this edition. Keep an explicit denominator for each population so a complete lease file cannot conceal a missing charge schedule or document set.

The original Bluewave planning offer uses a stand-alone 60-hour baseline within a 480-hour workstream. The accepted programme inventory determines the actual working case; planning allowances are not imported as customer data or application limits.

### Keep each system's responsibility explicit

The issued IDA design separates these responsibilities. Use the actual partner-approved native contract and writer for each target population.

| System or population | What staff prepare and compare here | Where the operational decision belongs |
|---|---|---|
| Salesforce PMS | Property hierarchy, process states, relationships and selected configuration | The agreed Salesforce implementation and client process owners |
| Docusign CLM | Document identity, every agreed version, PMS association and returned signature/status references | The controlled CLM document and signature workflow |
| Centros | Financial identity, currency, exact amount, counterparty, mirror data and each billing-request outcome | Centros remains the financial authority |
| ArcGIS | Feature/reference identity, declared coordinate reference system, units and agreed synchronized attributes | ArcGIS retains spatial and sizing edits |
| Development projects and KPN | Capital-project identifiers and their property associations | The reviewed project model, separately from the property hierarchy |
| Lease Agreement and Rental Space | Lease identity, rental-space relationship, declared state and effective intervals | Client policy and the approved PMS writer; at most one LIVE/ACTIVE lease may apply to a rental space at a time |
| Talend, when selected | The agreed interface and returned integration outcomes | The approved middleware configuration and the original system owners |

These are the published design boundaries in RTP sections 4.1.2 and 4.3. They do not supply actual tenant object names, API entities, credentials or import formats. Attach the selected field contract when those details are agreed.

## 2. Receive the actual source editions

Import the original CSV, JSON or JSONL file using the declared format and parsing settings. Preserve the original bytes. Select the population, source system, extraction time, cutoff, scope and custodian that describe this file. Retain its original export or extraction reference when one is available.

Review the intake before building a mapping. Confirm the observed headings or object fields, the complete row count and the selected key fields. Inspect rows whose values require interpretation: missing fields, explicit nulls, empty text, leading zeros, repeated rows, decimal amounts and timestamps.

Treat identifiers as identifiers. A property number such as a code with leading zeros should not become a number merely because its characters are digits. Keep legal names and display names separate. Record the original date/time precision and the declared timezone instead of filling in an assumed offset.

A source correction arrives as another source edition. Keep the earlier file and its associated findings. This lets a reviewer distinguish a repaired source value from a changed mapping rule.

### Inventory documents as well as records

A document reference in a property export does not establish that the original controlled file and its versions arrived. Keep the agreed document inventory, original file/version identifiers, sizes or other supplied integrity information, source location and actual PMS associations with the same programme. Document rows compare declared version identifiers, hash metadata and byte sizes. Verifying a large controlled document estate requires the actual CLM acquisition and retained binary comparison results; a matching metadata row alone establishes the metadata comparison.

Record absent, superseded, withdrawn and inaccessible versions distinctly. Retain signature/status references from the actual CLM return. A filename alone is not a document identity or a signature result.

### Preserve snapshot and change-feed meaning

Use a complete snapshot to compare a complete agreed population. A selected extract describes only its declared selection. A change feed requires its own start/end cutoff and change semantics, including how deletions and withdrawals are represented.

If a source does not supply deletions, record the agreed absence rule before treating a missing row as a deletion. Preserve the excluded or unresolved population so later work can account for it.

## 3. Define and review the mapping

Create a mapping edition for one declared source population and its intended target return. Select the complete source and target key, including every component of a composite key. Keep platform and population identity with the key; a lease identifier and a project identifier can have the same characters without naming the same record.

For every compared field, select the source field, target field and explicit interpretation. Use exact decimal comparisons for money and compare currency separately. Select the intended comparison for dates, timestamps, booleans, text and identifiers. Record required fields and relationships that must be present.

Review the mapping against the complete observed headers or JSON field paths. Resolve renamed or missing fields explicitly. Review any transformation and the handling of null, empty and absent values before using it in a rehearsal.

### Relationships and business rules

Check parent/child relationships across the accepted population: property hierarchy, rental-space links, project-to-property links, document associations and financial references. Do not merge records by a similar label, address or nearby geometry.

Keep KPN capital-project identity separate from the Holding/Land Bank/Park/Building/Unit/Rental Space hierarchy. A correct building label does not establish that its capital project survived.

For leases, select the actual state field. This programme checks the exact states LIVE and ACTIVE; preserve other original state text and review the upstream translation contract when a source uses different labels. Retain commencement and end values with their precision and boundary convention. At the reviewed cutoff, and over any agreed effective interval, investigate overlapping LIVE/ACTIVE leases for the same rental space. A termination followed by a renewal must be evaluated under the agreed end/start boundary, not by an assumed date rule. Missing or ambiguous time information remains a blocking finding until a later source or mapping edition resolves it.

For finance, compare each original identity, amount, currency and counterparty. Keep billing-request acknowledgments, uncertain requests, rejected requests and confirmed downstream outcomes separate. Offsetting differences in a total do not resolve the underlying line errors.

For spatial references, compare the supplied feature identities and declared units. If an actual coordinate transformation is required, use the approved transformation outside this comparison and retain its returned output and method as source. Staff should not equate coordinates from different reference systems by numeric similarity.

Record the mapping review with the actual reviewer and supporting decision. A changed rule creates a new edition. Existing reconciliation results continue to refer to their original mapping.

## 4. Prepare the supported load and receive the target return

Use the partner's agreed native import contract to prepare the accepted population. Keep the selected source and mapping editions with the prepared load. Record the original load/import operation, its batches and the outcomes returned by the platform writer.

The application provides the continuity case and reconciliation. The authorized platform operator performs the actual target import, document action, finance request or spatial update through that platform's supported workflow. Retain those returned results with the original operation.

If an operation's reply is lost, locate that same operation and its target outcome before deciding whether to repeat it. This matters particularly for billing requests and controlled document versions, where a second submission can create another business object.

Acquire the target return separately after the intended load has completed. Record its actual system, extraction time, scope, custodian and original import or publication reference. Import that file as a target edition.

The target return must represent the population actually read from the target. An outgoing load file does not become a target return because it is renamed. Independently acquired files may legitimately contain identical bytes; their acquisition and operating context establish what they represent.

Check that the target scope and cutoff are comparable to the selected source. A partial target extract should remain visibly partial. Retain its actual returned errors and excluded rows alongside the complete expected population.

## 5. Reconcile the whole population

Select the exact source edition, reviewed mapping and independently acquired target edition, then run reconciliation. Read the population totals before investigating individual findings.

| Result | Staff interpretation |
|---|---|
| Matched | The selected comparison rules found the expected identity and agreed field values |
| Missing | An expected identity or relationship was absent from the observed target population |
| Extra | The target contained an identity outside the selected expected population |
| Duplicate or ambiguous | The selected key did not identify one unambiguous record |
| Field or type conflict | A mapped value, type, required field or semantic rule differed |
| Unverified or unresolved | The supplied scope, data or interpretation was insufficient to decide the comparison |

Keep these populations distinct. An attractive match percentage cannot replace investigation of a missing document version, a second active lease, an incorrect currency or a duplicate billing request.

Open each finding from its retained source and target rows. Inspect the exact key components, field values, selected rule and source references. Record the responsible operator, proposed correction and reason in the decision and its notes. Use the accepted mapping and original returned evidence when deciding whether the source, transformation, target import or comparison rule requires change.

Reviewable missing, extra and field-difference exceptions may be accepted with the actual authority, explanation and retained evidence. Coverage, identity, invalid types, hierarchy and overlapping active-lease findings require a correction and a later reconciliation. If a reviewable exception is accepted, record the actual authority and explanation. The original discrepancy remains visible with that decision. Accepted exceptions must remain part of the rehearsal and cutover review rather than disappearing from a later report.

Export or retain the report for the selected run. A later reconciliation produces another result against its own source/mapping/target editions; it does not revise the earlier result's meaning.

## 6. Complete the two rehearsals

### Rehearsal one

Use the accepted first source edition and reviewed mapping. Prepare and perform the supported load through the nominated writer. Receive the complete independent target return, reconcile the full population and record the actual findings and user decisions.

Review ordinary business journeys and the relevant exceptions with the nominated users: property relationships, lease states, correct visible document versions, financial mirrors, project links and recoverable failed actions. Retain the actual outcomes from the appropriate environment and workflow.

Accept the first rehearsal only with its exact retained editions, target return, findings and decisions. The acceptance records who reviewed that outcome and what remained open.

### Corrections and rehearsal two

Receive the later source edition and keep its cutoff. Include the actual changes selected for the programme, such as new records, corrected relationships, terminated or renewed leases, changed document versions, withdrawals and supported deletions.

Bind corrections to the original findings and their evidence. Review the revised mapping when a rule changes. Repeat the supported load and obtain another independent target return. Run the complete reconciliation again.

Compare the first and second rehearsal outcomes using their retained references. Confirm that the intended corrections took effect and that later changes have not introduced missing relationships or duplicated objects. The later source and mapping must be visible in the second rehearsal's record.

Record acceptance of the second rehearsal against its actual outcome. Keep outstanding exceptions and their disposition available to the cutover review.

## 7. Prepare and record cutover

Agree the cutoff and operational owner for every population. Record writes that can continue during the window, how their deltas will be captured and how those changes will reach the destination. Include the original import operation and intended final target extraction in the cutover plan.

Record the selected rehearsal results, source and mapping editions, operational responsibilities, change window, communications, exception disposition and recovery procedure. Distinguish actions that can be reversed from actions that require a compensating or forward correction. Controlled documents and financial requests may have different recovery procedures from ordinary record imports.

The authorized parties make the actual go/no-go decision. Record that decision, time, authority and supporting evidence in the case. A decision entered in the application does not itself operate the external platforms.

During the window, retain the actual returned outcomes and each complete delta. Obtain the final independent target return and reconcile it against the agreed expected population. Keep any new discrepancy attached to its source, intended change, target return and selected rule.

Use the agreed recovery procedure if the actual outcome requires it. Record the action taken and its returned result. Preserve the earlier go/no-go, rehearsal and reconciliation records as history.

Record rejected or incomplete cutover outcomes with the actual failure, returned load evidence and recovery action. If no final target reconciliation exists, retain that absence and the original attempt details. A rejected outcome can be recorded after the change window. Acceptance requires the authorized window, exact rehearsed mappings, complete independent target return and current resolution of the findings.

Final acceptance identifies the precise accepted outcome, remaining exceptions and the actual authority. Handover then carries that same complete case.

## 8. Hand over a working, editable case

Export the selected complete case with its original permitted files, mapping/rule history, source and target editions, reconciliation results, decisions, rehearsal/cutover records and operating guide. Include the required application source and dependencies for the receiving route.

Keep credentials in the agreed credential system. The recipient needs the authorized source and target access appropriate to its own environment, separately from the portable case.

Receive the package in an independent workspace. Open an original discrepancy and its source/target records. Confirm the selected mapping and the first returned result. Record a permitted follow-up decision or correction, produce a later report, and reopen that later edition.

Record the receiving outcome with the actual recipient, package and workspace reference. Preserve both the delivered case and the recipient's subsequent changes. The recipient should be able to find the original facts and continue the work without reconstructing decisions from email.

## 9. Continue after interruption or a later source change

Reopen the same working case. Let the application resolve any pending saved request before creating another command for the same action. Read the displayed saved result and current edition.

Keep later edits as later editions. When another staff member has changed the case, reload its current revision and compare the intended change with what is now saved. Avoid replacing the earlier result merely to make the screen look current.

An interrupted platform action is reconciled through its original platform operator and returned operation reference. An interrupted local comparison or case save continues from its retained local request. These are different events and each should retain its own outcome.

When a new source or target return arrives, import a later edition and select it explicitly for another reconciliation. Keep the previous report available so staff can explain what changed.

## 10. Working-cohort capacity and complete source handling

The portable application accepts 64 MiB per original file, 256 MiB of distinct retained blobs, 25,000 records per dataset, 100,000 combined source and target records per reconciliation, and 32 population pairs. The complete comparison report is limited to 64 MiB and the current structured state to 8 MiB. The shared store also limits cumulative history and the final archive.

Choose a complete declared cohort that fits those limits and includes all required property, rental-space, lease and other related records. Account explicitly for populations outside that cohort. The reader returns a capacity error if the complete file or result exceeds its allowance; it never silently trims records.

The planning offer's controlled-document allowance belongs to the agreed programme estate. Keep that estate in its approved document system and bring the complete selected version inventory and actual verification results into this case. The local archive does not provide a 100 GB document repository.

CSV preserves its original text values. Select an explicit nonempty null token only when the source export actually defines it. Empty text remains empty text. Exact decimals use ordinary decimal strings without exponent notation; currency is compared separately. DATETIME fields require a date, time and UTC offset. BOOLEAN fields require actual JSON booleans, so a CSV containing textual true/false needs a reviewed conversion outside the comparison and a retained original source.

## 11. Command-line operation and receiving

Run commands from the complete source directory. The command-line route and browser use the same saved case, original request identities and history. Read the current revision before submitting a new command:

```bash
python -m bluewave.cli show --workspace ../property-case
python -m bluewave.cli history --workspace ../property-case --offset 0 --limit 100
```

A command file contains the exact envelope `requestId`, `kind`, `actor`, `at` and `body`. Use `actor.id` and `actor.name` for the actual operator. `CONTINUITY_DOMAIN.md` describes the domain fields and relationships; the browser forms also produce these complete commands. Set the expected revision to the revision you actually reviewed:

```bash
python -m bluewave.cli command --workspace ../property-case --command reviewed-command.json --expected-revision 12
python -m bluewave.cli request --workspace ../property-case --id ORIGINAL_REQUEST_UUID
```

For original source intake, the body file describes its population and actual extraction. The importer calculates the original file descriptor, retains the bytes and records one source-import command. Retain the chosen request UUID and repeat that exact operation after an uncertain reply:

```bash
python -m bluewave.cli import-source --workspace ../property-case --body source-body.json --file original-export.csv --actor-id ACTUAL_OPERATOR_ID --actor-name "Actual operator" --request-id ORIGINAL_REQUEST_UUID --at ACTUAL_ISO_TIME --expected-revision 12
```

Use the original reconciliation UUID to export the complete comparison. Supported formats are `html`, `json` and `csv`. Select a new output path for a later edition:

```bash
python -m bluewave.cli report --workspace ../property-case --id RECONCILIATION_UUID --format html --output ../review-report.html
```

Export a selected saved revision with one retained publication UUID. The command returns the archive path, byte count and SHA-256. Use those actual returned values for independent receiving:

```bash
python -m bluewave.cli export --workspace ../property-case --publication-id ORIGINAL_PUBLICATION_UUID --revision 12 --source-root . --selection source-selection.json
python -m bluewave.cli inspect --archive COMPLETE_ARCHIVE.zip --sha256 ACTUAL_ARCHIVE_SHA256 --bytes ACTUAL_ARCHIVE_BYTES
python -m bluewave.cli receive --archive COMPLETE_ARCHIVE.zip --destination ../independent-receiving-case --operation-id ORIGINAL_RECEIVING_UUID --sha256 ACTUAL_ARCHIVE_SHA256 --bytes ACTUAL_ARCHIVE_BYTES
```

Use a separate receiving directory. Repeat the same original receiving UUID and archive identity after interruption. The archive contains the selected saved revision, earlier commands and first results, original retained blobs and complete application source. Once receiving completes, serve the returned workspace path and use the included source directory shown by its receiving result. Open an original report, make a permitted later correction, export a new edition and record the actual handover result.

Numbers, UUIDs and filenames in these command examples are placeholders for operating the interface. Use the actual saved case and returned values for programme work.

## Source basis

The platform responsibilities and property model are drawn from the issued [IDA Ireland Request to Participate, IDAPMS082026](https://www.etenders.gov.ie/epps/cft/downloadContractDocument.do?documentId=8912599&resourceId=8912550), particularly section 4.1.2 on page 15 and section 4.3 on pages 18–19. Section4.1.5 on page 17 describes the anticipated implementation period. The original qualification deadline is on page 1; this application prepares an implementation workstream for an authorized partner programme.

The [complete Bluewave partner workshare](https://app.notion.com/p/3f8dd7723100818b98a5dbc6637714b1) retains the six delivery stages, two rehearsals, baseline scope, proposed effort and original relationship owner. Project-specific field contracts, population decisions and actual operator outcomes belong in the saved case.
