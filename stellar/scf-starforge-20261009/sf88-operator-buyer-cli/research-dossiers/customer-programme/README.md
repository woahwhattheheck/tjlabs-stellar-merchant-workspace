# Customer Research programme

This receiver turns a selected customer evidence workstream into an editable Research dossier, recorded citation decisions, a source chronology, literature editions, analyst workbooks and a complete customer handover.

It uses the existing Research HTTP client, dossier store, Crossref document validators, source bundles, citation-review API, Europe PMC workspace, Python Citation Delivery and Analysis workbooks, Merchant receiver, original browser UI and portable reader. The customer input selects the actual documents, questions, citation locations, findings, reviewer decisions and literature work. Each native request and its original result remains recoverable in the operation directory.

## Complete customer handover

The final ZIP opens at **START_HERE.html**. It includes:

- The complete current HTML and Markdown reports, editable portable dossier and full revision history.
- Each citation review's original request, decision, reason, affected evidence and finding dispositions, with before/reviewed/current Merchant reports and original browser downloads.
- Complete chronology JSON, HTML and Markdown, preserving original date wording, precision, offsets, unknowns, document identities and reviewer interpretations.
- Every original input document. The chronology's own source documents also travel in its native SourceBundle.
- Selected Europe PMC editions, original source pages, plans, records, reviews, RIS/CSV exports and comparisons, plus the complete selected library's original gzip portable.
- An original Python Citation Delivery and Analysis workbook handover for each selected review, with reports, workbook, Analysis workspace archive and native cold-receiving results.
- The complete selected engine source, original licence, all programme implementation files and operation guides.
- The complete file inventory, byte lengths and SHA256 values.

The programme extracts the actual ZIP and invokes **the receiver from the extracted engine**. That receiver opens the portable in a different editable native workspace and compares the complete selected metadata and revision history. COMPLETE.json beside the ZIP records the actual receiving result and final archive identity.

The archive contains source and deliverables. Installed Node, Python, browser binaries and packages are selected runtime prerequisites.

## Original engine and runtime

The integration cohort is the 1,444-file Research engine at standalone PR466 / 77a42db42b8158e718e568009c2fb7988072b6f3, with 20,803,666 original source bytes. Its materializer emits ENGINE_SOURCE.json, schema sf88-research-ris-engine-source-v1.

The programme accepts that original receiving manifest or the maintained distribution builder's manifest.json (schema stellar-forge.merchant-distribution-manifest.v1). For a built release, --engine-root selects the release's source/ directory and --engine-manifest selects its original manifest.json. The complete original manifest bytes remain retained. The programme verifies every original member and hash, total files/bytes, required Research/Python components and the original licence. When the selected release already includes customer-programme, its files must match the executing implementation exactly; each source member is packaged once. A source cohort assembled before this feature receives the complete implementation alongside its original source.

The selected engine also supplies the running command's native modules. Run from that same installed source tree, or assemble the complete customer-programme directory inside the retained original engine before invoking it. When --engine-root names a separate checkout, every selected original source member must also match the executing source tree byte for byte. This keeps native execution and the delivered engine on the same complete source selection.

Install all files listed by IMPLEMENTATION_FILES in selection.mjs at:

    stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-programme/

| Component | Selected prerequisite |
| --- | --- |
| Node | The original equipped engine runtime. The original complete receiving kit uses Node24 or newer. |
| Python | Python3.11 or newer. |
| Workbooks | The original workbooks extra pins openpyxl==3.1.5. The citation table/query/archive use SQLite and Python's standard library. |
| Browser | An installed Playwright or playwright-core module exposing chromium and its compatible Chromium executable; select both absolute paths. |
| Pattern engine | The original schema-pattern module lazily loads re2js for selected schema compilation. Record the installed version; the original source cohort declares no version pin. |
| Filesystem | Private absolute operation/workspace directories, with room for original source, outputs, ZIP, extraction and a second editable workspace. |
| Locks | The original private-lock helper and Python's Unix fcntl. |

Other source-preserved capabilities have optional dependencies: DuckDB, database drivers, paid transports, gRPC services and agent adapters retain their original interfaces. Keep the equipped runtime's dependency resolution available to both original and extracted source. The original engine source and runtime prerequisites remain separately identified.

## Run the complete programme

Pin the original selection and ENGINE_SOURCE.json, then run:

~~~bash
node /absolute/checkout/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-programme/programme.mjs \
  --selection /absolute/customer/selection.json \
  --selection-sha256 ACTUAL_SELECTION_SHA256 \
  --directory /absolute/private/customer-programme \
  --engine-root /absolute/checkout \
  --engine-manifest /absolute/checkout/ENGINE_SOURCE.json \
  --engine-manifest-sha256 ACTUAL_ENGINE_MANIFEST_SHA256 \
  --playwright-module /absolute/node_modules/playwright-core/index.mjs \
  --chromium /absolute/chromium \
  --python /absolute/python3 \
  --node /absolute/node
