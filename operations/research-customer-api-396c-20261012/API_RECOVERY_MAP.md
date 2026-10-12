# Customer-selected Research: original API and recovery map

## Authority and implementation ownership

This is a source/API design handoff for the customer-selected Citation → Python Analysis → Europe PMC programme. Root owns the new orchestration; Actions owns this source qualification; Scout owns the Visible Analytics commissioning and case; Revenue retains the separate original RIS native caller. No customer programme or provider acquisition was dispatched for this map.

The source authority is the complete maintained 1,444-file engine in woahwhattheheck/tjlabs-stellar-merchant-workspace PR466, merge 77a42db42b8158e718e568009c2fb7988072b6f3. It preserves PR407's selected source plus the exact one-file PR438/2473 normalizer correction. Source bytes: 20,803,666. Envelope: 22,359,198 bytes, SHA256 abbef0fb4fb3b7a6bbc05585b65e37a4cee283d26788cba987c7fff8578155bd. ENGINE_SOURCE.json: 441,132 bytes, SHA256 eae819ab8d6cb7358c6870dfe0e103db5cd3208d67ce8c88b786a38ad88303d1.

API_SOURCE.json is a compact reading packet containing 43 complete original bodies, 857,342 source bytes. The packet itself is 897,503 bytes, SHA256 818109f4200d1965b5342985e124778f7f3b29fca61f8940c1c2ddc0862bdbba, Git blob 103840a1d5920ff5a48a8ea89cce56c77d135058 in that same repository. Every contained body was independently hashed after the packet's Git readback. This packet is not an installation closure; execution still uses the complete original engine and its existing materializer.

The customer adapter contract is Scout's proposed commons.visible-citation-integrity-commissioning.v1, private Commons blob 25199d2724e652913bb90bb52cba7343620b3d4f. Its programme/dossier/document/occurrence/review/chronology/analyst/Europe PMC/output selections are inputs to a new adapter, not additional fields accepted by the old native APIs. Keep the customer's title and description clean; store operation identities in the private run journal.

## 1. Initialize or attach to the real workspace

The original initializer is startDossierWorkspace from research-dossiers/server.mjs. Its basic call is startDossierWorkspace({directory, port: 0, clinicalTrialsPython: pythonExecutable, extractionPython: pythonExecutable}). The absolute normalized directory must be selected explicitly. openDossierStore creates its private dossiers/ and blobs/ directories. The server returns {origin,url,token,workspaceId,instanceId,api,...,close}. The authenticated URL contains a token; retain that only in the original private connection file and omit it from public manifests and delivery ZIPs.

The equivalent maintained process entry is: node server.mjs --dir /absolute/private/workspace --connection-file /absolute/private/connection.json [--port N] [--clinical-trials-python /absolute/python3] [--extraction-python /absolute/python3]. --crossref-state configures live Crossref acquisition and is unnecessary for receiving already-retained editions. Europe PMC is configured on the original listener; receiving documents does not call start() or fetch the provider.

ResearchWorkspaceClient accepts exactly one of connectionFile or url; directory and expectedWorkspaceId are optional identity constraints. Call status() before any mutation or export. researchWorkspaceId(directory) is 'research_' plus SHA256 of the absolute directory string. Therefore a fresh receiving directory has its own Research workspace identity even when it contains the same dossier ID and exact saved history. Record both source and receiving workspace IDs. The original Analysis archive instead retains its own persistent Analysis identity.

For a selected existing workspace, attach through its actual connection and expected workspace/dossier/question identities; do not launch a second listener or replace its source. For new work, use the original initializer inside a dedicated operation workspace. Preserve the chosen port when restarting a browser programme that retains IndexedDB under that origin; refuse an occupied foreign listener through the original server.

Original listing and history reads:

