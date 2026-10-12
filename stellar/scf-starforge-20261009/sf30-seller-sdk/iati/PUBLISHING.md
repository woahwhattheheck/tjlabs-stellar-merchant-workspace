# IATI participant publishing and receiving

This application keeps a publisher's complete IATI activity XML, an explicitly selected activity cohort, original assessment feedback, evidence, correction decisions and release history in the existing IATI workspace. It gives the publisher a complete reviewed XML edition and a portable receiving package.

It is intended for the implementation work that follows an assessment or an internal publishing review. Publish What You Fund (PWYF) retains its assessment, sampling, scoring, accreditation and participant programme. A release in this application means **ready for the publisher's existing publication process**. It is not a registry update, an accepted PWYF score, or an accreditation decision.

## Source and methodology editions

The installed planning reference is the PWYF 2026 technical paper updated 3 June 2026, with all 35 indicator identities retained in publishing-methodology.json. The 2027 intake / 2028 Index information pack says that the 2028 methodology is scheduled for October 2027. Do not label the current 2026 reference as the final 2028 methodology.

The programme pack describes an initial feedback round followed by an improvement period and says that participants needing technical assistance to publish or amend their data can be referred to suitable experts. This workspace supports that implementation and receiving work. A participant project keeps the exact installed reference in its own immutable history; installing a later application does not silently relabel that history.

Primary sources:

