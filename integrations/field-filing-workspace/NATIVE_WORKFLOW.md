# Field Filing Workbench — complete native continuation

This guide runs the same retained-source study used by the offline desk. It receives original exports, compares the selected source edition, records source-bound review notes and creates a new complete output directory. The command does not dispatch a crew, operate equipment, sign a document, submit a filing, send a customer message or collect money.

## What the package preserves

A complete desk file has schema `tjlabs.field-filing-desk.v1`. It contains the authoritative core workspace, its complete session, every unfinished source/review field, original imported-byte receipts and any native continuation. The native runner accepts this full wrapper or a core-only `tjlabs.field-filing-study.v1` file.

When input is a desk wrapper, the new `workspace.json` remains a desk wrapper. Its accepted core is replaced only by the command's accepted successor. The session remains exact, including selected edition, unfinished timestamps, source text, review reasons and blank names. The separately emitted `core-workspace.json` is useful for integrations that intentionally need only accepted study data. The exact input bytes remain in `original-input-workspace.json`.

The latest native attempt retains the exact command bytes, parsed command when readable, complete received file bytes, accepted/rejected result and previous native continuation. An unreadable source or command remains available for repair. Rejection leaves the prior accepted core and unfinished browser session intact.

## Start from the actual desk

1. Open the standalone workbench and export the complete working copy.
2. Keep that original file in the local operation directory. It may contain private job, customer, property, field and payment information; use the operator's existing private storage.
3. Choose a fresh output directory for each command. The runner refuses to replace an existing directory.
4. Run the command using the maintained package's Node entry point.
5. Open the newly generated `workspace.json` in the same desk to continue.

A report-only continuation is:

```sh
node field-filing-native.mjs --workspace /absolute/study/desk.json --out /absolute/study/report-001
```

Create a new empty study:

```sh
node field-filing-native.mjs --new-id field-study-001 --label "Selected source comparison" --out /absolute/study/new-study
```

Use absolute paths for the workspace and output. A command's source file paths resolve relative to that command file, so the original files can remain beside it.

## The sixteen source families

The maintained `FIELD_FILING_INTAKE_CONTRACT.json` and `core.columns` define the actual columns. The desk and runner use the same core. These are independent comparison inputs, not a claim that any vendor has an identical import format.

| Source | Role in the comparison |
|---|---|
| resources | Original crew/truck identities and kind |
| availability | Declared available/unavailable windows with offsets |
| booking_revisions | Full job revision, exact customer/system/location, resources, promise, currency and authorization |
| quoted_lines | Quote lines bound to the original booking revision |
| completions | Independently recorded actual performed-work state and timing |
| invoice_lines | Original issued invoice lines and job attribution |
| payments | Actual receipts/refunds, method, currency and parent references |
| allocations | Explicit authorized payment-to-job/invoice allocations |
| systems | Original customer/property/parcel/jurisdiction/system and source identity |
| arrival_promises | Exact accepted arrival window and authorization |
| field_versions | Captured and observed field version, predecessor, original JSON and separate notes |
| form_templates | Exact form/jurisdiction/version, original document reference and declared roles |
| form_instances | Artifact bound to exact field/template version, creation and observation |
| signatures | Original signature identity, role, signer and recorded state |
| filing_attempts | Exact artifact submission, destination, channel and authorization |
| filing_events | Independently observed delivery, acknowledgment, acceptance, rejection or withdrawal |

Provide all sixteen source families for a received edition. If a family has no actual records in the selected study, retain its explicit header-only CSV. Missing files are not silently treated as empty. The source files retain their original bytes and strict UTF-8 text; an original BOM and CRLF are preserved. Invalid UTF-8 remains in received byte files and the rejected attempt instead of being replaced by repaired text.

The source record owner chooses explicit timestamp offsets. The study's `dayStart`, `dayEnd` and `asOf` are supplied in the receive input. Physical capture, form creation and later observation/synchronization are separate instants. A form created offline should not appear in a historical comparison before its recorded observation.

## Receive an edition

The package contains `examples/native-receive.command.json` with all sixteen source-file entries. Copy it and replace its metadata and source paths with the selected originals. Keep the original files untouched.

The command shape is:

```json
{
  "action": "receive",
  "input": {
    "id": "source-edition-002",
    "label": "Office-approved original exports",
    "receivedAt": "2026-10-15T12:00:00-04:00",
    "settings": {
      "dayStart": "2026-10-15T00:00:00-04:00",
      "dayEnd": "2026-10-16T00:00:00-04:00",
      "asOf": "2026-10-15T12:00:00-04:00"
    },
    "notes": "Record the actual origin and preparation of these exports."
  },
  "sourceFiles": {
    "resources": {"path": "resources.csv", "name": "resources.csv"},
    "availability": {"path": "availability.csv", "name": "availability.csv"},
    "booking_revisions": {"path": "booking_revisions.csv", "name": "booking_revisions.csv"},
    "quoted_lines": {"path": "quoted_lines.csv", "name": "quoted_lines.csv"},
    "completions": {"path": "completions.csv", "name": "completions.csv"},
    "invoice_lines": {"path": "invoice_lines.csv", "name": "invoice_lines.csv"},
    "payments": {"path": "payments.csv", "name": "payments.csv"},
    "allocations": {"path": "allocations.csv", "name": "allocations.csv"},
    "systems": {"path": "systems.csv", "name": "systems.csv"},
    "arrival_promises": {"path": "arrival_promises.csv", "name": "arrival_promises.csv"},
    "field_versions": {"path": "field_versions.csv", "name": "field_versions.csv"},
    "form_templates": {"path": "form_templates.csv", "name": "form_templates.csv"},
    "form_instances": {"path": "form_instances.csv", "name": "form_instances.csv"},
    "signatures": {"path": "signatures.csv", "name": "signatures.csv"},
    "filing_attempts": {"path": "filing_attempts.csv", "name": "filing_attempts.csv"},
    "filing_events": {"path": "filing_events.csv", "name": "filing_events.csv"}
  }
}
```