| Read | Actual client/store contract | Stable selection |
|---|---|---|
| Workspace status | client.status() | Validates the Research API schema and workspaceId. The original server separately exposes its instanceId for listener-lifetime reconciliation. |
| Dossier inventory | client.list({offset,limit,snapshot}) | First reply returns snapshot; later pages carry it. Inventory change is explicit. |
| Saved metadata | client.metadata(dossierId,{revision}) / store.getMetadata(id,{revision}) | Contains original question, edition, selection and finding IDs without fetching retained bodies. |
| Sections | client.section(id,{section,revision,offset,limit,questionId,query,selected}) | sections are questions, editions, selections, findings, sources and revisions. Keep revision on later pages. |
| Revision ledger | store.listRevisions(id,{revision}) or the revisions section | Original revision number, saved SHA, label and time. |
| Full source | client.source(id,{editionId,key,revision}) and source-file exports | Bind original edition, original row key and saved revision. |
| Revision comparison | client.compare(id,{before,after,section,offset,limit}) | Original questions, editions, source/finding changes; not a merge. |

## 2. Creation and ordinary edits have no server request ID

store.create({title,description,projection}) generates d_<UUID>, starts revision 1, and accepts no caller-chosen ID/requestId. addQuestion(id,{text,expectedRevision,projection}) generates q_<UUID>. addFinding likewise generates f_<UUID>. Ordinary updates use exact expectedRevision; commit writes the next immutable revision exclusively and links the previous saved state SHA.

Before create, persist the operation's exact customer selection plus the full baseline native dossier inventory. On an uncertain result, read the native inventory and original revision-one content. Recover only an unambiguous new native dossier matching the intended initial state in the dedicated operation workspace. Do not retry create merely because the response journal is missing, and do not insert a transport ID into its visible title.

Before adding a question or finding, persist the selected dossier, expected revision, full before-ID set and exact requested content. If the response is lost, inspect the actual revision expectedRevision+1, its prior link and the complete changed fields. Adopt the unique native ID only if the transition is the intended one. A different change or ambiguous creation is a reconciliation outcome, not permission to submit a new create or update with today's head.

The existing Python ResearchWorkspace implements this distinction already: edit(action,body,request_id=...) keeps an immutable local request and attempt journal with replay_safe=False. resume(request_id) refuses an uncertain started write with RESEARCH_RECONCILE_DOSSIER_BEFORE_NEW_WRITE. A completed retained result returns unchanged. Citation review and portable receive are separate replay-safe actions. Reuse this original journal where the orchestration uses Python.

Exact ordinary bodies: create title≤240 and description≤20,000; question text≤4,000; question notes≤100,000, status open|answered|parked; finding title≤240 and text≤100,000. These are native bounds, not a promise that every larger combined history or output fits.

## 3. Receive exact Crossref editions and customer context

Use validateCrossrefEdition for provider crossref and validateCrossrefDocumentEdition for provider crossref-document before receiving the complete original edition. Preserve its input bytes, query/scope, coverage and source metadata. client.receiveResearchFile(id,{file,sha256,questionId,label,provider,sourceReference,expectedRevision}) reads the original file (64 MiB limit), then sends rawText. It does not create a provider acquisition.

Generic store.receive chooses exactly one rawBytes/rawText/response. The edition ID derives from the question, provider, raw SHA and original intent ID. Its duplicate check is inside commit(), after the revision check. After a lost reply, read the saved metadata/retained edition to prove the intended edition before deciding a next action; simply replaying an old generic receive may return REVISION_CONFLICT. Labels/provenance should be checked as well as content where the customer manifest selects them.

buildCrossrefDocumentEdition({documents,query,label,dois,updatesDois}) is the maintained document-input builder. Each document carries filename, body Uint8Array or canonical bodyBase64, sourceUrl, role, provenance and retrievedAt. Optional supplied bodyBytes/bodySha256/document IDs are verified. Unknown retrievedAt remains null. No HTTP status/headers are invented for a retained document. Source roles require an official HTTPS api.crossref.org work/work-list URL whose requested identity and pagination agree with the body. Supporting and provenance documents stay retained separately.

The builder allows up to 2,000 documents, 16 MiB per body, 40 MiB aggregate raw input and 64 MiB edition output. Explicit dois and updatesDois are independent selections. Work-list/cursor/page gaps, projected fields, restricted update filters and missing DOI/update coverage remain PARTIAL. Representation variants keep all original documents and do not alone imply missing coverage. Edition order determines the latest received notice observation; baseline versus review order therefore belongs in the customer selection.

