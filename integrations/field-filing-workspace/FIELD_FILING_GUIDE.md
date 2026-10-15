# Field Filing Workbench — domain model

The operating model receives sixteen exact source tables and compares the accepted arrival promise, actual physical work, immutable field versions, exact form/template instances, signature observations, filing history and separate money records. Start with the authored example, then import authorized original exports through the complete operating desk. WORKBENCH.md covers the browser journey and NATIVE_WORKFLOW.md covers native continuation.

## The worked case

JOB-A moves from 09:00 to 10:30 while its accepted 09:00–10:00 arrival promise remains. Actual arrival is 10:40. The first field record was captured at 11:40 and observed at 12:30; the original form was created at 11:45 and observed at 12:35. Technician and owner signatures arrive by 12:41.

A correction is observed at 13:10 and produces its own form. The earlier form and digest remain unchanged. The owner revokes the earlier signature at 13:25. The original filing retains delivered, acknowledged, accepted and later rejected events alongside a separate repeated attempt. The corrected form still needs the owner role. JOB-B retains a draft field body and a template whose requirements are unspecified. JOB-C is postponed with its deposit still allocated to that job.

The 45,000-minor-unit invoice has 10,000 applied, leaving 35,000. The 7,500 deposit on the postponed job remains unapplied to an invoice. Form acceptance, work completion and payment do not change one another.

Five immutable editions show the office-known state before synchronization, after the original record arrived, after the acceptance observation at the current as-of instant and after delayed callback observations. Select each complete edition explicitly to inspect its source basis.

## Receiving actual records

All timestamps include a date, seconds and UTC offset. Captured, created and submitted times are separate from observed times. The selected as-of instant controls visibility; original future records remain in the complete source. Source-defined system/customer/property/jurisdiction identities bind each job.

Field versions require one complete ordered predecessor chain. Templates carry exact jurisdiction/version and source-declared role requirements. Empty requirements remain unspecified. Artifact SHA-256 values are source-reported identifiers; a digest does not verify an unseen external PDF. The three authored artifact bodies in example/artifacts match their sample digests.

Review exact subjects with reviewer, reason, evidence and original edition identity. Every review correction retains its predecessor. Each added analysis row exposes key; analysisTables and reviewTypes are exported by the factory. Derived CSV exports neutralize spreadsheet formula strings.

The full internal report and workspace include internal field notes and complete original sources. Choose an appropriate audience when exporting.

## Implementation and complete operating source

field-filing-core.mjs exports createFieldFilingCore({codec}); the matching classic field-filing-core.js body is embedded in the offline desk. The vendor archive codec supplies strict UTF-8, SHA-256 and archive encoding. Core methods are create, receive, analyse, review, reopen, csv, report, hash, canonical and parseCSV.

The exact intake is INTAKE_CONTRACT.json (also retained under its original FIELD_FILING_INTAKE_CONTRACT.json name). The original field-filing-course.js and executable .mjs version operate the complete model across five retained source/as-of editions, review/export/reopen and a rejected broken predecessor. The complete browser and native workspace additionally retain unfinished forms and exact original-byte receipts.

Source identifiers, values, jurisdiction and role requirements in the worked example are authored teaching data. Replace them with actual original records and applicable original forms for an agreed operation.

## Delayed filing observations

The current filing decision is selected from explicit accepted/rejected/withdrawn events by occurrence time among events observed at the chosen as-of instant. Delivery transport and acknowledgement remain separate. A delayed delivery notification or an older acceptance arriving later does not erase a newer rejection. lastObservedEventId retains the last received source observation; decisionEventId, acknowledgementEventId and transportEventId identify the separate records. The five-edition operating course includes this delayed-callback continuation.