~~~

The maintained research-workspace and zotero-research distributions include the same entry as **starforge research-customer-programme**. Its arguments pass unchanged to programme.mjs. Inspect the source-owned registration with:

~~~bash
starforge registrations --command research-customer-programme
~~~

For a built release, substitute --engine-root /absolute/research-package/source and --engine-manifest /absolute/research-package/manifest.json in the full invocation above, using that manifest's actual SHA256. The original source exports also expose customer-programme, customer-programme/selection, customer-programme/chronology, customer-programme/europe-pmc and customer-programme/receiving under @tokenjunkielabs/starforge-merchant/buyer/research-dossiers.

For an existing dossier, pass --workspace /absolute/original/research-workspace and select its actual dossier ID and expected revision in the input. The programme starts and closes the original local listener; preserve one listener owner during the run. Its retained port keeps original Merchant operation bindings stable through continuation.

| Path under the selected operation directory | Complete result |
| --- | --- |
| COMPLETE.json | Final source/input binding, native dossier selection, archive identity and extracted-engine receiving. |
| Selected filename_stem plus .zip | Complete customer handover. |
| PACKAGE_BUILT.json | Archive and manifest identity. |
| PACKAGE_RECEIVED.json | Actual extraction and editable native receiving. |
| delivery/START_HERE.html | Customer entry page. |
| delivery/PROGRAMME.json | Native programme, reviewer choices and source identities. |
| operations/ | Original source, citation, EPMC, Python, Merchant, browser and export continuations. |
| workspace/ | Original Research workspace when an external one was not selected. |
| cold-receiving/ | Extracted archive and separately opened editable workspace. |

Keep the complete operation directory for recovery. Deliver the ZIP with its final completion/receiving record through the original project or opportunity.

## Commissioning input

Use ordinary UTF-8 JSON with schema sf88.research-customer-programme.v1. Its exact original bytes are pinned.

| Field | Required selection |
| --- | --- |
| operation_id | Stable identifier, up to100 letters/digits/dots/underscores/hyphens, starting with a letter or digit. |
| customer_label | Customer-facing delivery name, up to240 characters. |
| reviewer | Selected citation reviewer, up to200 characters. |
| dossier | New title/description or actual existing ID and expected revision. |
| questions | Ordered aliases, each choosing original text or an existing native question ID. |
| documents | Complete original descriptors with provenance and licence. |
| imports | Selected Crossref/Crossref-document editions or SourceBundles, bound to questions. |
| occurrences | Explicit citation locations bound to original imported rows or SourceBundle keys. |
| findings | Aliases bound to actual existing IDs or SourceBundle-authored findings. |
| reviews | Reviewer-authored decisions, evidence changes, finding changes and every affected finding's disposition. |
| chronology | Selected chronology document key and receiving question key. |
| analyst | {enabled:true,workbook:true}. |
| europe_pmc | Complete Europe PMC selection; see EUROPE_PMC.md. |
| output | filename_stem and maximum_archive_bytes, up to256 MiB. |
| volume | original_document_bytes, occurrences, selected_questions and selected_reviews, equal to the complete measured input. |

### Dossier and questions

~~~json
{
  "dossier": {
    "mode": "create",
    "title": "Customer evidence workstream",
    "description": "The reviewed customer brief."
  },
  "questions": [
    {"key":"effectiveness","text":"The customer's selected research question."}
  ]
}
~~~

An existing dossier uses {mode:'existing',id:actualDossier.id,expected_revision:actualDossier.revision}. A question is {key,id:actualQuestion.id} or {key,text:selectedQuestionText}, choosing exactly one. New dossiers have no existing question IDs.

Original createDossier and addQuestion allocate native UUIDs. The receiver retains the full original input/inventory and reconciles actual native records after a lost response. Existing content outside the selected questions and previous event histories remain intact.

### Complete documents

~~~js
{
  document_key: 'registered-update',
  filename: 'original-update-edition.json',
  file: '/absolute/customer/original-update-edition.json',
  bytes: measured.bytes,
  sha256: measured.sha256,
  media_type: 'application/json',
  source_url: originalUrlOrNull,
  source_kind: 'retained-provider-document',
  provenance: originalProvenanceObjectOrNull,
  license: originalLicenseDeclarationOrNull
}
~~~

Relative file paths resolve beside the original selection. Use a plain filename; document keys distinguish identical filenames. Each original file is fully read and checked before native work. Every EPMC import file must also be a selected original document.