For customer-authored citation locators, chronology or notes, use the existing SourceBundle route rather than adding fields to citationReviewInput. createSourceBundle({manifestBytes,files:Map,manifestName}) retains the actual manifest bytes and every declared file. Its manifest schema is sf88-research-source-manifest-v1 and includes label, sourceTerms, sources[] with stable keys/original files and optional findings[] referring to sourceKeys. Native preview exposes its complete source/finding selection. receiveSourceBundle binds those exact bytes to one real question and commits its edition, selections and findings together.

SourceBundle receiving has a stronger replay seam: the same question and bundle SHA are found before CAS, so an exact repeat after later work recovers the original import. Send expectedBundleSha256 and the prepared expectedRevision. The original manifest/input remains immutable. Bounds: 64 MiB bundle, 48 MiB total original files, 1 MiB manifest, at most 2,048 sources/files and 1,000 findings.

## 4. Customer occurrence mapping must reflect the native model

A native occurrence is a saved edition plus its original row key. The engine computes its o_ ID and groups sources separately by DOI/URL/provider identity. Read these IDs from the original source/section/model result; preserve an input-key → native dossier/question/edition/occurrence/finding mapping. Multiple manuscript locators may honestly map to the same native occurrence. Do not manufacture o_ IDs from a convenient DOI or duplicate provider records to force a one-to-one map.

If distinct customer citation contexts need separate native occurrences, the original SourceBundle supports one real customer context per source key with its DOI and actual original files. citationUpdateModel collects occurrences from all projected providers, while validated Crossref editions supply registered notices. It can therefore link those retained customer-context occurrences to the original notice by DOI without pretending they are separate provider responses.

selectEvidence(id,{sourceId,...}) updates EVERY occurrence of that grouped source, including occurrences in other questions. Avoid it when the commission selects only some contexts. The atomic review's evidenceChanges addresses exact occurrenceId and can create a missing selection for those notice occurrences. updateSelection addresses an already-saved selection only. addFinding({sourceIds}) attaches all citations of each selected grouped source within that finding's question; the adapter must inspect those actual bindings rather than assert a narrower edition-specific association.

The original citation model matches every affected finding across the dossier, including findings outside the commissioned questions. A valid review requires a disposition for all of them. Preserve their content and surface them for explicit unchanged/follow-up disposition where appropriate; do not trim the native notice or fabricate a reviewer choice to satisfy the two-question commissioning limit.

## 5. Prepare and save complete original citation reviews

Read client.citationUpdates(id,{revision,offset,limit,status}) through all pages (limit≤100), then detail with noticeId at that same revision. Returned detail includes the grouped registered assertions, original source captures/documents, all evidence/finding bindings, fingerprint and saved reviews. A requested notice that has no retained original evidence remains unresolved; the adapter must not create a synthetic notice to finish its sequence.

The exact review body has only requestId, noticeId, expectedFingerprint, expectedRevision, actor, decision, reason, evidenceChanges, findingChanges and findingDispositions. requestId is 8–100 characters from A–Z/a–z/0–9/_/-. Decisions: retain, revise, exclude, follow-up. Evidence changes require occurrenceId, selected boolean, classification supports|contradicts|background|unreviewed and note. Finding changes require id, title, text and the entire occurrenceIds array. Dispositions require findingId, disposition unchanged|revised|citation-removed|follow-up and reason. Actor≤200, review reason≤20,000, evidence notes/finding text≤100,000. Arrays are individually bounded at 10,000 with no duplicate target IDs.

client.reviewCitationUpdate(id, request) is the original save. The engine validates the complete request, derives its canonical digest, and checks an existing requestId before the current-revision CAS. Exact repeat returns the same immutable review with duplicate:true even after later dossier changes. Changed content under the same request ID fails CITATION_REVIEW_REQUEST_CHANGED. A new request with a changed fingerprint/revision fails explicitly. The response's dossier metadata can be the current head while the returned review remains the original saved decision; bind completion to the entire saved review and its original/reviewed revisions, not just response.dossier.revision.

