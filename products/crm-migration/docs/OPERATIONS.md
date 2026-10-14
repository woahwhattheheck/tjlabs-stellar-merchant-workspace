# Workspace operation contract
Each operation has:
```json
{"id":"unique-operation-id","actor":"Named operator","at":"2026-10-14T22:30:00Z","expected_revision":0,"kind":"ingest","payload":{"id":"source-contacts-r1","filename":"contacts.csv","content":"legacy_id,email\r\nC1,example@example.test\r\n","role":"source","edition":"r1","origin":"Authored example","delimiter":","}}
```
The operation ID is immutable. Repeating the identical complete request returns the current workspace unchanged; reusing an ID with altered content fails. The expected revision protects new mutations.

Kinds:
- ingest: original CSV and its source metadata. A new immutable source ID is required.
- configure: {id,title,contract}; the full contract selects retained source IDs. Every table must exist.
- compare: {id,title,contract_id}; creates a new immutable output with exact input and configuration identities.
- review: {run_id,finding_id,disposition,reason}; disposition is needs_correction, accepted_exception or not_applicable. It records actor/time and previous reviews remain retained.
- decide: {run_id,status,reason}; status is ready, accepted_with_exceptions or needs_correction. Ready requires zero findings; exceptions require a reasoned exception disposition on every finding. A decision closes that rehearsal. New inputs or changed business rules require a new configuration/run.

examples/receiving-course.workspace.json includes all 40 complete operation requests and results. Every archive restore reconstructs the workspace from those original operations and compares the full reconstructed identity.