source_kind is native-http-capture, retained-provider-document or customer-supplied-document. Preserve original observations, terms and entitlements. Saved documents retain their actual source representation.

The chronology JSON is another selected document. Its embedded document catalogue names the originals it cites and excludes itself, avoiding a self-hash. Only the transport file field is removed when comparing its catalogue with selected descriptors; all original provenance/licence fields match exactly. Retained original document copies remain available through continuation.

### Imports, citation locations and findings

~~~js
{
  key: 'clinical-context',
  document_key: 'original-context-bundle',
  question_key: 'effectiveness',
  provider: 'source-bundle',
  label: originalBundle.manifest.label,
  source_reference: selectedReference
}
~~~

Providers are crossref, crossref-document and source-bundle. Original validators own each schema. SourceBundles retain their manifest, source terms, file membership and authored findings; the selected label must match the manifest.

~~~js
{
  key: 'discussion-paragraph-4',
  import_key: 'clinical-context',
  source_key: originalSourceBundleKey,
  citation_locator: 'Discussion, paragraph4, citation12'
}
~~~

For a SourceBundle, source_key is the authored manifest key. For retained Crossref editions, it is the zero-based normalized record key as a decimal string. The receiver resolves actual source citations and retains their questionId, editionId and occurrenceId.

Several manuscript locations may reference one native occurrence; all supplied locations remain in the mapping. Distinct review contexts can use real authored SourceBundle entries. Native edition IDs are e_ plus64 hexadecimal characters and occurrences are o_ plus64 hexadecimal characters; both come from the original engine.

Finding aliases use either:

~~~js
{key:'economic-summary',native_id:actualExistingFinding.id}
~~~

or:

~~~js
{
  key:'effectiveness-summary',
  import_key:'clinical-context',
  source_key:originalBundleFinding.key
}
~~~

The latter resolves through the original atomic SourceBundle import's findingIds.

### Citation decisions

~~~js
{
  key: 'registered-update-review',
  request_id: selectedStableRequestId,
  actor: selectedReviewer,
  notice: {
    notice_doi: originalNoticeDoi,
    target_doi: originalTargetDoi,
    type: originalUpdateType
  },
  decision: selectedDecision,
  reason: reviewerReason,
  evidence_changes: selectedEvidenceChanges,
  finding_changes: selectedFindingChanges,
  finding_dispositions: selectedFindingDispositions
}
~~~

notice may instead be {id:actualNativeNoticeId}. DOI/type must resolve to one registered notice. The receiver reads its complete affected context and actual current fingerprint. Optional expected_fingerprint pins an earlier reviewed fingerprint.

actor equals reviewer. Request IDs contain8–100 letters/digits/underscores/hyphens and remain unique. Decisions are retain, revise, exclude or follow-up.

Evidence changes choose occurrence_key or occurrence_id and supply selected, classification and an optional note. Original classifications are supports, contradicts, background and unreviewed. The original per-occurrence review preserves other contexts for the same DOI.

Finding changes choose finding_key or finding_id and supply title, text and occurrence_keys or occurrence_ids. Dispositions choose finding_key or finding_id, disposition and reason; original dispositions are unchanged, revised, citation-removed and follow-up.

The native engine requires a disposition for every affected finding. A finding outside the selected questions receives an explicit unchanged or follow-up disposition, preserving its content. Evidence and finding edits stay within selected questions. All arrays are explicit, including empty arrays where selected.

## Chronology

The schema is commons.citation-chronology-selection.v1:

~~~js
{
  schema: 'commons.citation-chronology-selection.v1',
  documents: selectedOriginalDescriptors,
  subjects: selectedSubjects,
  facts: selectedDateFacts,
  interpretations: selectedReviewerInterpretations
}
~~~

A subject has subject_key, kind, label, document_keys and binding_key. Kinds are source-document, notice, citing-review, cited-occurrence, finding and report. Native occurrence/finding subjects require bindings. Available keys are dossier, question.<key>, import.<key>, occurrence.<key>, finding.<key> and notice.<review-key>.

A fact has fact_id, subject_key, event_kind, raw_text, normalized_value, precision, timezone, range_start, range_end, observation_kind, source_refs, unknown_reason, recorded_by and recorded_at.

| Component | Exact source contract |
| --- | --- |
| precision | instant, day, month, year, range or unknown. |
| Instant | Full date/time including seconds and explicit Z/UTC or matching known UTC offset. |
| Date only | Exactly declared calendar precision, with null timezone. |
| Range | Nullable endpoints {value,precision,timezone,inclusive}; at least one known endpoint. normalized_value/timezone are null. |
| Unknown | All normalized temporal fields are null; unknown_reason records the reason. |
| Source reference | Exact document_key, sha256, bytes, source_url and source locator. |
| recorded_at | Actual offset-bearing recording instant. |