The native receipt includes the full request, requestSha256, review ID, originalRevision/originalRevisionSha256, reviewed revision, before/after fingerprint, original notice source snapshot, exact evidence/finding changes and every disposition. Chronology remains a separately retained SourceBundle/customer document: adding chronology fields directly to the strict request is invalid.

On transport/ambiguous response, keep the exact prepared body and its result state, read the original review history, and use that same request. Do not regenerate IDs, silently change the expected revision or choose fresh reviewer decisions. If the dossier genuinely changed, present the new revision/fingerprint and create an explicitly reviewed new selection; preserve the old request.

## 6. The Python phase is already customer-selectable

The Python entry examples/research_citation_analyst.py accepts --directory, --checkout, --connection, --workspace-id, --dossier, --request-file, --operation-id, optional --node, --current-revision, --wait-seconds (1–900), and --with-workbook. It consumes a complete ALREADY-SAVED citation review request. It proves the matching saved review at the selected current revision, receives the request into the original draft, replays that exact saved request once and verifies no new dossier revision. This can be called once per selected saved customer review in separate stable subdirectories; it is not intrinsically restricted to the fixed example DOI or two findings.

ResearchCitations exposes list/iter_notices/detail/validate/review/saved_request/recover/draft/delivery. CitationReviewDraft retains editable revisions, imported original request bytes and an immutable pending request; submit(...,recover=True) preserves that request. CitationDelivery.prepare selects the exact saved review and before/reviewed/current snapshots. export() produces the complete original revision reports and portables. receive() exercises the original readers in a separate target; archive() requires completed receiving and includes the full selection and artifacts. from_archive verifies and restores it for another customer receive.

run_citation_analysis(delivery,directory,checkout=...,node=...,wait_seconds=...) is a specific audit analysis. It creates complete before/reviewed/current rows for the selected notice, evidence, findings, source bindings, review index and coverage, with original selection and portable bytes retained alongside. It registers the original response-document source, previews/imports through AnalysisWorkspace, saves SQL, exports JSONL/CSV/SQLite, produces XLSX and handoff ZIP, exports the full Analysis workspace and cold-restores it.

This analysis does not perform economic modelling or invent an eligibility judgment. Its standard saved SQL uses max_rows=100000 and verifies that the typed export still contains all selected source rows. Workbook text previews are explicitly limited to 2,000 characters while full text/records remain in typed source exports. A customer selection exceeding those actual full-output checks must be reported; it must not be trimmed silently.

Additional customer-selected analyses should use original AnalysisWorkspace source/mapping/preview/import/query/export/workbook APIs and immutable request IDs. They are additional reviewed inputs, not parameters silently spliced into the audit helper. The packet includes the full AnalysisWorkspace/workbook/export/restore sources so root can compose those original APIs where the agreed scope needs them.

## 7. Europe PMC query, source and decision selections

Obtain a service once per selected action lifetime: const service = client.europePmc(); then const selected = await service.list(...). Each europePmc() call creates a fresh factory with a null selection closure. The first list sets that factory's X-Europe-Pmc-Selection header; use that same instance for the action and downloads, and compare selected.selection.library plus the actual epw_ workspace identity to the frozen customer choice.

saveQuery({requestId,actor,id?,expectedRevision,title,selection:{query,pageSize,maxPages,synonym},sourceTerms?}) retains the exact query version. New query expectedRevision is 0. query length≤12,000; pageSize1–1,000; maxPages1–10,000. prepare({requestId,actor,queryId,queryRevision,label,mode:'documents'|'live'}) returns plan.id, plan.sha256, payload and operation. Exact saved query/prepare/review request repeats return the original results; changed content under a saved request fails.

For already-retained data use mode:'documents' and importDocuments(operationId,{expectedPlanSha256,documents,stopReason?}) or importFile(operationId,{file,sha256,expectedPlanSha256}). The import file schema is stellar-forge.europe-pmc-import.v1 and contains exactly documents OR pages. documents are complete original sourceDocument records. pages is a convenience input for retained bytes with url, canonical bodyBase64, retainedAt and provenance; it explicitly creates kind retained-document with status/headers/retrievedAt null. It must not be used to invent an HTTP200 capture.