The example dates above demonstrate explicit offsets. They are not operator observations. Use the actual selected source window.

```sh
node field-filing-native.mjs --workspace /absolute/study/desk.json --command /absolute/study/receive.json --out /absolute/study/receive-002
```

The native runner appends a new accepted edition. It deliberately preserves the browser's previous selected edition and unfinished draft. After reopening, choose the newly appended edition to inspect its comparison. Old review drafts remain bound to the old edition; the runner does not relabel them as comments on the new sources.

## Read the job chain

Follow the original system and job identities into the accepted arrival promise, booking revisions, actual completion and field records. A final field record is its source disposition, not independent proof of completed work.

Compare each form instance with its exact field and template versions. A later field correction does not rewrite the previously signed or submitted artifact. The original document hash identifies the source artifact; it does not establish that the document is legally valid.

Read signature events at their observation time. The source-declared role list is the comparison basis. An empty role list means requirements are unspecified. A recorded signature, decline or revocation is preserved as a source event.

Read each actual filing attempt and its events separately. A submitted email is not an acknowledgment. Delivery is not acceptance. An accepted or rejected event needs its actual receipt reference. Transport, acknowledgment and agency decision are displayed independently. A late transport observation cannot erase an agency rejection; a later-observed but earlier-occurring agency decision does not replace a newer decision. All such original events remain retained. Multiple attempts and contradictory later outcomes remain visible for review rather than being replaced by a convenient final label.

Invoice issuance and payment follow their own records. Keep explicit currencies and integer minor amounts. A sent payment link is not a receipt; an unallocated receipt does not settle a particular job. The review does not invent a balancing entry or convert currencies.

## Review an exact source subject

Use an actual subject type and ID from the current analysis or the desk's subject selector. New field/form analysis rows expose a stable `key`. Retain the exact edition and previous review identity when correcting a review.

```json
{
  "action": "review",
  "input": {
    "id": "review-002",
    "editionId": "source-edition-002",
    "subjectType": "formInstance",
    "subjectId": "REPLACE_WITH_ACTUAL_ANALYSIS_KEY",
    "disposition": "investigate",
    "reviewer": "Actual reviewer",
    "reason": "Describe the exact source difference.",
    "evidence": "Reference the original artifact or receipt.",
    "previousReviewId": null
  }
}
```

The placeholder is intentional in this explanatory example. The supplied authored review command uses a real subject from the package's worked example. A review correction must reference the actual prior review ID. Keep external evidence private and accessible to the authorized operator.

```sh
node field-filing-native.mjs --workspace /absolute/study/receive-002/workspace.json --command /absolute/study/review.json --out /absolute/study/review-002
```

Review history records what the reviewer concluded about the exact source edition. It does not change the source quantity, promised visit, field record, signature, filing outcome, invoice or receipt. Correct the original data by receiving a new complete source edition.

## Read the output

Each newly created directory contains the complete current workspace and separate core, original input/command when supplied, attempt result, received source bytes and all accepted source editions. A nonempty study also includes current analysis, a complete HTML report and sixteen derived comparison CSVs:

`bookings`, `resources`, `conflicts`, `invoices`, `payments`, `allocations`, `attention`, `revisions`, `systems`, `arrivalPromises`, `fieldRecords`, `formTemplates`, `formInstances`, `signatures`, `filingAttempts`, `filingEvents`.

Original input CSVs remain exact. Derived CSVs are comparison outputs, not authoritative source replacements. The manifest lists every emitted member's byte length and SHA-256; the manifest itself is not included in its own list.

A rejected command produces an attempt with `state: "rejected"` and exit code1. Read its error and retained original command before editing a new command. The current wrapper still contains the last accepted study and the rejected continuation. Do not overwrite the rejected package to hide the source that caused the problem.

An existing output directory is refused. If a write is interrupted, retain the partial directory and repeat into a new named directory. The runner's create-only behavior protects prior work; it is not an atomic whole-directory publication.

## Complete authored receiving course

Run the maintained actual course:

```sh
node receiving/run-field-native.mjs --out /absolute/receiving/new-field-course
```

It uses the production core, CLI and browser workspace model. The supplied worked desk and records are authored examples. The course deliberately carries an unfinished timestamp, raw source edit, review reason, blank name and unreadable original receipt through accepted and rejected native continuation.

The same course receives all sixteen original files, preserves BOM/CRLF, records exact field/form/filing reviews, retains source editions unchanged, rejects malformed source and command bytes, reopens the full current output in the browser model, checks report-only continuation and refuses an existing output directory. It also receives delayed transport and older agency observations as a new complete source edition, confirms the actual later rejection remains, and verifies every emitted original/report/export against its manifest.

A V8 execution with explicit file/path ports verifies those production code paths. The Node runner is retained for the equipped local continuation. Rendered browser receiving uses the existing original caller-owned page/course from WORKBENCH.md; it is distinct from source/model execution. Continue the same operation and retain the resulting screenshots/downloads alongside its actual source identities.