Events are notice_publication, notice_effective, registered_update, source_retrieved, literature_search_completed, manuscript_submitted, manuscript_accepted, report_issued and reviewer_decision. Source observations are publisher-declared, provider-observed, customer-declared, reviewer-extracted or unknown.

An interpretation has interpretation_id, subject_key, fact_ids, reviewer, relation, reason and recorded_at. relation is the supplied before-notice, after-notice, overlaps-notice, uncertain or not-assessed choice. The module preserves the supporting facts and reviewer interpretation. It keeps unreported search dates, date-only sources and timezone uncertainty explicit.

The programme attaches exact chronology JSON, rendered HTML/Markdown and the original cited documents as an unselected background SourceBundle. The complete field validators are in chronology.mjs.

## Europe PMC and operation order

**EUROPE_PMC.md** specifies all query forms, source packets, linked continuation, same-query/scope-change comparison, complete-library selection, original request recovery and independent cold restore.

New dedicated workspaces select an empty original library. Existing libraries require actual ID/revision/full inventory pins. Original export contains the whole selected library, so commission that complete scope.

1. Retain the original selection and documents.
2. Reconcile the original dossier/questions and import selected Crossref/SourceBundle editions.
3. Receive the selected Europe PMC editions into the chosen questions.
4. Record citation decisions against the complete source set.
5. Attach the chronology once.
6. Receive saved reviews through original Python/Analysis, Merchant and browser interfaces.
7. Export the current dossier and exact history.
8. Package, extract and open using the included engine.

The CLI includes the native EPMC arm. Optional EPMC browser/Merchant callbacks are selected and provided through runCustomerProgramme's europePmcAdapters argument. The complete citation browser/Merchant receiving paths are included directly.

## Inspect and open the delivered archive

~~~bash
python3 receive-customer.py inspect \
  --archive /absolute/Customer_Research.zip \
  --sha256 ACTUAL_ARCHIVE_SHA256
~~~

~~~bash
python3 receive-customer.py receive \
  --archive /absolute/Customer_Research.zip \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --directory /absolute/private/customer-receiving \
  --result /absolute/private/customer-receiving/complete.json \
  --node /absolute/node \
  --python /absolute/python3
~~~

Open with the extracted source:

~~~bash
node /absolute/private/customer-receiving/package/engine/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-programme/receiving.mjs \
  --open --serve \
  --package-directory /absolute/private/customer-receiving/package \
  --workspace-directory /absolute/private/customer-receiving/editable-research
~~~

The opener prints the authenticated loopback URL to its local terminal. Public artifacts/receipts contain no live session. Stop the listener with Ctrl-C.

The original portable reader validates every revision and source blob. Reopening into the same receiving workspace preserves a later matching history extension; verification compares the delivered revision, allowing continued customer edits.

## Continuation

Retain the complete operation directory and use the same input/source selections. Native request IDs recover accepted original operations; native fingerprints and compare-and-swap revisions remain authoritative. A later phase does not substitute today's head for an earlier phase's selected base.

Python and Merchant recover the exact saved review. The browser uses the original UI and its actual page controls, preserving the original historical downloads. Complete download candidates are retained before publication so recovery continues the same actual export.

The ZIP writer checks original source while writing. Extraction validates every member and link, binds the exact archive selection and recovers its own unfinished ordinary file copies in a separate staging directory. Live connections, browser profiles and process logs stay in the private operation tree; the explicit completed delivery inventory determines the archive.

Source review follows the maintained APIs. Executed programmes retain their actual native review, workbook, browser, Merchant and portable results in PROGRAMME.json and COMPLETE.json together with complete source and input identities.

## Continue a completed programme with reviewed collaborator returns

The same installed programme now provides `--returns` for a complete post-delivery continuation. Select the exact completed baseline ZIP, actual original workspace/dossier/head and full collaborator archives. It prepares the original native comparisons and complete values, accepts only an explicit reviewed native request, recovers by the original request ID, then creates a successor editable ZIP and independently reopens it with the complete original source. The baseline programme and its scientific/analyst outputs remain intact.

Run `node programme.mjs --returns --help` from this directory. [RETURNING.md](RETURNING.md) contains the full source/selection schema, prepare → inspect → apply/recover commands, typed-proposal meanings, export identity checks, package/reopen instructions and recovery boundaries. `REVIEW_REQUIRED` identifies missing explicit decisions and does not impose a human-only approval gate; an authorized agent may inspect the actual values and author the exact native request. Source publication alone does not claim that a customer continuation has run.