sourceDocument preserves the exact raw JSON and source provenance. Native page validation binds official request URL, query, cursor, pageSize, synonym, core/json result type and provider echo; full native records, repeated records and metadata variants are retained. Limits include 16 MiB per page, 24 MiB aggregate raw edition and 64 MiB edition output. Import preserves original collection order. Reimporting a READY operation must rebuild exactly the same edition; changed pages fail.

Use continueSearch(parent,{requestId,actor,label,expectedPlanSha256,expectedEditionSha256}) only for an explicitly selected continuation. It binds the original query version, parent plan/edition, next cursor and retained boundary page. chain() combines the original parts' coverage without hiding duplicates or record changes. Page-limited or stopped source remains partial. No new provider request follows from receiving selected pages; a live acquisition requires the customer's explicitly selected original operation.

review({requestId,actor,operationId,editionSha256,recordKey,expectedRevision,decision,note}) records metadata triage (include|exclude|uncertain|follow-up), not scientific eligibility. The record key is the original source:id and expectedRevision refers to that record's review history. receive(operationId,{requestId,actor,dossierId,questionId,label,expectedRevision,expectedPlanSha256,expectedEditionSha256}) retains the complete edition in the selected dossier and records a native receipt. The request is written before the receive; exact replay can recover the original edition/receipt after later dossier edits.

The receive wrapper permits label≤300 but the underlying original dossier permits edition labels≤240. Apply the stricter 240-character limit when binding a customer receive. Preserve the actual original plan ID/hash, edition SHA/bytes, question and returned dossier revision in the operation journal.

Export all selected pages via source(operationId,index,{boundary}) descriptor followed by exportSource with its body SHA/length; use records() and comparison() through complete pages. exportEdition supports edition, ris, csv and review. A comparison between different query scopes must be labelled scope comparison; differing query results alone do not establish longitudinal change.

## 8. Complete editable export and return semantics

Dossier exportStream/exportDossier includes every original revision through the selected revision and every referenced retained blob. Client exportDossier supports json, json.gz, html and md; revision-pinned reports keep the exact selected history. The complete JSON/streamed reader validates every saved source and operation transition before publishing missing revisions. Keep original files and receipt metadata, and never regenerate an already-published timestamped portable merely to fill a missing outer receipt.

reopen/reopenStream supports (a) a new target, (b) an identical-history prefix extending an existing dossier and (c) a shorter identical history leaving the newer local head intact. Every overlapping revision hash must match. Independently edited customer/local histories that diverge at the same revision fail PORTABLE_HISTORY_CONFLICT. There is no generic three-way dossier merge in these functions. A future returned-edit merge needs a separately reviewed feature; do not describe cold/prefix receiving as accepting arbitrary concurrent edits.

The maintained template-exchange layer already has substantial returned-workbook support. stageReturn binds the exact released workbook SHA and mapped cells; receive-return stores and recomputes the original comparison. stageReturnReview/review-return freezes keep-release, propose-correction and client-only choices. prepareExtractionDraft/acceptExtractionDraft send selected corrections to the original extraction engine, where they remain uncertain pending their assigned reviewers; publication is not overwritten. Its writer preserves original revision CAS and request recovery, including historical prepared-head verification after interruption. Reuse this existing domain-specific return flow when applicable. It does not implement a generic merge of divergent dossier histories.

Europe PMC exportWorkspace({requestId,actor}) freezes the ENTIRE selected library: library events/queries/reviews and all original operations, plans, state, editions, pages, boundary/failed pages and receive receipts. It has no query-subset export argument. Use a dedicated customer library/operation workspace, or explicitly select an authorized complete existing library for delivery. Do not silently filter its portable members to meet a two-query scope.

downloadWorkspace yields Europe_PMC_Workspace.json.gz, a gzip-compressed original JSON portable, not ZIP. restoreFile({requestId,actor,file,expectedSha256}) validates its source and restores a separately named received library, preserving the previous library. It also changes the controller's selected-library pointer; do not perform a customer cold-restore exercise against another operator's shared live listener. Use a separate receiving workspace and bind its real identity. Portable/decompressed limit is 128 MiB.

