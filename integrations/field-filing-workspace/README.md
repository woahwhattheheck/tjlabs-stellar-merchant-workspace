# Field Filing Workbench

A complete offline operating study of one declared crew/truck day and its retained field-to-filing history. Sixteen original source tables bind original and revised jobs, accepted arrival windows, physical work, immutable field records, versioned forms, exact artifact identities, signature observations, filing attempts and separate invoice/payment allocations.

Open **Field_Filing_Workbench.html** or **Field_Filing_Worked_Example.html** directly. The authored example contains five complete source editions: before synchronization, the original received record, an observed acceptance, a later rejection and delayed callbacks. An older accepted response or late delivery callback cannot erase the newer rejection. Full source and all earlier forms remain available.

- [Browser operation, saved work and rendered receiving](WORKBENCH.md)
- [Complete domain model and filing semantics](FIELD_FILING_GUIDE.md)
- [Exact sixteen-table source/API contract](INTAKE_CONTRACT.json)
- [Native continuation and retained input recovery](NATIVE_WORKFLOW.md)

## Operate the complete source

Use the source editor to retain all sixteen originals. Select the source edition and as-of instant; inspect arrival, planned/observed resource overlaps, the full field/form/signature/filing chain and independently allocated money. Record a review against its exact source subject and edition. Review corrections retain every earlier decision.

The desk retains unfinished names, dates, original CSV text, malformed file byte receipts and review drafts in complete JSON or working HTML. Browser saves compare the accepted head atomically and retain competing proposals. Saved-copy adoption first preserves the complete current draft. Native continuation retains the entire browser session, original command bytes and source receipts in a new output directory.

Regenerate the applications from complete source:

~~~sh
node build.mjs NEW_DIRECTORY
~~~

Continue an actual exported desk through the native command:

~~~sh
node field-filing-native.mjs --workspace complete-desk.json --command command.json --out NEW_DIRECTORY
~~~

The resulting workspace.json retains the selected edition and all unfinished forms. Select an appended source edition explicitly after reopening. NATIVE_WORKFLOW.md contains full receive/review command examples and explains rejected inputs.

## Read the original operating record correctly

Captured, created, submitted and observed times remain separate. An offline form becomes visible to the office at its observed time. A corrected field record creates a distinct source version; old forms, signatures and filing responses remain bound to their exact originals. Source-defined role requirements remain distinct from a conclusion about legal sufficiency. Form digests identify supplied artifacts; they do not verify an unseen external document.

Transport delivery, acknowledgement and agency decisions have independent event identities. The latest known explicit decision is ordered by occurrence time among observed events. All callbacks and contradictory source outcomes remain visible.

Amounts are exact integer minor units with separate currencies. Invoice settlement, unapplied job credit, refunds and explicit allocations remain separate. Postponed jobs keep their balances. Declared availability and buffers govern resource comparisons; original booking and financial systems remain the authorities.

## Continue the existing receiving course

~~~sh
node receiving/run-source-course.mjs NEW_DIRECTORY
node receiving/run-controller-course.mjs NEW_DIRECTORY
node receiving/run-field-native.mjs --out NEW_DIRECTORY
~~~

The retained source course contains 21 meaningful paths across five source editions. The actual controller/model course covers 22 original-file, review and recovery paths with explicit DOM/storage/file adapters. The native production course covers 23 source, review, delayed-callback and complete-wrapper continuation paths using explicit filesystem adapters, retaining its actual outputs and 1,038 manifest entries. These results describe those source executions.

The complete rendered receiving chapter in WORKBENCH.md opens both exact applications at desktop and narrow width, uses the source/editor/review controls, views screenshots, opens downloads and carries a full exported wrapper through native continuation and back into the desk. Keep that operation and its returned files with the existing receiving owner.

The package uses built-in browser and Node functionality. All example properties, quantities, source records and artifact bodies are authored teaching data.