- [2028 information pack](https://www.publishwhatyoufund.org/download/aid-transparency-index-2028-information-pack/), especially pages 3–5 and 7–10.
- [2026 technical paper](https://www.publishwhatyoufund.org/download/2026-aid-transparency-index-technical-paper/), especially the methodology, manual review and indicator tables.
- [IATI 2.03 activity schema](https://github.com/IATI/IATI-Schemas/tree/b4ead00528d3785b336d9847928274c207704deb).
- [IATI Standard licence](https://github.com/IATI/IATI-Guidance/blob/main/en/license.rst), also retained unchanged with the schema.

PUBLISHING_SOURCES.md gives the original release, licence and reference-publisher details. The application is usable with a publisher-selected complete XML file; it does not require a new external acquisition.

## Runtime and installation

Use the maintained merchant workspace's original IATI application and installer. Its selected source must contain the entire iati/ component, the original XML/source and dataset engine, and the participant files named by managed.py and application-iati.mjs.

Python 3.11 or newer runs the existing workspace. The selected Python environment needs lxml to validate the original XSD. If lxml is unavailable, the application retains an explicit UNAVAILABLE validation result and does not allow an accepted release. It does not report an unrun validation as valid.

The source validation observed during development used Python 3.12.14, lxml 6.1.1 and libxml2 2.14.6. Those are observed development versions, not a claim that every receiving host has them. The actual validation record retains its engine versions.

For the direct original command, with SDK pointing to stellar/scf-starforge-20261009/sf30-seller-sdk:

```sh
python3 "$SDK/iati/cli.py" --workspace "$PRIVATE_WORKSPACE" init
python3 "$SDK/iati/cli.py" --workspace "$PRIVATE_WORKSPACE" source --file "$ORIGINAL_XML" --label "Publisher supplied complete edition"
python3 "$SDK/iati/cli.py" --workspace "$PRIVATE_WORKSPACE" serve
```

Use the private URL returned by the original server. The installed Applications route uses the same CLI/server, source binding and database. The existing Node wrapper and typed IatiWorkspaceClient expose the same operations. No second application database or parallel participant controller is required.

Keep the workspace directory private. The original workspace owns its SQLite database, complete sources, plans, builds, comparisons and participant assets. A full workspace backup includes the entire directory while its original process is closed. The release ZIP is an independent portable project transfer; it is not a substitute for a complete working-directory backup.

## A complete operator workflow

### 1. Select the real source and cohort

Import the entire original activity XML. The application retains its exact SHA256, byte count and full source, including activities outside the chosen cohort.

Create participant work with the exact reporting-organisation reference, explicit original activity IDs, a named operator and a cutoff date. An empty activity selection means all activities for that reporting organisation in the selected source; inspect the resulting cohort before proceeding.

Example request shape, with real values substituted from original source inventory:

```json
{
  "requestId": "participant-intake-20261012-001",
  "actor": "Named publishing operator",
  "name": "Agreed participant cohort",
  "publisherRef": "ORIGINAL-REPORTING-ORG-REF",
  "sourceId": "64-character-original-source-sha256",
  "activityIds": ["ORIGINAL-IATI-ACTIVITY-ID"],
  "cutoff": "2026-10-12",
  "notes": "Source provenance, selection rationale and agreed implementation scope."
}
```

Save it through publishing-create --file, the participant tab, publishingSave('create', input), or the declared MCP action. The actual returned project ID and revision become the selection for later actions.

The cutoff is retained planning context. The application shows actual status and dates and preserves all financial records, but it does not invent the official PWYF eligible universe or reproduce its sampling. The 2026 current-activity window and the separate publication-frequency window have different rules. Use the original assessor's selected activities and feedback when supplied.

### 2. Retain complete feedback and evidence

The feedback intake contract is UTF-8 CSV with unique columns and these required headings:

```csv
finding_id,activity_id,indicator_id,finding,priority,owner,due_date
```

The first four columns are required. priority is normal or blocking; due_date, if present, is YYYY-MM-DD. An empty activity_id denotes organisation-level feedback. indicator_id selects the original installed reference's indicator ID. Every selected activity must belong to the saved cohort.

The application retains the complete original CSV, every input column, every row, its original line number, and each resulting finding. It rejects a truncated row, duplicate header, repeated finding ID, or activity outside the cohort.

PWYF has not promised this application's CSV layout. If original feedback arrives in a workbook, PDF or another format, retain that original file as evidence and prepare a complete explicit row mapping into this contract. Record the original sheet/page/row in an additional CSV column. Do not present locally authored review notes as PWYF-issued findings.

Feedback and evidence files have a 16 MiB limit each. There is no first-page sampling. Larger files require an explicit source handling decision rather than silent truncation. A full request may contain up to 64 MiB of JSON.

For original file intake through the CLI, put the entire file in fileBase64 and retain the request:

```json
{
  "requestId": "participant-feedback-20261012-001",
  "actor": "Named publishing operator",
  "id": "returned-project-sha256",
  "expectedRevision": 1,
  "filename": "original-feedback.csv",
  "fileBase64": "base64-of-the-complete-file"
}
```

Evidence additionally selects filename, media, label and optional sourceUrl. The UI reads the entire selected file. MCP can consume a host-declared complete source-file handle without putting a local path in model-generated arguments.

### 3. Assign and decide each finding

Each finding remains open, planned, resolved or explicitly deferred. Save the owner, decision note and any exact evidence IDs. A resolution or deferral requires a substantive note. The source finding and its original row are preserved.

Every save uses a stable requestId, the named actor, the project ID and expectedRevision. A concurrent save returns the current revision rather than overwriting another operator's work.

The application uses named operator/reviewer records. These names provide attribution inside the retained workflow; they are not a separate organisation identity provider. The original private host's access controls govern who can operate it.

### 4. Review a precise correction

Inspect the current candidate's original activity and field hashes. Corrections can:

- Change a title, description, participating-organisation narrative or document title while preserving the selected narrative's language.
- Add a distinct-language narrative with publisher-approved wording.
- Correct a participating-organisation reference supplied by the publisher.
- Correct an existing document URL or MIME type.
- Add a real document link with title, language, categories and optional document date.

The form exposes the original field, narrative index, language and source text. It does not guess organisation identifiers, translate a publisher's statements, or infer a missing document.

A narrative correction contains kind, activityId, field, index, expectedSha256, narrativeIndex, expectedNarrativeSha256, text and language. A new narrative uses narrativeIndex:null and has no earlier narrative SHA. Document and organisation changes use their exact original field hash. A new document uses the exact whole activity hash.

The editor preserves complete UTF-8 source bytes outside the explicit changes. It does not reserialize the whole publisher document. Before returning a preview it verifies that activity order/IDs, reporting-organisation and activity attributes, financial groups, currencies, and activities/transactions/budgets/planned-disbursements counts remain unchanged.

Financial amounts, sector allocations, transaction classifications and budgets are not editable in this correction form. A publisher can supply a complete replacement edition through the original source intake; the application then retains the earlier edition and requires fresh comparison and review.

The read-only preview returns the entire correction audit, exact candidate SHA and a previewSha256. Applying a correction requires that same preview hash and selected revision. Another intervening save invalidates the preview.

Overlapping corrections are rejected. Make them as separate reviewed source revisions. The complete source and each candidate have a 32 MiB correction capacity; larger original files remain a separate publisher-intake decision.

### 5. Validate the actual candidate

Validation uses the full unchanged official IATI 2.03 XSD files and their local includes. The installed source manifest checks every schema and licence byte before use. The validator does not fetch a remote schema or resolve arbitrary DTDs/entities.

The result records VALID, INVALID or UNAVAILABLE, original source SHA/bytes, schema edition/manifest, observed engine and complete reported error log. A VALID XSD result is structural validation. Publication access, document quality, codelist interpretation, financial semantics and the independent assessment remain separate reviews.

The preserved full source can be corrected through the publisher's own system and reimported. Replacement must retain every activity in the explicitly agreed cohort; a cohort removal requires a separately agreed project rather than silently disappearing from the work.

A new candidate invalidates prior release/review and finance selection. Previously resolved findings become planned so that their resolution is checked against the new candidate.

### 6. Produce the original finance comparison

Prepare finance through publishing-finance. It calls the existing IATI portfolio builder for the baseline and candidate with the exact selected activity IDs. Both versions contain all three original native activity, transaction and budget datasets, financial reports and full source lineage.

Amounts remain exact decimal strings. Reporting organisation, hierarchy, currency, transaction type, budget type/status, period and value date remain separate. The operator does not add incompatible currencies or manufacture an exchange rate.

The complete original portfolio comparison records field changes, source coverage and selection differences. Candidate changes that are outside the content correction form remain visible in this native comparison.

### 7. Obtain separate review and release

A different named operator from the last editor reviews the exact candidate, feedback decisions, correction history, validation and native finance selection.

An accepted review requires:

- Actual VALID structural validation.
- The complete current baseline/candidate native finance comparison.
- Every original finding resolved or explicitly deferred with a note.
- A separate named reviewer and substantive decision note.

A needs-correction decision is saved with its original inputs and does not permit release. Later edits invalidate the earlier acceptance.

Release selects the accepted review, a label and a handover note. It retains its own immutable release ID and exact candidate SHA. publicationState remains READY_FOR_PUBLISHER.

The publisher operates its authorised existing publication system and stores its resulting receipt as new evidence when appropriate. This application does not use the participant's external credentials, update a registry, or equate a successful local release with a public publication.

### 8. Deliver, independently receive and reopen

Export the selected released revision. The ZIP contains:

| Member | Complete contents |
| --- | --- |
| participant.json / history.json / requests.json | Selected release, every immutable revision and every original request/input hash |
| publisher-release.xml / sources/*.xml | Exact candidate plus every referenced complete original source edition |
| feedback.csv / evidence.json / evidence/*.bin | Full decisions and every original feedback/evidence file |
| corrections.json / validation.json | Complete byte changes and actual XSD result |
| activities.csv | Complete candidate publisher census, including activities outside the selected cohort |
| portfolios/*.zip | Full original native finance portfolios, datasets, reports and comparisons |
| release.html | Printable named review and publisher handover |
| guides/* / schema/* | Operating guide, dated methodology and unchanged attributed schema/licence |
| manifest.json | Exact selection plus every member's size and SHA256 |

The selected cohort remains explicit in participant.json. activities.csv is the full publisher source census, so a receiving operator can see what the retained file contains without confusing that census with the agreed cohort.

Derived feedback.csv and activities.csv protect spreadsheet text cells: text beginning with a formula marker (=, +, -, or @ after leading whitespace), or beginning with a tab or line break, receives a leading apostrophe. Complete original feedback files, source XML and JSON retain the original unmodified text. Independent receiving derives the same protected CSV from those retained records before comparing its exact bytes.

Receive the ZIP in an independently initialised original IATI workspace using publishing-receive, the participant tab, publishingReceive, or merchant_source_import. Import validates every declared member and the exact complete member set, limits paths and types, verifies all source/evidence hashes, reconstructs each native finance portfolio and its reports, and checks source/schema validation.

For participant history, receiving derives each row through the same action code used by live work. It uses the exact original request, previous revision, complete source/evidence and retained native finance requests/results. A modified review decision, note, cohort, feedback field or correction cannot be paired with an unrelated saved outcome merely by updating a packet hash. The whole derived revision must match. Recorded times are retained observations, not newly manufactured execution timestamps.

Replaying the same complete import preserves existing matching revisions. Conflicting histories or reused request IDs with other inputs are rejected. Reopen the independent workspace and compare the selected release ID, candidate SHA, all revisions, original source count, evidence count and complete finance reports.

A delivery packet has a 4 GiB compressed/expanded ceiling, 16,384 members and 64 MiB per metadata file. Required native finance packets remain complete; they are not replaced with summaries. Plan receiving capacity for full temporary expansion, retained source/dataset copies and the working database.

## Original command reference

All commands use the existing prefix:

```sh
python3 "$SDK/iati/cli.py" --workspace "$PRIVATE_WORKSPACE" COMMAND ...
```

| Command | Selection |
| --- | --- |
| publishing-list / publishing-methodology | No extra argument |
| publishing-project / publishing-history | --id PROJECT [--revision N] |
| publishing-activities | --id PROJECT [--revision N] [--offset N] [--limit 1..200] |
| publishing-fields | --id PROJECT --activity ORIGINAL_ID [--revision N] |
| publishing-create / feedback / evidence / triage / correct / candidate / finance / review / release | --file COMPLETE_REQUEST_JSON |
| publishing-preview | --file JSON containing id, expectedRevision and patches |
| publishing-export | --id PROJECT [--revision N] --out ABSOLUTE_ZIP |
| publishing-receive | --file COMPLETE_ZIP |

Each command named after publishing- in the table uses that full prefix. For example, the feedback command is publishing-feedback.

Preserve a request file before dispatch. If a CLI reply is lost, use the original HTTP request lookup or reopen the project/history, then repeat the exact retained request ID and body. Do not construct a new request to guess whether the previous save happened.

## HTTP and typed Node interfaces

The original authenticated server exposes /api/iati/publishing/. GET routes are context, methodology, projects, project, history, request, activities, fields, export, feedback-template, source and evidence. POST routes are create, feedback, evidence, triage, preview, correct, candidate, finance, review, release and binary receive.

Use id plus optional revision for exact participant history, activities and fields. Omitting revision selects the latest candidate. Supplying it selects that exact historical candidate for both activity titles/documents and full field values; each response reports its source ID and revision. The browser carries its selected revision through those reads. The source download can select baseline or candidate. The original bearer token remains in the private connection.

IatiWorkspaceClient exposes publishingContext, publishingMethodology, publishingProjects, publishingProject, publishingHistory, publishingRequest, publishingActivities, publishingFields, publishingPreview, publishingSave, publishingExport, publishingSource and publishingReceive. It retains the existing lifecycle and complete HTTP contracts.

## MCP

The original merchant source-workspace connection names an existing IATI console and declared original file handles. It neither starts a parallel console nor reads arbitrary model-supplied host paths.

The participant tools are:

- merchant_source_iati_publishing_context / methodology / projects / project / history / request.
- merchant_source_iati_publishing_activities / fields / preview.
- merchant_source_iati_publishing_save for the nine original action types.
- merchant_source_iati_publishing_file for a complete declared feedback/evidence file.
- merchant_source_iati_publishing_export for the complete original release ZIP.

Use merchant_source_file_read for verified full export chunks and merchant_source_import to receive the release into a separately declared original workspace. Preserve its readId/offset continuation and returned inventory snapshot. Closing MCP releases its own temporary readers and leaves the original console/workspace with their owner.

## Browser continuation and recovery

Before a mutating browser request, the participant tab stores its exact path, complete body, UUID and expected revision in IndexedDB, bound to the durable participant workspace identity. A reload can continue that same request. Successful replay returns the original saved revision.

A definite rejected request can be retained as a rejected input and deliberately revised after checking the server's original request lookup. A lost connection is not treated as proof that the action did not happen. The tab retains the original pending request until its outcome can be reconciled.

A full workspace backup retains this server-side request/history state. Browser IndexedDB is a local convenience, not the only record. On a new workstation, the original API/CLI can recover the saved project and request by their retained identities.

After a failed export or import, preserve its selected packet and workspace. Native source and finance imports are content addressed and replayable; the final participant history joins atomically. Repeat the same selected packet after restoring disk capacity. Never edit the saved database, historical request, source hash or released file to force a continuation.

## Included service and acceptance boundary

A practical pilot selects one publisher, one agreed cohort, a limited set of correction classes and named acceptance examples. Budget analysis, source mapping, corrections, support and receiving effort belong in the agreed delivery estimate. An engineering supplier should not imply that its own fee includes PWYF participation or guarantees a ranking.

Acceptance should demonstrate complete original source custody, reviewed corrections, actual validation and finance comparison, a separate named release, and independent full receiving/reopen. Keep any source limitations, deferred findings and later external publication receipts visible in that same work.

## Complete source and installed receiving

The [FCDO WADI receiving example](examples/fcdo-wadi-2026/RECEIVING.md) retains the entire original publisher file, its acquisition receipt, an explicit four-activity cohort, clearly labelled local feedback and precise correction inputs. Its preparer writes the full original Python receiver input with the selected source root and private operation paths. The original publisher's release and methodology dates remain in the adjacent source notice.

Use [the complete installed receiving procedure](receiving/PUBLISHING.md) to carry that same work through a real READY installation, the saved Applications library, browser, typed client, MCP and native CLI. It covers historical editions, complete XML/ZIP downloads, a retained-prefix download interruption, original request replay, independent full receiving and same-Application reopen. The returned customer ZIP includes the complete native release, expanded members, original core inputs/results, source/evidence, interface receipts and operating guides.

Prepare the core input after the original runtime producer returns its actual `runtime-ready.json`; use that result's `sourceRoot` so the core and installed interfaces select the same full product. Keep the original core operation ID and a distinct outer receiving operation ID on continuation. The [runtime guide](receiving/RUNTIME.md) documents the existing source/build/install/READY path. Each procedure retains original incomplete work and reconciles the same request before any retry. Only an actual completed result establishes that its receiving steps have passed.