Research customer-updates is an existing commissioning/delivery layer. Exact runResearchCustomerDelivery signature is ({sender,receiver,directory,caseDefinition}={}); it expects original baseline/update/correction recipes. Its client provides list/record/preview/review/work/export and an original saved Europe PMC source-plan binding. createCustomerHandover and receiveCustomerHandover preserve full frozen reports, work review, original portable dossier and optional EPMC workspace. These are useful existing final-delivery primitives. They do not already implement the requested customer-selected Citation → Python → Europe PMC sequence.

## 9. Recommended orchestration joins

1. Freeze the customer's complete adapter selection, original document bytes/provenance and current engine manifest. Measure both source and intended complete output bounds; retain a full preflight report without mutating the dossier.
2. Attach to the explicit existing identity or initialize the dedicated customer operation workspace. Retain the full native before inventory and selected dossier revision. Reconcile generated question IDs through original saved revisions.
3. Validate/import the selected baseline and review Crossref editions in the declared order. Receive the actual customer occurrence/chronology SourceBundle where needed. Resolve every input key to the native IDs; retain unresolved mappings rather than drop them.
4. Read every selected notice's exact current revision/fingerprint and all affected findings. Freeze complete reviewer requests. Submit through reviewCitationUpdate and reconcile exact saved requests. Preserve before, reviewed and later current revision selections explicitly.
5. Run the existing Python analyst receiver per selected saved review, with the declared full workbook output. Any further Analysis queries/mappings are separately explicit original inputs. Preserve the original dossier head through this read/export/replay phase.
6. Save the selected EPMC queries/plans, receive the original pages, record the exact chosen metadata reviews, receive editions into their selected questions and save complete comparisons. Do not call live acquisition unless it is an actual authorized input.
7. Run browser and Merchant receiving against these actual selected workspaces and native saved requests. The fixed old helpers contain specific two-question/DOI/record-count assumptions; use their original attachment and export APIs, not their hard-coded acceptance recipes as the customer runner.
8. Capture final history after every selected mutation, then export complete revision reports, current dossier portable, full selected EPMC workspace, Python/Analysis/workbook artifacts and original engine/source/input manifests. Cold-receive separately, verify original bytes/identities/downloads and package every explicit completed output.

Each phase uses its own stable retained request/selection directory within the one customer programme. Reentry first verifies source, prior request and completed artifacts, then advances only unfinished work. Changed input, reviewer choice, output convention or source cohort is an explicit successor selection. A lost carrier/response is an unknown outcome to reconcile, not proof that its native mutation failed.

## 10. Exact selected source index

Read each complete body from API_SOURCE.json files[].content. The following paths are relative to the retained complete engine root; they are not a suggestion to fetch current evolving main.

| Path | Original Git blob | Bytes |
|---|---|---|
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/server.mjs | 48c194b7b8a89bff637bdb01e7157b8eb39da31b | 56677 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/dossier.mjs | 1d8c2e24f675168a540714889278a4776ed031e6 | 62286 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/workspace-client.mjs | b1519c6bdbd101f51a19fe23e6848e69f46413a1 | 25908 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/workspace-protocol.mjs | 77ad91102e9d3a31c5da9b6ce78865b3d935b808 | 7015 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/workspace-contracts.mjs | aca5ad6b33ddb1afdc5bcbb8e6e00b45dc366d34 | 664 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/workspace-files.mjs | fe38eb1349a29b89aa2849e594a6ef0117b6dc78 | 3127 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/portable.mjs | dae6154ded7a88c367e844807ecec664aca4200f | 8250 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/source-bundles.mjs | a98e2d2f89cb489e0e1cffa30735f6c2fb5f298c | 10436 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/source-inspection.mjs | 40ad36e20408ba04638f5a3ab38afc51eb9199b7 | 8916 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/normalize.mjs | 913bd1701968d2e1f26bf0f4d492319e35257741 | 11824 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/citation-updates.mjs | 1a397452a7e83a7f1a428c1749805ef5f34f9565 | 24856 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/crossref-documents.mjs | e7e40277df48cacddf00cf3b70823d3674a7d625 | 20519 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/crossref-workspace.mjs | d1818ce55c9de951dfb6d4895e5cb0a606c77c9b | 19245 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/crossref.mjs | 64cdf6619d2f957891334cf692d70c6dce702ca8 | 9874 |
| stellar/scf-starforge-20261009/sf30-seller-sdk/crossref/metadata.mjs | f2a2290a7a1bc0d9d6404b43289d6ec83388617f | 18777 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/research-bridge.mjs | c5532688e492b72a426e2b656033b6768c1beb34 | 12646 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/research-citation-delivery.mjs | ac0b3933e5ce040f4d5b5975075352e6fba5796d | 9782 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/examples/research_citation_analyst.py | 9a5c16ce8acb93f2bfabdc47f51130e738fc1ea7 | 11915 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/stellar_forge_buyer/research_workspace.py | 558f0b1c256e821b0e5624c284db8d6ffd8d2c33 | 22070 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/stellar_forge_buyer/research_citations.py | 6e763c9307e537677af8a9b4b5edda002da60d35 | 35604 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/stellar_forge_buyer/research_citation_analysis.py | d852fa1eb497fc686edb51a1c69d165ddc501e04 | 19204 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/stellar_forge_buyer/analysis_workspace.py | a5505e6750d9791dfb141e0bec4bfaa005a955f8 | 62392 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/stellar_forge_buyer/analysis_workbooks.py | 07da37b07c5a3c5790f9181f0ee1933df02472bc | 58296 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/stellar_forge_buyer/analysis_exports.py | fff696d7d9ad3a97bf8d7c20de260bc47c786a57 | 14395 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/stellar_forge_buyer/workspace_archive_receive.py | 19d8b1cbde7adcb61960b71c85335ec07b10cd6b | 21273 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/stellar_forge_buyer/runtime.py | 6618d0aa0715b4213532df73e8012e232e8f0a2e | 7473 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/europe-pmc-client.mjs | 0ea1c0068c127a39d48f4c6c0adcceaa3e9c6cb9 | 3912 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/europe-pmc-routes.mjs | 21f61fd8bd89d7d9e4808cd76346c58a01f260e4 | 11172 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/europe-pmc-workspace.mjs | 48f6b05ae0ad46fa8063902608c80cdcbd71f67a | 59377 |
| stellar/scf-starforge-20261009/sf30-seller-sdk/europe-pmc/source.mjs | bea6a43789b77b1c97b4451bfa4473049bbd7e35 | 27333 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-updates/client.mjs | 253a2df936fd7b61412c92d8519da176f65f8b2e | 4860 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-updates/contracts.mjs | ebddde996d6403d106835ba05b4a4a8b504d8f17 | 11926 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-updates/operator.mjs | 756aecf5a3ca3fb660114779005dcb7f84872388 | 20893 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-updates/receiving.mjs | 8ec4fba062f6cc18c4ee281bbd96ab8eeb9e9fb2 | 10352 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-updates/source-plans.mjs | e26e6f7af1c559c78c27302067e4c373d7806d9b | 2956 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-updates/files.mjs | 5b2074d9bbfec88221a4a0e5611d8d862c38eb72 | 10697 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-updates/store.mjs | 80197ea2449940e32585a2da41b7945c3a8ab3e4 | 12440 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/template-exchange/client.mjs | 1d12c5c6b218686d162b7882f27c4bc3ea3dfcfd | 4385 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/template-exchange/contracts.mjs | 9c1d936e38e098652272a7b52399f3ba315f03b5 | 10509 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/template-exchange/engine.mjs | 566af87dac4b02b79776e929425c4160e7b5b4f5 | 37945 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/citation-review-workflow.mjs | 70c358d322474c428b28780b5816510b498c2505 | 20713 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/europe-pmc-native.mjs | 08d8bf3a5f374860137725ea604dce6d8bae0469 | 8563 |
| stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/europe-pmc-journey.mjs | 6b0d10c901a1e033d48e8199f47e61392ed137b7 | 35885 |

All claims above are source inspection and design, not new native execution. The complete source packet and this map retain the original engine, current selection lineage and existing operator boundaries.
